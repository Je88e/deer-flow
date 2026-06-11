#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "fs"

type JsonRecord = Record<string, unknown>

// 确定性规则 ID 集合 (20 条)
const DETERMINISTIC_RULE_IDS = new Set([
  "B001", "B002", "B003", "B004", "B005",
  "N001",
  "R001", "R002", "R003", "R004",
  "P001", "P002", "P003",
  "E003", "E004", "E005",
  "S001", "S004",
  "L001", "L004",
])

// 语义规则 ID 集合 (12 条)
const SEMANTIC_RULE_IDS = new Set([
  "N002",
  "E001", "E002",
  "S002", "S003",
  "D001", "D002", "D003",
  "L002", "L003",
  "C001", "C002",
])

const CROSS_DOC_RULE_IDS = ["X001", "X002", "X003", "X004", "X005"]

function nowISO(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+08:00")
}

function isObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asObject(value: unknown, label: string): JsonRecord {
  if (!isObject(value)) throw new Error(`${label} must be an object`)
  return value
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function filterDeterministic(results: JsonRecord[]): JsonRecord[] {
  return results.filter((r) => DETERMINISTIC_RULE_IDS.has(String(r.ruleId ?? "")))
}

function filterSemantic(results: JsonRecord[]): JsonRecord[] {
  return results.filter((r) => SEMANTIC_RULE_IDS.has(String(r.ruleId ?? "")))
}

function countByStatus(results: JsonRecord[]): { passCount: number; failCount: number; skipCount: number } {
  return results.reduce(
    (acc, r) => {
      const s = String(r.status ?? "")
      if (s === "PASS") acc.passCount++
      else if (s === "FAIL") acc.failCount++
      else if (s === "SKIP") acc.skipCount++
      return acc
    },
    { passCount: 0, failCount: 0, skipCount: 0 }
  )
}

function applyCorrections(
  counts: ReturnType<typeof countByStatus>,
  corrections: JsonRecord[]
): ReturnType<typeof countByStatus> {
  const adjusted = { ...counts }
  for (const c of corrections) {
    const from = String(c.originalStatus ?? "")
    const to = String(c.correctedTo ?? "")
    if (from === to) continue
    if (from === "PASS") adjusted.passCount--
    else if (from === "FAIL") adjusted.failCount--
    else if (from === "SKIP") adjusted.skipCount--
    if (to === "PASS") adjusted.passCount++
    else if (to === "FAIL") adjusted.failCount++
    else if (to === "SKIP") adjusted.skipCount++
  }
  return adjusted
}

function buildPhaseRecord(phase: string | number, name: string, extra: JsonRecord): JsonRecord {
  return { phase, name, timestamp: nowISO(), ...extra }
}

function emitLine(line: JsonRecord): string {
  return JSON.stringify(line) + "\n"
}

/**
 * Derive report/output paths from resultsPath.
 * joint: outputs/{batchNo}-joint-results.json
 * single: outputs/{reportNo}-results.json
 */
function inferPaths(resultsPath: string, auditMode: "single" | "joint"): {
  resultsPath: string
  reportPath: string
  sessionLogPath: string
} {
  const base = resultsPath.replace(/-results\.json$/, "")
  if (auditMode === "joint") {
    return {
      resultsPath,
      reportPath: `${base}-audit-report.md`,
      sessionLogPath: `${base}-session-log.jsonl`,
    }
  }
  return {
    resultsPath,
    reportPath: `${base}-audit-report.md`,
    sessionLogPath: `${base}-session-log.jsonl`,
  }
}

function generateSingle(resultsJson: JsonRecord, paths: ReturnType<typeof inferPaths>): string[] {
  const lines: string[] = []
  const reportNo = String(resultsJson.reportNo ?? "UNKNOWN")
  const docType = String(resultsJson.docType ?? "UNKNOWN")
  const ruleResults = asArray(resultsJson.ruleResults ?? [], "results.json.ruleResults").filter(isObject)
  const detResults = filterDeterministic(ruleResults)
  const semResults = filterSemantic(ruleResults)
  const corrections = Array.isArray(resultsJson.corrections) ? resultsJson.corrections.filter(isObject) : []
  const metadata = isObject(resultsJson.metadata) ? resultsJson.metadata : {}

  const detCounts = countByStatus(detResults)
  const semCounts = countByStatus(semResults)
  const rawAllCounts = countByStatus(ruleResults)
  const allCounts = applyCorrections(rawAllCounts, corrections)
  const totalRules = ruleResults.length

  // Phase 0: pdfConvert (placeholder — results.json lacks source file info)
  lines.push(emitLine(buildPhaseRecord(0, "pdfConvert", {
    input: { filePath: "unknown", fileType: "unknown" },
    output: { lineCount: 0, method: "generated-from-results", mode: "passthrough" },
    note: "Phase 0 populated from results.json — update input.filePath and output.lineCount manually",
  })))

  // Phase 1: classify
  const docTypeMap: Record<string, string> = { COA: "检验报告/Test Report", ELN: "原始记录/Lab Notebook" }
  lines.push(emitLine(buildPhaseRecord(1, "classify", {
    output: { docType, docTypeChinese: docTypeMap[docType] ?? docType },
  })))

  // Phase 2: docExtract (summary only — cannot reconstruct full extract)
  lines.push(emitLine(buildPhaseRecord(2, "docExtract", {
    data: {
      _summary: "Generated from results.json — replace with full docExtract",
      docType,
      reportNo,
      batchNo: String(resultsJson.batchNo ?? ""),
      productName: String(resultsJson.productName ?? ""),
      specification: String(resultsJson.specification ?? ""),
      testItemCount: ruleResults.length > 0 ? "unknown" : 0,
    },
  })))

  // Phase 3: limsData
  const limsAvailable = metadata.limsAvailable !== false
  const method = limsAvailable ? "aggregated" : "unavailable"
  const depStatus = limsAvailable ? "available" : "unavailable"
  lines.push(emitLine(buildPhaseRecord(3, "limsData", {
    method,
    dependencyStatus: depStatus,
    calls: [
      {
        tool: "fetch_all_lims_data",
        params: { batchNo: String(resultsJson.batchNo ?? ""), reportNo },
        response: { _summary: "Generated from results.json — replace with actual response" },
        durationMs: 0,
      },
    ],
  })))

  // Phase 4: deterministicRules
  lines.push(emitLine(buildPhaseRecord(4, "deterministicRules", {
    input: {
      docType,
      testItemCount: 0,
      limsDataSources: 0,
      executionMode: metadata.ruleEngineAvailable !== false ? "rule-engine" : "inline-fallback",
    },
    output: {
      passCount: detCounts.passCount,
      failCount: detCounts.failCount,
      skipCount: detCounts.skipCount,
      results: detResults,
    },
  })))

  // Phase 5: semanticRules
  lines.push(emitLine(buildPhaseRecord(5, "semanticRules", {
    results: semResults,
  })))

  // Phase 6: merge
  lines.push(emitLine(buildPhaseRecord(6, "merge", {
    input: {
      deterministicCount: detResults.length,
      semanticCount: semResults.length,
    },
    output: {
      totalRules,
      passCount: allCounts.passCount,
      failCount: allCounts.failCount,
      skipCount: allCounts.skipCount,
      corrections,
      overallResult: resultsJson.overallResult ?? "FILL_ME",
    },
  })))

  // Phase 7: summary
  lines.push(emitLine(buildPhaseRecord(7, "summary", {
    mcpCallCount: 0,
    overallResult: resultsJson.overallResult ?? "FILL_ME",
    dependencyStatus: {
      lims: depStatus,
      ruleEngine: metadata.ruleEngineAvailable !== false ? "available" : "unavailable",
    },
    reportGeneration: {
      command: `npx tsx .claude/skills/scout-audit/scripts/generate-report.ts ${paths.resultsPath} ${paths.reportPath}`,
      exitCode: -1,
      warnings: [],
      outputPath: paths.reportPath,
    },
    sessionLogValidation: {
      command: `npx tsx .claude/skills/scout-audit/scripts/validate-session-log.ts ${paths.sessionLogPath} ${paths.resultsPath}`,
      exitCode: -1,
      result: "FILL_ME",
    },
    outputFiles: [paths.resultsPath, paths.reportPath, paths.sessionLogPath],
  })))

  return lines
}

function generateJoint(resultsJson: JsonRecord, paths: ReturnType<typeof inferPaths>): string[] {
  const lines: string[] = []
  const batchNo = String(resultsJson.batchNo ?? "UNKNOWN")
  const documents = asObject(resultsJson.documents ?? {}, "results.json.documents")
  const coaDoc = asObject(documents.coa ?? {}, "results.json.documents.coa")
  const elnDoc = asObject(documents.eln ?? {}, "results.json.documents.eln")

  const coaRuleResults = asArray(coaDoc.ruleResults ?? [], "coa.ruleResults").filter(isObject)
  const elnRuleResults = asArray(elnDoc.ruleResults ?? [], "eln.ruleResults").filter(isObject)
  const crossResults = asArray(resultsJson.crossDocumentRules ?? [], "crossDocumentRules").filter(isObject)

  const coaDet = filterDeterministic(coaRuleResults)
  const coaSem = filterSemantic(coaRuleResults)
  const elnDet = filterDeterministic(elnRuleResults)
  const elnSem = filterSemantic(elnRuleResults)

  const coaDetCounts = countByStatus(coaDet)
  const elnDetCounts = countByStatus(elnDet)

  const allResults = [...coaRuleResults, ...elnRuleResults, ...crossResults]
  const rawAllCounts = countByStatus(allResults)
  const corrections = Array.isArray(resultsJson.corrections) ? resultsJson.corrections.filter(isObject) : []
  const allCounts = applyCorrections(rawAllCounts, corrections)
  const metadata = isObject(resultsJson.metadata) ? resultsJson.metadata : {}

  const coaDocType = String(coaDoc.docType ?? "COA")
  const elnDocType = String(elnDoc.docType ?? "ELN")
  const docTypeMap: Record<string, string> = { COA: "检验报告/Test Report", ELN: "原始记录/Lab Notebook" }

  // Phase 0a: COA source prep
  lines.push(emitLine(buildPhaseRecord("0a", "pdfConvert", {
    input: { filePath: "unknown", fileType: "unknown" },
    output: { lineCount: 0, method: "generated-from-results", mode: "passthrough" },
    note: "COA Phase 0 populated from results.json — update input.filePath and output.lineCount manually",
  })))

  // Phase 0b: ELN source prep
  lines.push(emitLine(buildPhaseRecord("0b", "pdfConvert", {
    input: { filePath: "unknown", fileType: "unknown" },
    output: { lineCount: 0, method: "generated-from-results", mode: "passthrough" },
    note: "ELN Phase 0 populated from results.json — update input.filePath and output.lineCount manually",
  })))

  // Phase 1a: COA classify
  lines.push(emitLine(buildPhaseRecord("1a", "classify", {
    output: { docType: coaDocType, docTypeChinese: docTypeMap[coaDocType] ?? coaDocType },
  })))

  // Phase 1b: ELN classify
  lines.push(emitLine(buildPhaseRecord("1b", "classify", {
    output: { docType: elnDocType, docTypeChinese: docTypeMap[elnDocType] ?? elnDocType },
  })))

  // Phase 2a: COA docExtract
  lines.push(emitLine(buildPhaseRecord("2a", "docExtract", {
    data: {
      _summary: "COA — Generated from results.json; replace with full docExtract",
      docType: coaDocType,
      reportNo: String(coaDoc.reportNo ?? ""),
      batchNo: String(resultsJson.batchNo ?? ""),
    },
  })))

  // Phase 2b: ELN docExtract
  lines.push(emitLine(buildPhaseRecord("2b", "docExtract", {
    data: {
      _summary: "ELN — Generated from results.json; replace with full docExtract",
      docType: elnDocType,
      batchNo: null,
      elnScope: resultsJson.elnFiltering && isObject(resultsJson.elnFiltering)
        ? (resultsJson.elnFiltering as JsonRecord).elnScope ?? "multi-batch"
        : "multi-batch",
    },
  })))

  // Phase 3: limsData (shared)
  const limsJointAvailable = metadata.limsAvailable !== false
  const methodJoint = limsJointAvailable ? "aggregated" : "unavailable"
  const depStatusJoint = limsJointAvailable ? "available" : "unavailable"
  lines.push(emitLine(buildPhaseRecord(3, "limsData", {
    method: methodJoint,
    dependencyStatus: depStatusJoint,
    calls: [
      {
        tool: "fetch_all_lims_data",
        params: { batchNo, reportNo: String(coaDoc.reportNo ?? "") },
        response: { _summary: "Generated from results.json — replace with actual response" },
        durationMs: 0,
      },
    ],
  })))

  // Phase 3.5: elnFiltering
  const elnFiltering = resultsJson.elnFiltering && isObject(resultsJson.elnFiltering)
    ? resultsJson.elnFiltering as JsonRecord
    : null
  if (elnFiltering) {
    lines.push(emitLine(buildPhaseRecord("3.5", "elnFiltering", {
      input: {
        elnScope: elnFiltering.elnScope ?? "multi-batch",
        originalSampleCount: elnFiltering.originalSampleCount ?? 0,
        filterMethod: elnFiltering.filterMethod ?? "none",
        batchNo,
      },
      output: {
        filteredSampleCount: elnFiltering.filteredSampleCount ?? 0,
        excludedSampleIds: elnFiltering.excludedSampleIds ?? [],
        keptSampleIds: elnFiltering.keptSampleIds ?? [],
      },
    })))
  } else {
    // no-op placeholder
    lines.push(emitLine(buildPhaseRecord("3.5", "elnFiltering", {
      input: {
        elnScope: "single-batch",
        originalSampleCount: 0,
        filterMethod: "none",
        batchNo,
      },
      output: {
        filteredSampleCount: 0,
        excludedSampleIds: [],
        keptSampleIds: [],
      },
    })))
  }

  // Phase 4a: COA deterministic rules
  lines.push(emitLine(buildPhaseRecord("4a", "deterministicRules", {
    input: {
      docType: coaDocType,
      testItemCount: 0,
      limsDataSources: 0,
      executionMode: metadata.ruleEngineAvailable !== false ? "rule-engine" : "inline-fallback",
    },
    output: {
      passCount: coaDetCounts.passCount,
      failCount: coaDetCounts.failCount,
      skipCount: coaDetCounts.skipCount,
      results: coaDet,
    },
  })))

  // Phase 4b: ELN deterministic rules
  lines.push(emitLine(buildPhaseRecord("4b", "deterministicRules", {
    input: {
      docType: elnDocType,
      testItemCount: 0,
      limsDataSources: 0,
      executionMode: metadata.ruleEngineAvailable !== false ? "rule-engine" : "inline-fallback",
    },
    output: {
      passCount: elnDetCounts.passCount,
      failCount: elnDetCounts.failCount,
      skipCount: elnDetCounts.skipCount,
      results: elnDet,
    },
  })))

  // Phase 5a: COA semantic rules
  lines.push(emitLine(buildPhaseRecord("5a", "semanticRules", {
    results: coaSem,
  })))

  // Phase 5b: ELN semantic rules
  lines.push(emitLine(buildPhaseRecord("5b", "semanticRules", {
    results: elnSem,
  })))

  // Phase 5c: cross-document rules
  lines.push(emitLine(buildPhaseRecord("5c", "crossDocumentRules", {
    results: crossResults,
  })))

  // Phase 6: merge (joint)
  lines.push(emitLine(buildPhaseRecord(6, "merge", {
    input: {
      coaDeterministicCount: coaDet.length,
      coaSemanticCount: coaSem.length,
      elnDeterministicCount: elnDet.length,
      elnSemanticCount: elnSem.length,
      crossDocumentCount: crossResults.length,
    },
    output: {
      totalRules: allResults.length,
      passCount: allCounts.passCount,
      failCount: allCounts.failCount,
      skipCount: allCounts.skipCount,
      corrections,
      overallResult: resultsJson.overallResult ?? "FILL_ME",
      elnFiltering: elnFiltering ? {
        elnScope: elnFiltering.elnScope,
        originalSampleCount: elnFiltering.originalSampleCount,
        filteredSampleCount: elnFiltering.filteredSampleCount,
      } : {
        elnScope: "single-batch",
        originalSampleCount: 0,
        filteredSampleCount: 0,
      },
    },
  })))

  // Phase 7: summary
  lines.push(emitLine(buildPhaseRecord(7, "summary", {
    mcpCallCount: 0,
    auditMode: "joint",
    overallResult: resultsJson.overallResult ?? "FILL_ME",
    dependencyStatus: {
      lims: depStatusJoint,
      ruleEngine: metadata.ruleEngineAvailable !== false ? "available" : "unavailable",
    },
    reportGeneration: {
      command: `npx tsx .claude/skills/scout-audit/scripts/generate-report.ts ${paths.resultsPath} ${paths.reportPath}`,
      exitCode: -1,
      warnings: [],
      outputPath: paths.reportPath,
    },
    sessionLogValidation: {
      command: `npx tsx .claude/skills/scout-audit/scripts/validate-session-log.ts ${paths.sessionLogPath} ${paths.resultsPath}`,
      exitCode: -1,
      result: "FILL_ME",
    },
    outputFiles: [paths.resultsPath, paths.reportPath, paths.sessionLogPath],
  })))

  return lines
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: generate-session-log.ts <results.json> [session-log.jsonl] [--no-overwrite]",
      "",
      "Generates a session-log.jsonl skeleton from results.json.",
      "",
      "Arguments:",
      "  results.json         Path to the results.json file (single or joint mode).",
      "  session-log.jsonl    Output path for session log. Default: inferred from results.json path.",
      "  --no-overwrite       Do not overwrite existing session log file.",
      "",
      "Behavior:",
      "- Auto-detects auditMode from results.json (single=8 lines, joint=15 lines).",
      "- Phase 4/5/5c results are copied directly from results.json.",
      "- Phase 0/2 uses placeholders — update manually with source file info.",
      "- Phase 7 script execution results use FILL_ME placeholders.",
    ].join("\n") + "\n"
  )
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    printHelp()
    process.exit(0)
  }

  const resultsPath = args[0]
  if (!resultsPath) {
    printHelp()
    process.exit(1)
  }

  if (!existsSync(resultsPath)) {
    process.stderr.write(`Error: ${resultsPath} not found\n`)
    process.exit(1)
  }

  let parsed: JsonRecord
  try {
    parsed = JSON.parse(readFileSync(resultsPath, "utf-8")) as unknown
    if (!isObject(parsed)) throw new Error("JSON root must be an object")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Error: ${resultsPath} is not valid JSON: ${message}\n`)
    process.exit(1)
  }

  const auditMode: "single" | "joint" = parsed.auditMode === "joint" ? "joint" : "single"

  // Validate structure
  if (auditMode === "joint") {
    const documents = parsed.documents
    if (!documents || !isObject(documents)) {
      process.stderr.write("Error: joint results.json missing documents.coa/eln structure\n")
      process.exit(1)
    }
  } else {
    if (!parsed.ruleResults || !Array.isArray(parsed.ruleResults)) {
      process.stderr.write("Error: single results.json missing ruleResults array\n")
      process.exit(1)
    }
  }

  // Infer output path
  const defaultOutputPath = resultsPath.replace(/-results\.json$/, "-session-log.jsonl")
  const explicitOutputPath = args[1]
  const noOverwrite = args.includes("--no-overwrite")
  const outputPath = explicitOutputPath ?? defaultOutputPath

  if (noOverwrite && existsSync(outputPath)) {
    process.stderr.write(`Error: ${outputPath} already exists (use without --no-overwrite to overwrite)\n`)
    process.exit(1)
  }

  const paths = inferPaths(resultsPath, auditMode)
  const lines = auditMode === "joint" ? generateJoint(parsed, paths) : generateSingle(parsed, paths)

  writeFileSync(outputPath, lines.join(""), "utf-8")

  process.stdout.write(`Generated ${auditMode} session log: ${outputPath} (${lines.length} lines)\n`)
  process.stdout.write("Next steps:\n")
  process.stdout.write("  1. Update Phase 0 input.filePath / output.lineCount with actual source file info\n")
  process.stdout.write("  2. Replace Phase 2 data with full docExtract from extraction phase\n")
  process.stdout.write("  3. Fill Phase 7 reportGeneration / sessionLogValidation fields:\n")
  process.stdout.write("     - reportGeneration.exitCode (int, e.g. 0)\n")
  process.stdout.write("     - sessionLogValidation.exitCode (int, e.g. 0)\n")
  process.stdout.write('     - sessionLogValidation.result ("OK" | "INVALID")\n')
  process.stdout.write(`  4. Validate: npx tsx .claude/skills/scout-audit/scripts/validate-session-log.ts ${outputPath} ${resultsPath}\n`)
}

main()
