#!/usr/bin/env node

import { existsSync, readFileSync } from "fs"

type JsonRecord = Record<string, unknown>

const EXPECTED_PHASES = [
  { phase: 0, name: "pdfConvert" },
  { phase: 1, name: "classify" },
  { phase: 2, name: "docExtract" },
  { phase: 3, name: "limsData" },
  { phase: 4, name: "deterministicRules" },
  { phase: 5, name: "semanticRules" },
  { phase: 6, name: "merge" },
  { phase: 7, name: "summary" },
] as const

const JOINT_EXPECTED_PHASES = [
  { phase: "0a", name: "pdfConvert" },
  { phase: "0b", name: "pdfConvert" },
  { phase: "1a", name: "classify" },
  { phase: "1b", name: "classify" },
  { phase: "2a", name: "docExtract" },
  { phase: "2b", name: "docExtract" },
  { phase: 3, name: "limsData" },
  { phase: "3.5", name: "elnFiltering" },
  { phase: "4a", name: "deterministicRules" },
  { phase: "4b", name: "deterministicRules" },
  { phase: "5a", name: "semanticRules" },
  { phase: "5b", name: "semanticRules" },
  { phase: "5c", name: "crossDocumentRules" },
  { phase: 6, name: "merge" },
  { phase: 7, name: "summary" },
] as const

const ISO_WITH_TZ = /(Z|[+-]\d{2}:\d{2})$/
const VALID_STATUS = new Set(["PASS", "FAIL", "SKIP"])
const VALID_SEVERITY = new Set(["severe", "warning", "info"])
const VALID_OVERALL_RESULT = new Set(["PASS", "FAIL", "CONDITIONAL_PASS"])
const VALID_PHASE0_MODES = new Set(["convert", "passthrough"])
const VALID_PHASE3_METHODS = new Set(["aggregated", "individual", "unavailable"])
const VALID_DEPENDENCY_STATUS = new Set(["available", "degraded", "unavailable"])
const VALID_EXECUTION_MODES = new Set(["rule-engine", "inline-fallback"])
const VALID_VALIDATION_RESULTS = new Set(["OK", "INVALID"])
const VALID_FILTER_METHODS = new Set(["lims", "coa-sampleIds", "none", "unavailable"])
const PLACEHOLDER_MARKERS = [
  "generated from results.json",
  "replace with full docextract",
  "replace with actual response",
  "fill_me",
  "populated from results.json",
] as const

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: validate-session-log.ts <session-log.jsonl> [results.json]",
      "",
      "Validates session-log.jsonl structure and cross-checks:",
      "- Phase 4 results count is 20",
      "- Phase 5 results count is 12",
      "- Phase 6 counts and overallResult match Phase 4/5 details",
      "- Phase 6 corrections match sibling results.json corrections when available",
    ].join("\n") + "\n"
  )
}

function isObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asObject(value: unknown, label: string, errors: string[]): JsonRecord | null {
  if (!isObject(value)) {
    errors.push(`${label} must be an object`)
    return null
  }
  return value
}

function asArray(value: unknown, label: string, errors: string[]): unknown[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`)
    return null
  }
  return value
}

function requireString(obj: JsonRecord, key: string, label: string, errors: string[]): string | null {
  const value = obj[key]
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${label}.${key} must be a non-empty string`)
    return null
  }
  return value
}

function requireNumber(obj: JsonRecord, key: string, label: string, errors: string[]): number | null {
  const value = obj[key]
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push(`${label}.${key} must be a number`)
    return null
  }
  return value
}

function requireStringArray(value: unknown, label: string, errors: string[]): string[] | null {
  const items = asArray(value, label, errors)
  if (!items) return null
  const strings = items.filter((item): item is string => typeof item === "string")
  if (strings.length !== items.length) {
    errors.push(`${label} entries must all be strings`)
    return null
  }
  return strings
}

function findPlaceholderPaths(value: unknown, label: string): string[] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker)) ? [label] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findPlaceholderPaths(item, `${label}[${index}]`))
  }

  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, item]) => findPlaceholderPaths(item, `${label}.${key}`))
  }

  return []
}

function validateNoPlaceholders(value: unknown, label: string, errors: string[]): void {
  const placeholderPaths = findPlaceholderPaths(value, label)
  placeholderPaths.forEach((path) => {
    errors.push(`${path} contains scaffold placeholder text; replace with real execution evidence`)
  })
}

function hasNonSkipResults(results: unknown[] | null): boolean {
  return (results ?? []).some((result) => isObject(result) && result.status !== "SKIP")
}

function validateTimestamp(row: JsonRecord, label: string, errors: string[]): void {
  const ts = requireString(row, "timestamp", label, errors)
  if (!ts) return
  if (!ISO_WITH_TZ.test(ts) || Number.isNaN(Date.parse(ts))) {
    errors.push(`${label}.timestamp must be ISO-8601 with timezone`)
  }
}

function validateRuleResult(value: unknown, label: string, errors: string[]): void {
  const row = asObject(value, label, errors)
  if (!row) return
  requireString(row, "ruleId", label, errors)
  requireString(row, "ruleName", label, errors)
  const status = requireString(row, "status", label, errors)
  requireString(row, "details", label, errors)
  // severity is required for Phase 4 deterministic rules, optional for Phase 5 semantic summaries
  const severity = row.severity !== undefined ? String(row.severity) : null
  if (severity && !VALID_SEVERITY.has(severity)) {
    errors.push(`${label}.severity must be severe, warning, or info (got ${severity})`)
  }
  if (status && !VALID_STATUS.has(status)) {
    errors.push(`${label}.status must be PASS, FAIL, or SKIP`)
  }
}

function validateCorrection(value: unknown, label: string, errors: string[]): void {
  const row = asObject(value, label, errors)
  if (!row) return
  requireString(row, "ruleId", label, errors)
  const originalStatus = requireString(row, "originalStatus", label, errors)
  const correctedTo = requireString(row, "correctedTo", label, errors)
  requireString(row, "reason", label, errors)

  if (originalStatus && !VALID_STATUS.has(originalStatus)) {
    errors.push(`${label}.originalStatus must be PASS, FAIL, or SKIP`)
  }
  if (correctedTo && !VALID_STATUS.has(correctedTo)) {
    errors.push(`${label}.correctedTo must be PASS, FAIL, or SKIP`)
  }
}

