#!/usr/bin/env node

import { existsSync, readFileSync } from "fs"

type JsonRecord = Record<string, unknown>

// Complete rule ID sets
const ALL_RULE_IDS = [
  "B001","B002","B003","B004","B005",
  "N001","N002",
  "R001","R002","R003","R004",
  "P001","P002","P003",
  "E001","E002","E003","E004","E005",
  "S001","S002","S003","S004",
  "D001","D002","D003",
  "L001","L002","L003","L004",
  "C001","C002",
]

const CROSS_DOC_RULE_IDS = ["X001","X002","X003","X004","X005"]

function isObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireString(obj: JsonRecord, key: string, label: string, errors: string[]): string | null {
  const value = obj[key]
  if (value === undefined || value === null || value === "") {
    errors.push(`${label}: ${key} is missing or empty`)
    return null
  }
  return String(value)
}

function requireArray(value: unknown, label: string, errors: string[]): JsonRecord[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${label}: must be an array, got ${typeof value}`)
    return null
  }
  const objects = value.filter(isObject)
  if (objects.length !== value.length) {
    errors.push(`${label}: all elements must be objects`)
  }
  return objects
}

function validateRuleResult(r: JsonRecord, label: string, errors: string[]): void {
  requireString(r, "ruleId", label, errors)
  requireString(r, "ruleName", label, errors)
  const status = requireString(r, "status", label, errors)
  requireString(r, "severity", label, errors)
  requireString(r, "details", label, errors)

  if (status === "FAIL") {
    const evidence = r.evidence
    if (!evidence || !isObject(evidence) || (!evidence.expected && !evidence.actual)) {
      errors.push(`${label}: FAIL result must have non-empty evidence (expected/actual)`)
    }
    const remediation = r.remediation ? String(r.remediation) : ""
    if (!remediation) {
      errors.push(`${label}: FAIL result must have non-empty remediation`)
    }
  }
}

function countByStatus(results: JsonRecord[]): { pass: number; fail: number; skip: number } {
  return results.reduce(
    (acc, r) => {
      const s = String(r.status ?? "")
      if (s === "PASS") acc.pass++
      else if (s === "FAIL") acc.fail++
      else if (s === "SKIP") acc.skip++
      return acc
    },
    { pass: 0, fail: 0, skip: 0 }
  )
}

function checkRuleIdCoverage(results: JsonRecord[], expectedSet: Set<string>, label: string, errors: string[]): void {
  const actualIds = new Set(results.map((r) => String(r.ruleId ?? "")))
  for (const id of expectedSet) {
    if (!actualIds.has(id)) {
      errors.push(`${label}: missing rule ${id}`)
    }
  }
  for (const id of actualIds) {
    if (!expectedSet.has(id)) {
      errors.push(`${label}: unexpected rule ${id}`)
    }
  }
}

function validateSingle(parsed: JsonRecord, errors: string[]): void {
  const ruleResults = requireArray(parsed.ruleResults, "results.json.ruleResults", errors)
  if (!ruleResults) return

  if (ruleResults.length !== 32) {
    errors.push(`results.json.ruleResults: expected 32 rules, got ${ruleResults.length}`)
  }

  const allRuleIdSet = new Set(ALL_RULE_IDS)
  checkRuleIdCoverage(ruleResults, allRuleIdSet, "results.json.ruleResults", errors)

  // Validate individual results
  ruleResults.forEach((r, i) => validateRuleResult(r, `ruleResults[${i}]`, errors))

  // Check summary counts (ruleResults contains FINAL post-correction statuses)
  const summary = isObject(parsed.summary) ? parsed.summary : null
  const corrections = Array.isArray(parsed.corrections) ? parsed.corrections.filter(isObject) : []
  if (summary) {
    const counts = countByStatus(ruleResults)
    const totalSummary = Number(summary.totalRules ?? 0)
    if (totalSummary !== ruleResults.length) {
      errors.push(`summary.totalRules mismatch: expected ${ruleResults.length}, got ${totalSummary}`)
    }
    if (Number(summary.passCount ?? -1) !== counts.pass) {
      errors.push(`summary.passCount mismatch: expected ${counts.pass}, got ${summary.passCount}`)
    }
    if (Number(summary.failCount ?? -1) !== counts.fail) {
      errors.push(`summary.failCount mismatch: expected ${counts.fail}, got ${summary.failCount}`)
    }
    if (Number(summary.skipCount ?? -1) !== counts.skip) {
      errors.push(`summary.skipCount mismatch: expected ${counts.skip}, got ${summary.skipCount}`)
    }
  }

  // Check corrections ruleId exists in ruleResults and correctedTo matches final status
  const ruleIdToResult = new Map<string, string>()
  ruleResults.forEach((r) => {
    const id = String(r.ruleId ?? "")
    if (id) ruleIdToResult.set(id, String(r.status ?? ""))
  })
  corrections.forEach((c, i) => {
    const corrRuleId = String(c.ruleId ?? "")
    if (corrRuleId && !ruleIdToResult.has(corrRuleId)) {
      errors.push(`corrections[${i}]: ruleId '${corrRuleId}' not found in ruleResults`)
    }
    const correctedTo = String(c.correctedTo ?? "")
    const finalStatus = ruleIdToResult.get(corrRuleId)
    if (correctedTo && finalStatus && correctedTo !== finalStatus) {
      errors.push(`corrections[${i}]: correctedTo '${correctedTo}' does not match ruleResults final status '${finalStatus}' for ruleId '${corrRuleId}'`)
    }
  })
}

function validateJoint(parsed: JsonRecord, errors: string[]): void {
  const documents = parsed.documents
  if (!isObject(documents)) {
    errors.push("results.json.documents: missing or not an object")
    return
  }

  const coaDoc = isObject((documents as JsonRecord).coa) ? (documents as JsonRecord).coa as JsonRecord : null
  const elnDoc = isObject((documents as JsonRecord).eln) ? (documents as JsonRecord).eln as JsonRecord : null

  if (!coaDoc) { errors.push("results.json.documents.coa: missing"); return }
  if (!elnDoc) { errors.push("results.json.documents.eln: missing"); return }

  const coaResults = requireArray(coaDoc.ruleResults, "coa.ruleResults", errors)
  const elnResults = requireArray(elnDoc.ruleResults, "eln.ruleResults", errors)
  const crossResults = requireArray(parsed.crossDocumentRules, "crossDocumentRules", errors)

  if (!coaResults || !elnResults || !crossResults) return

  // Check counts
  if (coaResults.length !== 32) {
    errors.push(`coa.ruleResults: expected 32, got ${coaResults.length}`)
  }
  if (elnResults.length !== 32) {
    errors.push(`eln.ruleResults: expected 32, got ${elnResults.length}`)
  }
  if (crossResults.length !== 5) {
    errors.push(`crossDocumentRules: expected 5, got ${crossResults.length}`)
  }

  // Check rule ID coverage
  const allRuleIdSet = new Set(ALL_RULE_IDS)
  checkRuleIdCoverage(coaResults, allRuleIdSet, "coa.ruleResults", errors)
  checkRuleIdCoverage(elnResults, allRuleIdSet, "eln.ruleResults", errors)
  const crossRuleIdSet = new Set(CROSS_DOC_RULE_IDS)
  checkRuleIdCoverage(crossResults, crossRuleIdSet, "crossDocumentRules", errors)

  // Validate individual results
  coaResults.forEach((r, i) => validateRuleResult(r, `coa.ruleResults[${i}]`, errors))
  elnResults.forEach((r, i) => validateRuleResult(r, `eln.ruleResults[${i}]`, errors))
  crossResults.forEach((r, i) => validateRuleResult(r, `crossDocumentRules[${i}]`, errors))

  // Check COA summary counts (ruleResults contains FINAL post-correction statuses)
  const coaSummary = isObject(coaDoc.summary) ? coaDoc.summary : null
  const coaCorrections = Array.isArray(coaDoc.corrections) ? coaDoc.corrections.filter(isObject) : []
  if (coaSummary) {
    const counts = countByStatus(coaResults)
    if (Number(coaSummary.totalRules ?? -1) !== 32) errors.push(`coa.summary.totalRules: expected 32, got ${coaSummary.totalRules}`)
    if (Number(coaSummary.passCount ?? -1) !== counts.pass) errors.push(`coa.summary.passCount mismatch: expected ${counts.pass}, got ${coaSummary.passCount}`)
    if (Number(coaSummary.failCount ?? -1) !== counts.fail) errors.push(`coa.summary.failCount mismatch: expected ${counts.fail}, got ${coaSummary.failCount}`)
    if (Number(coaSummary.skipCount ?? -1) !== counts.skip) errors.push(`coa.summary.skipCount mismatch: expected ${counts.skip}, got ${coaSummary.skipCount}`)
  }

  // Check ELN summary counts (ruleResults contains FINAL post-correction statuses)
  const elnSummary = isObject(elnDoc.summary) ? elnDoc.summary : null
  const elnCorrections = Array.isArray(elnDoc.corrections) ? elnDoc.corrections.filter(isObject) : []
  if (elnSummary) {
    const counts = countByStatus(elnResults)
    if (Number(elnSummary.totalRules ?? -1) !== 32) errors.push(`eln.summary.totalRules: expected 32, got ${elnSummary.totalRules}`)
    if (Number(elnSummary.passCount ?? -1) !== counts.pass) errors.push(`eln.summary.passCount mismatch: expected ${counts.pass}, got ${elnSummary.passCount}`)
    if (Number(elnSummary.failCount ?? -1) !== counts.fail) errors.push(`eln.summary.failCount mismatch: expected ${counts.fail}, got ${elnSummary.failCount}`)
    if (Number(elnSummary.skipCount ?? -1) !== counts.skip) errors.push(`eln.summary.skipCount mismatch: expected ${counts.skip}, got ${elnSummary.skipCount}`)
  }

  // Check top-level summary (all ruleResults already contain FINAL post-correction statuses)
  const topSummary = isObject(parsed.summary) ? parsed.summary : null
  const topCorrections = Array.isArray(parsed.corrections) ? parsed.corrections.filter(isObject) : []
  if (topSummary) {
    const allResults = [...coaResults, ...elnResults, ...crossResults]
    const counts = countByStatus(allResults)
    const total = allResults.length
    if (Number(topSummary.totalRules ?? -1) !== total) errors.push(`summary.totalRules: expected ${total}, got ${topSummary.totalRules}`)
    if (Number(topSummary.passCount ?? -1) !== counts.pass) errors.push(`summary.passCount mismatch: expected ${counts.pass}, got ${topSummary.passCount}`)
    if (Number(topSummary.failCount ?? -1) !== counts.fail) errors.push(`summary.failCount mismatch: expected ${counts.fail}, got ${topSummary.failCount}`)
    if (Number(topSummary.skipCount ?? -1) !== counts.skip) errors.push(`summary.skipCount mismatch: expected ${counts.skip}, got ${topSummary.skipCount}`)
  }

  // Check elnFiltering
  const elnFiltering = parsed.elnFiltering && isObject(parsed.elnFiltering) ? parsed.elnFiltering as JsonRecord : null
  if (elnFiltering) {
    const original = Number(elnFiltering.originalSampleCount ?? -1)
    const filtered = Number(elnFiltering.filteredSampleCount ?? -1)
    if (original >= 0 && filtered >= 0 && filtered > original) {
      errors.push(`elnFiltering: filteredSampleCount (${filtered}) > originalSampleCount (${original})`)
    }
  }

  // Check corrections — ruleId exists and correctedTo matches final ruleResults status
  const corrections = Array.isArray(parsed.corrections) ? parsed.corrections.filter(isObject) : []
  const allRuleIdToResult = new Map<string, string>()
  ;[...coaResults, ...elnResults, ...crossResults].forEach((r) => {
    const id = String(r.ruleId ?? "")
    if (id) allRuleIdToResult.set(id, String(r.status ?? ""))
  })
  corrections.forEach((c, i) => {
    const corrRuleId = String(c.ruleId ?? "")
    if (corrRuleId && !allRuleIdToResult.has(corrRuleId)) {
      errors.push(`corrections[${i}]: ruleId '${corrRuleId}' not found in any ruleResults`)
    }
    const correctedTo = String(c.correctedTo ?? "")
    const finalStatus = allRuleIdToResult.get(corrRuleId)
    if (correctedTo && finalStatus && correctedTo !== finalStatus) {
      errors.push(`corrections[${i}]: correctedTo '${correctedTo}' does not match ruleResults final status '${finalStatus}' for ruleId '${corrRuleId}'`)
    }
  })
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      [
        "Usage: validate-results.ts <results.json>",
        "",
        "Validates results.json structure, counts, and rule coverage.",
        "Checks: rule ID completeness, PASS+FAIL+SKIP consistency, FAIL evidence completeness.",
        "Supports both single (32 rules) and joint (69 rules) audit modes.",
        "",
        "Exit 0 = valid, Exit 1 = invalid (errors printed to stderr).",
      ].join("\n") + "\n"
    )
    process.exit(0)
  }

  const resultsPath = args[0]
  if (!resultsPath) {
    process.stderr.write("Error: <results.json> path required\n")
    process.exit(1)
  }

  if (!existsSync(resultsPath)) {
    process.stderr.write(`Error: ${resultsPath} not found\n`)
    process.exit(1)
  }

  let parsed: JsonRecord
  try {
    parsed = JSON.parse(readFileSync(resultsPath, "utf-8")) as unknown
    if (!isObject(parsed)) throw new Error("root must be an object")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`INVALID results.json: ${resultsPath}\n- JSON parse error: ${message}\n`)
    process.exit(1)
  }

  const errors: string[] = []
  const auditMode = String(parsed.auditMode ?? "single")

  if (auditMode !== "single" && auditMode !== "joint") {
    errors.push(`auditMode must be "single" or "joint", got "${auditMode}"`)
  }

  if (auditMode === "joint") {
    validateJoint(parsed, errors)
  } else {
    validateSingle(parsed, errors)
  }

  if (errors.length > 0) {
    process.stderr.write(`INVALID results.json: ${resultsPath}\n`)
    errors.forEach((e) => process.stderr.write(`- ${e}\n`))
    process.exit(1)
  }

  process.stdout.write(`OK: ${resultsPath} (${auditMode} mode, structure valid)\n`)
  process.exit(0)
}

main()