function validateOutputFiles(files: unknown[], label: string, errors: string[]): void {
  if (files.length !== 3) {
    errors.push(`${label} must contain exactly 3 file paths`)
    return
  }

  const values = files.filter((item): item is string => typeof item === "string")
  if (values.length !== 3) {
    errors.push(`${label} entries must all be strings`)
    return
  }

  const hasResults = values.some((item) => item.startsWith("outputs/") && item.endsWith("-results.json"))
  const hasReport = values.some((item) => item.startsWith("outputs/") && item.endsWith("-audit-report.md"))
  const hasSession = values.some((item) => item.startsWith("outputs/") && item.endsWith("-session-log.jsonl"))

  if (!hasResults) errors.push(`${label} must include outputs/{reportNo}-results.json`)
  if (!hasReport) errors.push(`${label} must include outputs/{reportNo}-audit-report.md`)
  if (!hasSession) errors.push(`${label} must include outputs/{reportNo}-session-log.jsonl`)
}

function validatePhaseRow(row: JsonRecord, index: number, errors: string[]): void {
  const expected = EXPECTED_PHASES[index]
  const label = `line ${index + 1}`

  if (String(row.phase) !== String(expected.phase)) {
    errors.push(`${label}.phase must be ${expected.phase}`)
  }

  if (row.name !== expected.name) {
    errors.push(`${label}.name must be ${expected.name}`)
  }

  validateTimestamp(row, label, errors)

  switch (expected.phase) {
    case 0: {
      const input = asObject(row.input, `${label}.input`, errors)
      const output = asObject(row.output, `${label}.output`, errors)
      if (input) {
        requireString(input, "filePath", `${label}.input`, errors)
        requireString(input, "fileType", `${label}.input`, errors)
      }
      if (output) {
        requireNumber(output, "lineCount", `${label}.output`, errors)
        requireString(output, "method", `${label}.output`, errors)
        const mode = requireString(output, "mode", `${label}.output`, errors)
        if (mode && !VALID_PHASE0_MODES.has(mode)) {
          errors.push(`${label}.output.mode must be convert or passthrough`)
        }
      }
      break
    }
    case 1: {
      const output = asObject(row.output, `${label}.output`, errors)
      if (output) {
        requireString(output, "docType", `${label}.output`, errors)
        requireString(output, "docTypeChinese", `${label}.output`, errors)
      }
      break
    }
    case 2: {
      const data = asObject(row.data, `${label}.data`, errors)
      if (data) {
        validateNoPlaceholders(data, `${label}.data`, errors)
      }
      break
    }
    case 3: {
      const method = typeof row.method === "string" ? row.method : null
      if (!method || !VALID_PHASE3_METHODS.has(method)) {
        errors.push(`${label}.method must be aggregated, individual, or unavailable`)
      }
      const dependencyStatus = typeof row.dependencyStatus === "string" ? row.dependencyStatus : null
      if (!dependencyStatus || !VALID_DEPENDENCY_STATUS.has(dependencyStatus)) {
        errors.push(`${label}.dependencyStatus must be available, degraded, or unavailable`)
      }
      const calls = asArray(row.calls, `${label}.calls`, errors)
      if (!calls) break
      if (calls.length === 0) {
        errors.push(`${label}.calls must contain at least one attempted call`)
        break
      }
      calls.forEach((call, callIndex) => {
        const item = asObject(call, `${label}.calls[${callIndex}]`, errors)
        if (!item) return
        requireString(item, "tool", `${label}.calls[${callIndex}]`, errors)
        asObject(item.params, `${label}.calls[${callIndex}].params`, errors)
        const durationMs = requireNumber(item, "durationMs", `${label}.calls[${callIndex}]`, errors)
        const hasResponse = item.response !== undefined
        const hasError = item.error !== undefined
        if (!hasResponse && !hasError) {
          errors.push(`${label}.calls[${callIndex}] must contain response or error`)
          return
        }
        if (hasResponse) {
          const response = asObject(item.response, `${label}.calls[${callIndex}].response`, errors)
          if (response) validateNoPlaceholders(response, `${label}.calls[${callIndex}].response`, errors)
        }
        if (hasError) {
          const error = asObject(item.error, `${label}.calls[${callIndex}].error`, errors)
          if (error) validateNoPlaceholders(error, `${label}.calls[${callIndex}].error`, errors)
        }
        if (durationMs !== null && durationMs <= 0) {
          errors.push(`${label}.calls[${callIndex}].durationMs must be > 0 for a real attempted call`)
        }
      })
      break
    }
    case 4: {
      const input = asObject(row.input, `${label}.input`, errors)
      const output = asObject(row.output, `${label}.output`, errors)
      if (input) {
        requireString(input, "docType", `${label}.input`, errors)
        requireNumber(input, "testItemCount", `${label}.input`, errors)
        requireNumber(input, "limsDataSources", `${label}.input`, errors)
        const executionMode = requireString(input, "executionMode", `${label}.input`, errors)
        if (executionMode && !VALID_EXECUTION_MODES.has(executionMode)) {
          errors.push(`${label}.input.executionMode must be rule-engine or inline-fallback`)
        }
        if (input.degradedRules !== undefined) {
          requireStringArray(input.degradedRules, `${label}.input.degradedRules`, errors)
        }
      }
      if (!output) break
      const passCount = requireNumber(output, "passCount", `${label}.output`, errors)
      const failCount = requireNumber(output, "failCount", `${label}.output`, errors)
      const skipCount = requireNumber(output, "skipCount", `${label}.output`, errors)
      const results = asArray(output.results, `${label}.output.results`, errors)
      if (results && results.length !== 20) {
        errors.push(`${label}.output.results must contain exactly 20 rule results`)
      }
      if (passCount !== null && failCount !== null && skipCount !== null && passCount + failCount + skipCount !== 20) {
        errors.push(`${label}.output pass/fail/skip counts must sum to 20`)
      }
      results?.forEach((result, resultIndex) => {
        validateRuleResult(result, `${label}.output.results[${resultIndex}]`, errors)
      })
      if (input && results && input.executionMode === "rule-engine" && hasNonSkipResults(results)) {
        if (typeof input.testItemCount === "number" && input.testItemCount <= 0) {
          errors.push(`${label}.input.testItemCount must be > 0 for rule-engine runs with non-SKIP results`)
        }
        if (typeof input.limsDataSources === "number" && input.limsDataSources <= 0) {
          errors.push(`${label}.input.limsDataSources must be > 0 for rule-engine runs with non-SKIP results`)
        }
      }
      break
    }
    case 5: {
      const results = asArray(row.results, `${label}.results`, errors)
      if (!results) break
      if (results.length !== 12) {
        errors.push(`${label}.results must contain exactly 12 semantic rule results`)
      }
      results.forEach((result, resultIndex) => {
        validateRuleResult(result, `${label}.results[${resultIndex}]`, errors)
      })
      break
    }
    case 6: {
      const input = asObject(row.input, `${label}.input`, errors)
      const output = asObject(row.output, `${label}.output`, errors)
      if (input) {
        const deterministicCount = requireNumber(input, "deterministicCount", `${label}.input`, errors)
        const semanticCount = requireNumber(input, "semanticCount", `${label}.input`, errors)
        if (deterministicCount !== null && deterministicCount !== 20) {
          errors.push(`${label}.input.deterministicCount must be 20`)
        }
        if (semanticCount !== null && semanticCount !== 12) {
          errors.push(`${label}.input.semanticCount must be 12`)
        }
      }
      if (!output) break
      const totalRules = requireNumber(output, "totalRules", `${label}.output`, errors)
      const passCount = requireNumber(output, "passCount", `${label}.output`, errors)
      const failCount = requireNumber(output, "failCount", `${label}.output`, errors)
      const skipCount = requireNumber(output, "skipCount", `${label}.output`, errors)
      const overallResult = requireString(output, "overallResult", `${label}.output`, errors)
      if (totalRules !== null && totalRules !== 32) {
        errors.push(`${label}.output.totalRules must be 32`)
      }
      if (passCount !== null && failCount !== null && skipCount !== null && passCount + failCount + skipCount !== 32) {
        errors.push(`${label}.output pass/fail/skip counts must sum to 32`)
      }
      if (overallResult && !VALID_OVERALL_RESULT.has(overallResult)) {
        errors.push(`${label}.output.overallResult must be PASS, FAIL, or CONDITIONAL_PASS`)
      }

      const corrections = asArray(output.corrections, `${label}.output.corrections`, errors)
      if (corrections) {
        corrections.forEach((item, correctionIndex) => {
          validateCorrection(item, `${label}.output.corrections[${correctionIndex}]`, errors)
        })
      }
      break
    }
    case 7: {
      requireNumber(row, "mcpCallCount", label, errors)
      const overallResult = requireString(row, "overallResult", label, errors)
      if (overallResult && !VALID_OVERALL_RESULT.has(overallResult)) {
        errors.push(`${label}.overallResult must be PASS, FAIL, or CONDITIONAL_PASS`)
      }
      const dependencyStatus = asObject(row.dependencyStatus, `${label}.dependencyStatus`, errors)
      if (dependencyStatus) {
        const lims = requireString(dependencyStatus, "lims", `${label}.dependencyStatus`, errors)
        const ruleEngine = requireString(dependencyStatus, "ruleEngine", `${label}.dependencyStatus`, errors)
        if (lims && !VALID_DEPENDENCY_STATUS.has(lims)) {
          errors.push(`${label}.dependencyStatus.lims must be available, degraded, or unavailable`)
        }
        if (ruleEngine && !VALID_DEPENDENCY_STATUS.has(ruleEngine)) {
          errors.push(`${label}.dependencyStatus.ruleEngine must be available, degraded, or unavailable`)
        }
      }
      const reportGeneration = asObject(row.reportGeneration, `${label}.reportGeneration`, errors)
      if (reportGeneration) {
        requireString(reportGeneration, "command", `${label}.reportGeneration`, errors)
        requireNumber(reportGeneration, "exitCode", `${label}.reportGeneration`, errors)
        requireStringArray(reportGeneration.warnings, `${label}.reportGeneration.warnings`, errors)
        requireString(reportGeneration, "outputPath", `${label}.reportGeneration`, errors)
      }
      const sessionLogValidation = asObject(row.sessionLogValidation, `${label}.sessionLogValidation`, errors)
      if (sessionLogValidation) {
        requireString(sessionLogValidation, "command", `${label}.sessionLogValidation`, errors)
        requireNumber(sessionLogValidation, "exitCode", `${label}.sessionLogValidation`, errors)
        const result = requireString(sessionLogValidation, "result", `${label}.sessionLogValidation`, errors)
        if (result && !VALID_VALIDATION_RESULTS.has(result)) {
          errors.push(`${label}.sessionLogValidation.result must be OK or INVALID`)
        }
      }
      const files = asArray(row.outputFiles, `${label}.outputFiles`, errors)
      if (files) validateOutputFiles(files, `${label}.outputFiles`, errors)
      break
    }
  }
}

function getResultCounts(results: JsonRecord[]): { passCount: number; failCount: number; skipCount: number } {
  return results.reduce<{ passCount: number; failCount: number; skipCount: number }>(
    (acc, item) => {
      const status = item.status
      if (status === "PASS") acc.passCount += 1
      if (status === "FAIL") acc.failCount += 1
      if (status === "SKIP") acc.skipCount += 1
      return acc
    },
    { passCount: 0, failCount: 0, skipCount: 0 }
  )
}

function getOverallResult(results: JsonRecord[]): string {
  const hasSevereFail = results.some((item) => item.status === "FAIL" && item.severity === "severe")
  if (hasSevereFail) return "FAIL"

  const hasNonSevereFail = results.some((item) => item.status === "FAIL" && item.severity !== "severe")
  if (hasNonSevereFail) return "CONDITIONAL_PASS"

  return "PASS"
}

function normalizeCorrectionRuleIds(corrections: JsonRecord[]): string[] {
  return corrections
    .map((item) => (typeof item.ruleId === "string" ? item.ruleId.trim() : ""))
    .filter((item) => item !== "")
    .sort()
}

function inferResultsPath(sessionLogPath: string): string | null {
  if (!sessionLogPath.endsWith("-session-log.jsonl")) return null
  return sessionLogPath.replace(/-session-log\.jsonl$/, "-results.json")
}

function parseJsonFile(filePath: string, label: string, errors: string[]): JsonRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown
    return asObject(parsed, label, errors)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(`${label} is not valid JSON: ${message}`)
    return null
  }
}

function detectAuditMode(rows: JsonRecord[], resultsJson: JsonRecord | null): "single" | "joint" {
  if (resultsJson?.auditMode === "joint") return "joint"
  // Fallback: detect from session log — joint has 0a/0b/1a/1b sub-phases
  if (rows.length >= 15) return "joint"
  return "single"
}

function crossValidate(rows: JsonRecord[], sessionLogPath: string, resultsPath: string | null, errors: string[], auditMode: "single" | "joint"): void {
  if (auditMode === "joint") {
    crossValidateJoint(rows, resultsPath, errors)
    return
  }
  crossValidateSingle(rows, sessionLogPath, resultsPath, errors)
}

function crossValidateSingle(rows: JsonRecord[], sessionLogPath: string, resultsPath: string | null, errors: string[]): void {
  const phase4 = rows[4]
  const phase5 = rows[5]
  const phase6 = rows[6]
  const phase7 = rows[7]

  const phase4Output = asObject(phase4.output, "line 5.output", errors)
  const phase5Results = asArray(phase5.results, "line 6.results", errors)
  const phase6Output = asObject(phase6.output, "line 7.output", errors)

  const deterministicResults = phase4Output ? asArray(phase4Output.results, "line 5.output.results", errors) : null
  const corrections = phase6Output ? asArray(phase6Output.corrections, "line 7.output.corrections", errors) : null

  if (!deterministicResults || !phase5Results || !phase6Output || !corrections) return

  const phase4RuleResults = deterministicResults.filter(isObject)
  const phase5RuleResults = phase5Results.filter(isObject)
  const mergedResults = [...phase4RuleResults, ...phase5RuleResults]

  if (mergedResults.length !== 32) {
    errors.push(`Phase 4 + Phase 5 rule totals must equal 32; got ${mergedResults.length}`)
  }

  const counts = getResultCounts(mergedResults)

  // Apply corrections from Phase 6 to raw counts
  let adjustedPass = counts.passCount
  let adjustedFail = counts.failCount
  let adjustedSkip = counts.skipCount
  if (corrections) {
    corrections.filter(isObject).forEach((c) => {
      const orig = c.originalStatus
      const corrected = c.correctedTo
      if (orig === "SKIP" && corrected === "PASS") { adjustedPass += 1; adjustedSkip -= 1 }
      if (orig === "FAIL" && corrected === "PASS") { adjustedPass += 1; adjustedFail -= 1 }
      if (orig === "FAIL" && corrected === "SKIP") { adjustedFail -= 1; adjustedSkip += 1 }
    })
  }

  if (phase6Output.passCount !== adjustedPass) {
    errors.push(`Phase 6 passCount mismatch: expected ${adjustedPass} (raw=${counts.passCount}), got ${String(phase6Output.passCount)}`)
  }
  if (phase6Output.failCount !== adjustedFail) {
    errors.push(`Phase 6 failCount mismatch: expected ${adjustedFail} (raw=${counts.failCount}), got ${String(phase6Output.failCount)}`)
  }
  if (phase6Output.skipCount !== adjustedSkip) {
    errors.push(`Phase 6 skipCount mismatch: expected ${adjustedSkip} (raw=${counts.skipCount}), got ${String(phase6Output.skipCount)}`)
  }
  if (phase6Output.totalRules !== mergedResults.length) {
    errors.push(`Phase 6 totalRules mismatch: expected ${mergedResults.length}, got ${String(phase6Output.totalRules)}`)
  }

  // PHASE 1: Compute expected overallResult from session log (fallback)
  const sessionExpectedOverallResult = getOverallResult(mergedResults)

  // PHASE 2: If results.json is available, derive authoritative overallResult from it
  let authoritativeOverallResult = sessionExpectedOverallResult

  if (resultsPath && existsSync(resultsPath)) {
    const resultsJson = parseJsonFile(resultsPath, "results.json", errors)
    if (resultsJson) {
      const resultsRuleResults = asArray(resultsJson.ruleResults, "results.json.ruleResults", errors)
      if (resultsRuleResults && resultsRuleResults.length > 0) {
        authoritativeOverallResult = getOverallResult(resultsRuleResults.filter(isObject))
      }
    }
  }

  // Phase 6/7 overallResult checks: use authoritative result
  if (phase6Output.overallResult !== authoritativeOverallResult) {
    errors.push(`Phase 6 overallResult mismatch: expected ${authoritativeOverallResult}, got ${String(phase6Output.overallResult)}`)
  }
  if (phase7.overallResult !== authoritativeOverallResult) {
    errors.push(`Phase 7 overallResult mismatch: expected ${authoritativeOverallResult}, got ${String(phase7.overallResult)}`)
  }

  if (!resultsPath) return
  if (!existsSync(resultsPath)) {
    errors.push(`results.json not found for cross-check: ${resultsPath}`)
    return
  }

  const resultsJson = parseJsonFile(resultsPath, "results.json", errors)
  if (!resultsJson) return

  const resultsRuleResults = asArray(resultsJson.ruleResults, "results.json.ruleResults", errors)
  if (resultsRuleResults) {
    if (resultsRuleResults.length !== 32) {
      errors.push(`results.json.ruleResults must contain exactly 32 rule results`)
    }
    resultsRuleResults.forEach((result, index) => {
      validateRuleResult(result, `results.json.ruleResults[${index}]`, errors)
    })
  }

  const resultsCorrectionsRaw = resultsJson.corrections ?? []
  const resultsCorrections = asArray(resultsCorrectionsRaw, "results.json.corrections", errors)
  if (resultsCorrections) {
    resultsCorrections.forEach((correction, index) => {
      validateCorrection(correction, `results.json.corrections[${index}]`, errors)
    })

    const phase6CorrectionIds = normalizeCorrectionRuleIds(corrections.filter(isObject))
    const resultsCorrectionIds = normalizeCorrectionRuleIds(resultsCorrections.filter(isObject))
    if (phase6CorrectionIds.length !== resultsCorrectionIds.length) {
      errors.push(`Phase 6 corrections count mismatch with results.json: ${phase6CorrectionIds.length} vs ${resultsCorrectionIds.length}`)
    } else if (phase6CorrectionIds.join(",") !== resultsCorrectionIds.join(",")) {
      errors.push(`Phase 6 corrections ruleIds mismatch with results.json`)
    }
  }

  if (resultsJson.overallResult !== undefined && resultsJson.overallResult !== authoritativeOverallResult) {
    errors.push(`results.json.overallResult mismatch: expected ${authoritativeOverallResult}, got ${String(resultsJson.overallResult)}`)
  }

  const summary = resultsJson.summary !== undefined ? asObject(resultsJson.summary, "results.json.summary", errors) : null
  if (summary) {
    if (summary.passCount !== adjustedPass) {
      errors.push(`results.json.summary.passCount mismatch: expected ${adjustedPass} (raw=${counts.passCount}), got ${String(summary.passCount)}`)
    }
    if (summary.failCount !== adjustedFail) {
      errors.push(`results.json.summary.failCount mismatch: expected ${adjustedFail} (raw=${counts.failCount}), got ${String(summary.failCount)}`)
    }
    if (summary.skipCount !== adjustedSkip) {
      errors.push(`results.json.summary.skipCount mismatch: expected ${adjustedSkip} (raw=${counts.skipCount}), got ${String(summary.skipCount)}`)
    }
    if (summary.totalRules !== mergedResults.length) {
      errors.push(`results.json.summary.totalRules mismatch: expected ${mergedResults.length}, got ${String(summary.totalRules)}`)
    }
    const correctionCount = Array.isArray(resultsJson.corrections) ? resultsJson.corrections.length : 0
    if (summary.correctionCount !== undefined && summary.correctionCount !== correctionCount) {
      errors.push(`results.json.summary.correctionCount mismatch: expected ${correctionCount}, got ${String(summary.correctionCount)}`)
    }
  }

  const inferredResultsPath = inferResultsPath(sessionLogPath)
  if (inferredResultsPath && resultsPath !== inferredResultsPath && !existsSync(inferredResultsPath)) {
    errors.push(`inferred sibling results.json not found: ${inferredResultsPath}`)
  }
}

function crossValidateJoint(rows: JsonRecord[], resultsPath: string | null, errors: string[]): void {
  // rows layout: [0a,0b,1a,1b,2a,2b,3,3.5,4a,4b,5a,5b,5c,6,7]
  const phase4a = rows[8]
  const phase4b = rows[9]
  const phase5a = rows[10]
  const phase5b = rows[11]
  const phase5c = rows[12]
  const phase6 = rows[13]
  const phase7 = rows[14]

  const phase4aOutput = asObject(phase4a.output, "line 9.output", errors)
  const phase4bOutput = asObject(phase4b.output, "line 10.output", errors)
  const phase5aResults = asArray(phase5a.results, "line 11.results", errors)
  const phase5bResults = asArray(phase5b.results, "line 12.results", errors)
  const phase5cResults = asArray(phase5c.results, "line 13.results", errors)
  const phase6Output = asObject(phase6.output, "line 14.output", errors)

  const coaDet = phase4aOutput ? asArray(phase4aOutput.results, "line 9.output.results", errors) : null
  const elnDet = phase4bOutput ? asArray(phase4bOutput.results, "line 10.output.results", errors) : null
  const coaSem = phase5aResults?.filter(isObject) ?? []
  const elnSem = phase5bResults?.filter(isObject) ?? []
  const crossDoc = phase5cResults?.filter(isObject) ?? []

  if (coaDet && coaDet.length !== 20) errors.push("COA deterministicRules must contain exactly 20 results")
  if (elnDet && elnDet.length !== 20) errors.push("ELN deterministicRules must contain exactly 20 results")
  if (phase5aResults && coaSem.length !== 12) errors.push("COA semanticRules must contain exactly 12 results")
  if (phase5bResults && elnSem.length !== 12) errors.push("ELN semanticRules must contain exactly 12 results")
  if (phase5cResults && crossDoc.length !== 5) errors.push("crossDocumentRules must contain exactly 5 results")

  const coaDetFiltered = (coaDet ?? []).filter(isObject)
  const elnDetFiltered = (elnDet ?? []).filter(isObject)
  const coaMerged = [...coaDetFiltered, ...coaSem]
  const elnMerged = [...elnDetFiltered, ...elnSem]
  const allMerged = [...coaMerged, ...elnMerged, ...crossDoc]

  if (allMerged.length !== 69) {
    errors.push(`Joint merged rules must equal 69; got ${allMerged.length} (COA ${coaMerged.length} + ELN ${elnMerged.length} + Cross ${crossDoc.length})`)
  }

  if (coaMerged.length !== 32) errors.push(`COA merged rules must equal 32; got ${coaMerged.length}`)
  if (elnMerged.length !== 32) errors.push(`ELN merged rules must equal 32; got ${elnMerged.length}`)

  const counts = getResultCounts(allMerged)

  // Apply corrections from Phase 6 to raw counts
  const phase6Corrections = phase6Output ? asArray(phase6Output.corrections, "line 14.output.corrections", errors) : null
  let adjustedPass = counts.passCount
  let adjustedFail = counts.failCount
  let adjustedSkip = counts.skipCount
  if (phase6Corrections) {
    phase6Corrections.filter(isObject).forEach((c) => {
      const orig = c.originalStatus
      const corrected = c.correctedTo
      if (orig === "SKIP" && corrected === "PASS") { adjustedPass += 1; adjustedSkip -= 1 }
      if (orig === "FAIL" && corrected === "PASS") { adjustedPass += 1; adjustedFail -= 1 }
      if (orig === "FAIL" && corrected === "SKIP") { adjustedFail -= 1; adjustedSkip += 1 }
    })
  }

  if (phase6Output) {
    if (phase6Output.totalRules !== 69) errors.push(`Phase 6 totalRules must be 69; got ${String(phase6Output.totalRules)}`)
    if (phase6Output.passCount !== adjustedPass) errors.push(`Phase 6 passCount mismatch: expected ${adjustedPass} (raw=${counts.passCount}), got ${String(phase6Output.passCount)}`)
    if (phase6Output.failCount !== adjustedFail) errors.push(`Phase 6 failCount mismatch: expected ${adjustedFail} (raw=${counts.failCount}), got ${String(phase6Output.failCount)}`)
    if (phase6Output.skipCount !== adjustedSkip) errors.push(`Phase 6 skipCount mismatch: expected ${adjustedSkip} (raw=${counts.skipCount}), got ${String(phase6Output.skipCount)}`)
  }

  // PHASE 1: Compute expected overallResult from session log (fallback)
  const sessionExpectedOverallResult = getOverallResult(allMerged)

  // PHASE 2: If results.json is available, derive authoritative overallResult from it
  let authoritativeOverallResult = sessionExpectedOverallResult

  if (resultsPath && existsSync(resultsPath)) {
    const resultsJson = parseJsonFile(resultsPath, "results.json", errors)
    if (resultsJson) {
      // Extract ALL rule results from results.json (COA 32 + ELN 32 + cross-document 5)
      let resultsFromJson: JsonRecord[] = []
      const documents = asObject(resultsJson.documents, "results.json.documents", errors)
      if (documents) {
        const coaDoc = asObject(documents.coa, "results.json.documents.coa", errors)
        const elnDoc = asObject(documents.eln, "results.json.documents.eln", errors)
        if (coaDoc) {
          const coaRules = asArray(coaDoc.ruleResults, "results.json.documents.coa.ruleResults", errors)
          if (coaRules) resultsFromJson.push(...coaRules.filter(isObject))
        }
        if (elnDoc) {
          const elnRules = asArray(elnDoc.ruleResults, "results.json.documents.eln.ruleResults", errors)
          if (elnRules) resultsFromJson.push(...elnRules.filter(isObject))
        }
      }
      const crossRules = asArray(resultsJson.crossDocumentRules, "results.json.crossDocumentRules", errors)
      if (crossRules) resultsFromJson.push(...crossRules.filter(isObject))

      if (resultsFromJson.length > 0) {
        authoritativeOverallResult = getOverallResult(resultsFromJson)
      }
    }
  }

  // Phase 6/7 overallResult checks: use authoritative result
  if (phase6Output?.overallResult !== authoritativeOverallResult) {
    errors.push(`Phase 6 overallResult mismatch: expected ${authoritativeOverallResult}, got ${String(phase6Output?.overallResult)}`)
  }
  if (phase7.overallResult !== authoritativeOverallResult) {
    errors.push(`Phase 7 overallResult mismatch: expected ${authoritativeOverallResult}, got ${String(phase7.overallResult)}`)
  }

  if (!resultsPath || !existsSync(resultsPath)) {
    if (resultsPath) errors.push(`results.json not found for cross-check: ${resultsPath}`)
    return
  }

  const resultsJson = parseJsonFile(resultsPath, "results.json", errors)
  if (!resultsJson) return

  // Validate documents.coa.ruleResults (32) + documents.eln.ruleResults (32)
  const documents = asObject(resultsJson.documents, "results.json.documents", errors)
  if (documents) {
    const coaDoc = asObject(documents.coa, "results.json.documents.coa", errors)
    const elnDoc = asObject(documents.eln, "results.json.documents.eln", errors)
    if (coaDoc) {
      const coaRules = asArray(coaDoc.ruleResults, "results.json.documents.coa.ruleResults", errors)
      if (coaRules && coaRules.length !== 32) errors.push("results.json.documents.coa.ruleResults must be exactly 32")
    }
    if (elnDoc) {
      const elnRules = asArray(elnDoc.ruleResults, "results.json.documents.eln.ruleResults", errors)
      if (elnRules && elnRules.length !== 32) errors.push("results.json.documents.eln.ruleResults must be exactly 32")
    }
  }

  const crossRules = asArray(resultsJson.crossDocumentRules, "results.json.crossDocumentRules", errors)
  if (crossRules && crossRules.length !== 5) errors.push("results.json.crossDocumentRules must be exactly 5")

  const summary = resultsJson.summary !== undefined ? asObject(resultsJson.summary, "results.json.summary", errors) : null
  if (summary) {
    if (summary.totalRules !== 69) errors.push(`results.json.summary.totalRules must be 69; got ${String(summary.totalRules)}`)
    if (summary.passCount !== adjustedPass) errors.push(`results.json.summary.passCount mismatch: expected ${adjustedPass} (raw=${counts.passCount}), got ${String(summary.passCount)}`)
    if (summary.failCount !== adjustedFail) errors.push(`results.json.summary.failCount mismatch: expected ${adjustedFail} (raw=${counts.failCount}), got ${String(summary.failCount)}`)
    if (summary.skipCount !== adjustedSkip) errors.push(`results.json.summary.skipCount mismatch: expected ${adjustedSkip} (raw=${counts.skipCount}), got ${String(summary.skipCount)}`)
  }
}

function validateJointPhaseRow(row: JsonRecord, index: number, errors: string[]): void {
  const expected = JOINT_EXPECTED_PHASES[index]
  const label = `line ${index + 1}`

  if (String(row.phase) !== String(expected.phase)) {
    errors.push(`${label}.phase must be ${expected.phase}`)
  }

  if (row.name !== expected.name) {
    errors.push(`${label}.name must be ${expected.name}`)
  }

  validateTimestamp(row, label, errors)

  const phaseKey = String(expected.phase)

  // Phase 0a/0b: same as Phase 0
  if (phaseKey === "0a" || phaseKey === "0b") {
    const input = asObject(row.input, `${label}.input`, errors)
    const output = asObject(row.output, `${label}.output`, errors)
    if (input) {
      requireString(input, "filePath", `${label}.input`, errors)
      requireString(input, "fileType", `${label}.input`, errors)
    }
    if (output) {
      requireNumber(output, "lineCount", `${label}.output`, errors)
      requireString(output, "method", `${label}.output`, errors)
      const mode = requireString(output, "mode", `${label}.output`, errors)
      if (mode && !VALID_PHASE0_MODES.has(mode)) {
        errors.push(`${label}.output.mode must be convert or passthrough`)
      }
    }
    return
  }

  // Phase 1a/1b: same as Phase 1
  if (phaseKey === "1a" || phaseKey === "1b") {
    const output = asObject(row.output, `${label}.output`, errors)
    if (output) {
      requireString(output, "docType", `${label}.output`, errors)
      requireString(output, "docTypeChinese", `${label}.output`, errors)
    }
    return
  }

  // Phase 2a/2b: same as Phase 2
  if (phaseKey === "2a" || phaseKey === "2b") {
    const data = asObject(row.data, `${label}.data`, errors)
    if (data) {
      validateNoPlaceholders(data, `${label}.data`, errors)
    }
    return
  }

  // Phase 3: same as single mode
  if (phaseKey === "3") {
    const method = typeof row.method === "string" ? row.method : null
    if (!method || !VALID_PHASE3_METHODS.has(method)) {
      errors.push(`${label}.method must be aggregated, individual, or unavailable`)
    }
    const dependencyStatus = typeof row.dependencyStatus === "string" ? row.dependencyStatus : null
    if (!dependencyStatus || !VALID_DEPENDENCY_STATUS.has(dependencyStatus)) {
      errors.push(`${label}.dependencyStatus must be available, degraded, or unavailable`)
    }
    const calls = asArray(row.calls, `${label}.calls`, errors)
    if (!calls) return
    if (calls.length === 0) {
      errors.push(`${label}.calls must contain at least one attempted call`)
      return
    }
    calls.forEach((call, callIndex) => {
      const item = asObject(call, `${label}.calls[${callIndex}]`, errors)
      if (!item) return
      requireString(item, "tool", `${label}.calls[${callIndex}]`, errors)
      asObject(item.params, `${label}.calls[${callIndex}].params`, errors)
      const durationMs = requireNumber(item, "durationMs", `${label}.calls[${callIndex}]`, errors)
      const hasResponse = item.response !== undefined
      const hasError = item.error !== undefined
      if (!hasResponse && !hasError) {
        errors.push(`${label}.calls[${callIndex}] must contain response or error`)
      }
      if (hasResponse) {
        const response = asObject(item.response, `${label}.calls[${callIndex}].response`, errors)
        if (response) validateNoPlaceholders(response, `${label}.calls[${callIndex}].response`, errors)
      }
      if (hasError) {
        const error = asObject(item.error, `${label}.calls[${callIndex}].error`, errors)
        if (error) validateNoPlaceholders(error, `${label}.calls[${callIndex}].error`, errors)
      }
      if (durationMs !== null && durationMs <= 0) {
        errors.push(`${label}.calls[${callIndex}].durationMs must be > 0 for a real attempted call`)
      }
    })
    return
  }

  // Phase 3.5: elnFiltering
  if (phaseKey === "3.5") {
    const input = asObject(row.input, `${label}.input`, errors)
    if (input) {
      requireString(input, "elnScope", `${label}.input`, errors)
      requireNumber(input, "originalSampleCount", `${label}.input`, errors)
      const filterMethod = requireString(input, "filterMethod", `${label}.input`, errors)
      if (filterMethod && !VALID_FILTER_METHODS.has(filterMethod)) {
        errors.push(`${label}.input.filterMethod must be lims, coa-sampleIds, none, or unavailable`)
      }
    }
    const output = asObject(row.output, `${label}.output`, errors)
    if (output) {
      requireNumber(output, "filteredSampleCount", `${label}.output`, errors)
      requireStringArray(output.excludedSampleIds, `${label}.output.excludedSampleIds`, errors)
      requireStringArray(output.keptSampleIds, `${label}.output.keptSampleIds`, errors)
    }
    return
  }

  // Phase 4a/4b: same as Phase 4
  if (phaseKey === "4a" || phaseKey === "4b") {
    const input = asObject(row.input, `${label}.input`, errors)
    const output = asObject(row.output, `${label}.output`, errors)
    if (input) {
      requireString(input, "docType", `${label}.input`, errors)
      requireNumber(input, "testItemCount", `${label}.input`, errors)
      requireNumber(input, "limsDataSources", `${label}.input`, errors)
      const executionMode = requireString(input, "executionMode", `${label}.input`, errors)
      if (executionMode && !VALID_EXECUTION_MODES.has(executionMode)) {
        errors.push(`${label}.input.executionMode must be rule-engine or inline-fallback`)
      }
    }
    if (output) {
      const passCount = requireNumber(output, "passCount", `${label}.output`, errors)
      const failCount = requireNumber(output, "failCount", `${label}.output`, errors)
      const skipCount = requireNumber(output, "skipCount", `${label}.output`, errors)
      const results = asArray(output.results, `${label}.output.results`, errors)
      if (results && results.length !== 20) {
        errors.push(`${label}.output.results must contain exactly 20 rule results`)
      }
      if (passCount !== null && failCount !== null && skipCount !== null && passCount + failCount + skipCount !== 20) {
        errors.push(`${label}.output pass/fail/skip counts must sum to 20`)
      }
      results?.forEach((result, resultIndex) => {
        validateRuleResult(result, `${label}.output.results[${resultIndex}]`, errors)
      })
      if (input && results && input.executionMode === "rule-engine" && hasNonSkipResults(results)) {
        if (typeof input.testItemCount === "number" && input.testItemCount <= 0) {
          errors.push(`${label}.input.testItemCount must be > 0 for rule-engine runs with non-SKIP results`)
        }
        if (typeof input.limsDataSources === "number" && input.limsDataSources <= 0) {
          errors.push(`${label}.input.limsDataSources must be > 0 for rule-engine runs with non-SKIP results`)
        }
      }
    }
    return
  }

  // Phase 5a/5b: same as Phase 5
  if (phaseKey === "5a" || phaseKey === "5b") {
    const results = asArray(row.results, `${label}.results`, errors)
    if (!results) return
    if (results.length !== 12) {
      errors.push(`${label}.results must contain exactly 12 semantic rule results`)
    }
    results.forEach((result, resultIndex) => {
      validateRuleResult(result, `${label}.results[${resultIndex}]`, errors)
    })
    return
  }

  // Phase 5c: crossDocumentRules
  if (phaseKey === "5c") {
    const results = asArray(row.results, `${label}.results`, errors)
    if (!results) return
    if (results.length !== 5) {
      errors.push(`${label}.results must contain exactly 5 cross-document rule results`)
    }
    results.forEach((result, resultIndex) => {
      validateRuleResult(result, `${label}.results[${resultIndex}]`, errors)
    })
    return
  }

  // Phase 6: joint merge
  if (phaseKey === "6") {
    const input = asObject(row.input, `${label}.input`, errors)
    const output = asObject(row.output, `${label}.output`, errors)
    if (input) {
      requireNumber(input, "coaDeterministicCount", `${label}.input`, errors)
      requireNumber(input, "coaSemanticCount", `${label}.input`, errors)
      requireNumber(input, "elnDeterministicCount", `${label}.input`, errors)
      requireNumber(input, "elnSemanticCount", `${label}.input`, errors)
      requireNumber(input, "crossDocumentCount", `${label}.input`, errors)
    }
    if (output) {
      const totalRules = requireNumber(output, "totalRules", `${label}.output`, errors)
      const passCount = requireNumber(output, "passCount", `${label}.output`, errors)
      const failCount = requireNumber(output, "failCount", `${label}.output`, errors)
      const skipCount = requireNumber(output, "skipCount", `${label}.output`, errors)
      const overallResult = requireString(output, "overallResult", `${label}.output`, errors)
      if (totalRules !== null && totalRules !== 69) errors.push(`${label}.output.totalRules must be 69`)
      if (passCount !== null && failCount !== null && skipCount !== null && passCount + failCount + skipCount !== 69) {
        errors.push(`${label}.output pass/fail/skip counts must sum to 69`)
      }
      if (overallResult && !VALID_OVERALL_RESULT.has(overallResult)) {
        errors.push(`${label}.output.overallResult must be PASS, FAIL, or CONDITIONAL_PASS`)
      }
    }
    return
  }

  // Phase 7: same as single mode
  if (phaseKey === "7") {
    requireNumber(row, "mcpCallCount", label, errors)
    const overallResult = requireString(row, "overallResult", label, errors)
    if (overallResult && !VALID_OVERALL_RESULT.has(overallResult)) {
      errors.push(`${label}.overallResult must be PASS, FAIL, or CONDITIONAL_PASS`)
    }
    const dependencyStatus = asObject(row.dependencyStatus, `${label}.dependencyStatus`, errors)
    if (dependencyStatus) {
      const lims = requireString(dependencyStatus, "lims", `${label}.dependencyStatus`, errors)
      const ruleEngine = requireString(dependencyStatus, "ruleEngine", `${label}.dependencyStatus`, errors)
      if (lims && !VALID_DEPENDENCY_STATUS.has(lims)) {
        errors.push(`${label}.dependencyStatus.lims must be available, degraded, or unavailable`)
      }
      if (ruleEngine && !VALID_DEPENDENCY_STATUS.has(ruleEngine)) {
        errors.push(`${label}.dependencyStatus.ruleEngine must be available, degraded, or unavailable`)
      }
    }
    const reportGeneration = asObject(row.reportGeneration, `${label}.reportGeneration`, errors)
    if (reportGeneration) {
      requireString(reportGeneration, "command", `${label}.reportGeneration`, errors)
      requireNumber(reportGeneration, "exitCode", `${label}.reportGeneration`, errors)
      requireStringArray(reportGeneration.warnings, `${label}.reportGeneration.warnings`, errors)
      requireString(reportGeneration, "outputPath", `${label}.reportGeneration`, errors)
    }
    const sessionLogValidation = asObject(row.sessionLogValidation, `${label}.sessionLogValidation`, errors)
    if (sessionLogValidation) {
      requireString(sessionLogValidation, "command", `${label}.sessionLogValidation`, errors)
      requireNumber(sessionLogValidation, "exitCode", `${label}.sessionLogValidation`, errors)
      const result = requireString(sessionLogValidation, "result", `${label}.sessionLogValidation`, errors)
      if (result && !VALID_VALIDATION_RESULTS.has(result)) {
        errors.push(`${label}.sessionLogValidation.result must be OK or INVALID`)
      }
    }
    const files = asArray(row.outputFiles, `${label}.outputFiles`, errors)
    if (files) validateOutputFiles(files, `${label}.outputFiles`, errors)
    return
  }
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    printHelp()
    process.exit(0)
  }

  const sessionLogPath = args[0]
  if (!sessionLogPath) {
    printHelp()
    process.exit(1)
  }

  const explicitResultsPath = args[1] ?? null
  const inferredResultsPath = inferResultsPath(sessionLogPath)
  const resultsPath = explicitResultsPath ?? (inferredResultsPath && existsSync(inferredResultsPath) ? inferredResultsPath : null)

  // Detect audit mode from results.json first
  let auditMode: "single" | "joint" = "single"
  if (resultsPath && existsSync(resultsPath)) {
    try {
      const resultsJson = JSON.parse(readFileSync(resultsPath, "utf-8")) as JsonRecord
      if (resultsJson.auditMode === "joint") auditMode = "joint"
    } catch { /* fallback to single */ }
  }

  const expectedLineCount = auditMode === "joint" ? 15 : 8

  const content = readFileSync(sessionLogPath, "utf-8")
  const lines = content.split(/\r?\n/).filter((line: string) => line.trim() !== "")
  const errors: string[] = []

  if (lines.length !== expectedLineCount) {
    errors.push(`file must contain exactly ${expectedLineCount} non-empty JSONL lines; got ${lines.length}`)
  }

  const rows: JsonRecord[] = []
  lines.forEach((line: string, index: number) => {
    try {
      const parsed = JSON.parse(line) as unknown
      if (!isObject(parsed)) {
        errors.push(`line ${index + 1} must parse to a JSON object`)
        return
      }
      rows.push(parsed)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`line ${index + 1} is not valid JSON: ${message}`)
    }
  })

  if (rows.length === expectedLineCount) {
    if (auditMode === "joint") {
      rows.forEach((row, index) => validateJointPhaseRow(row, index, errors))
    } else {
      rows.forEach((row, index) => validatePhaseRow(row, index, errors))
    }
    crossValidate(rows, sessionLogPath, resultsPath, errors, auditMode)
  }

  if (errors.length > 0) {
    process.stderr.write(`INVALID session log: ${sessionLogPath}\n`)
    errors.forEach((error) => process.stderr.write(`- ${error}\n`))
    process.exit(1)
  }

  const suffix = resultsPath ? ` (cross-checked with ${resultsPath})` : ""
  process.stdout.write(`OK: ${sessionLogPath}${suffix}\n`)
}

main()
