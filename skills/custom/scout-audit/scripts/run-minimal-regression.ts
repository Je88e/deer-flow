#!/usr/bin/env node

import { execFileSync } from "child_process"
import { mkdirSync, writeFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

import { getMockAllLimsData } from "../lib/mock-data.js"
import { runAllRules } from "../lib/rules.js"
import {
  evaluateS002,
  evaluateS003,
} from "../lib/semantic-signature-rules.js"
import {
  regressionScenarios,
  type RegressionCorrection,
  type RegressionRuleResult,
  type RegressionScenario,
} from "./regression-fixtures.js"

type JsonRecord = Record<string, unknown>

interface LimsRequest {
  batchNo: string
  reportNo: string
  standardRef: string
  personnelNames: string[]
  instrumentNos: string[]
  asOfDate: string
  qualitativeItems: Array<{ productName: string; testItemName: string }>
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, "../../../..")
const DEFAULT_OUTPUT_DIR = resolve(REPO_ROOT, "docs/reports/regression-outputs/outputs")
const GENERATE_REPORT_SCRIPT = resolve(SCRIPT_DIR, "generate-report.ts")
const SEMANTIC_RULE_IDS = [
  "N002",
  "E001",
  "E002",
  "S002",
  "S003",
  "D001",
  "D002",
  "D003",
  "L002",
  "L003",
  "C001",
  "C002",
] as const
const SEVERITY_ORDER: Record<string, number> = { severe: 0, warning: 1, info: 2 }

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: run-minimal-regression.ts [--scenario <id>] [--output-dir <dir>]",
      "",
      "Runs fixture-driven scout-audit regressions and generates:",
      "- {reportNo}-results.json",
      "- {reportNo}-audit-report.md",
      "",
      "Examples:",
      "  npx tsx skills/custom/scout-audit/scripts/run-minimal-regression.ts",
      "  npx tsx skills/custom/scout-audit/scripts/run-minimal-regression.ts --scenario A408H0001",
      `  npx tsx skills/custom/scout-audit/scripts/run-minimal-regression.ts --output-dir ${DEFAULT_OUTPUT_DIR}`,
    ].join("\n") + "\n"
  )
}

function cloneRuleResult(result: RegressionRuleResult): RegressionRuleResult {
  return {
    ...result,
    evidence: result.evidence ? { ...result.evidence } : undefined,
  }
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as JsonRecord
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  return value
}

function readString(obj: JsonRecord, key: string, label: string): string {
  const value = obj[key]
  if (typeof value !== "string") {
    throw new Error(`${label}.${key} must be a string`)
  }
  return value
}

function firstNonEmpty(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim()
    }
  }
  return ""
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim() !== "")))
}

function buildLimsRequest(scenario: RegressionScenario): LimsRequest {
  const docExtract = asRecord(scenario.docExtract, `${scenario.id}.docExtract`)
  const reportInfo = asRecord(docExtract.reportInfo, `${scenario.id}.docExtract.reportInfo`)
  const sampleInfo = asRecord(docExtract.sampleInfo, `${scenario.id}.docExtract.sampleInfo`)
  const dates = asRecord(docExtract.dates ?? {}, `${scenario.id}.docExtract.dates`)

  const reportNo = readString(reportInfo, "reportNo", `${scenario.id}.docExtract.reportInfo`)
  const batchNo = readString(sampleInfo, "batchNo", `${scenario.id}.docExtract.sampleInfo`)
  const productName = readString(sampleInfo, "productName", `${scenario.id}.docExtract.sampleInfo`)
  const standardRef = readString(docExtract, "standardRef", `${scenario.id}.docExtract`)

  const signatures = asArray(docExtract.signatures ?? [], `${scenario.id}.docExtract.signatures`)
  const personnel = asArray(docExtract.personnel ?? [], `${scenario.id}.docExtract.personnel`)
  const instruments = asArray(docExtract.instruments ?? [], `${scenario.id}.docExtract.instruments`)
  const testItems = asArray(docExtract.testItems ?? [], `${scenario.id}.docExtract.testItems`)

  const personnelNames = unique([
    ...personnel.flatMap((item) => {
      const row = asRecord(item, `${scenario.id}.docExtract.personnel[]`)
      return typeof row.name === "string" ? [row.name.trim()] : []
    }),
    ...signatures.flatMap((item) => {
      const row = asRecord(item, `${scenario.id}.docExtract.signatures[]`)
      return typeof row.name === "string" ? [row.name.trim()] : []
    }),
  ])

  const instrumentNos = unique(
    instruments.flatMap((item) => {
      const row = asRecord(item, `${scenario.id}.docExtract.instruments[]`)
      return typeof row.instrumentNo === "string" ? [row.instrumentNo.trim()] : []
    })
  )

  const qualitativeItems = testItems.flatMap((item) => {
    const row = asRecord(item, `${scenario.id}.docExtract.testItems[]`)
    return row.testType === "qualitative" && typeof row.itemName === "string"
      ? [{ productName, testItemName: row.itemName.trim() }]
      : []
  })

  const asOfDate = firstNonEmpty(dates.testDate, dates.reportDate, reportInfo.reportDate)
  if (!asOfDate) {
    throw new Error(`${scenario.id} must provide testDate or reportDate for LIMS lookup`)
  }

  return {
    batchNo,
    reportNo,
    standardRef,
    personnelNames,
    instrumentNos,
    asOfDate,
    qualitativeItems,
  }
}

function applyCorrections(
  results: RegressionRuleResult[],
  corrections: RegressionCorrection[],
  options: { requireMatch?: boolean } = {}
): RegressionRuleResult[] {
  const cloned = results.map(cloneRuleResult)

  for (const correction of corrections) {
    const target = cloned.find((result) => result.ruleId === correction.ruleId)
    if (!target) {
      if (options.requireMatch) {
        throw new Error(`Correction references unknown ruleId: ${correction.ruleId}`)
      }
      continue
    }

    target.status = correction.correctedTo
    target.details = `${target.details} [修正: ${correction.reason}]`

    if (correction.correctedTo !== "FAIL") {
      delete target.evidence
      target.remediation = ""
    }
  }

  return cloned
}

function summarize(results: RegressionRuleResult[], correctionCount: number) {
  const passCount = results.filter((result) => result.status === "PASS").length
  const failCount = results.filter((result) => result.status === "FAIL").length
  const skipCount = results.filter((result) => result.status === "SKIP").length
  const applicableCount = results.filter((result) => result.status !== "SKIP").length
  const severeFailCount = results.filter((result) => result.status === "FAIL" && result.severity === "severe").length

  const overallResult =
    severeFailCount > 0
      ? "FAIL"
      : failCount > 0
        ? "CONDITIONAL_PASS"
        : "PASS"

  return {
    overallResult,
    summary: {
      totalRules: results.length,
      passCount,
      failCount,
      skipCount,
      applicableCount,
      correctionCount,
      severeFailCount,
    },
  }
}

function sortResults(results: RegressionRuleResult[]): RegressionRuleResult[] {
  return [...results].sort((left, right) => {
    const severityDelta = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    if (severityDelta !== 0) return severityDelta
    return left.ruleId.localeCompare(right.ruleId, "en")
  })
}

function runCliScript(scriptPath: string, args: string[]): string {
  const options = {
    cwd: REPO_ROOT,
    encoding: "utf-8" as const,
    stdio: "pipe" as const,
  }

  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/c", "npx", "tsx", scriptPath, ...args], options).trim()
  }

  return execFileSync("npx", ["tsx", scriptPath, ...args], options).trim()
}

function validateSemanticFixtures(scenario: RegressionScenario): void {
  if (scenario.semanticResults.length !== SEMANTIC_RULE_IDS.length) {
    throw new Error(`${scenario.id} semanticResults must contain exactly 12 rules`)
  }

  const ruleIds = scenario.semanticResults.map((result) => result.ruleId)
  const expected = [...SEMANTIC_RULE_IDS].sort()
  const actual = [...ruleIds].sort()
  if (expected.join(",") !== actual.join(",")) {
    throw new Error(`${scenario.id} semanticResults must cover exactly ${expected.join(", ")}`)
  }
}

function applyMechanicalSemanticRules(
  semanticBase: RegressionRuleResult[],
  limsData: Record<string, unknown>
): RegressionRuleResult[] {
  const next = semanticBase.map(cloneRuleResult)
  const replacements = new Map<string, RegressionRuleResult>([
    [
      "S002",
      evaluateS002(
        Array.isArray(limsData.auditTrail) ? limsData.auditTrail : [],
        limsData.workflow && typeof limsData.workflow === "object"
          ? (limsData.workflow as { steps?: Array<{ status?: unknown }> })
          : null
      ) as RegressionRuleResult,
    ],
    [
      "S003",
      evaluateS003(
        Array.isArray(limsData.auditTrail) ? limsData.auditTrail : []
      ) as RegressionRuleResult,
    ],
  ])

  return next.map((result) => replacements.get(result.ruleId) ?? result)
}

function parseArgs(argv: string[]): { scenarioIds: string[] | null; outputDir: string } {
  let outputDir = DEFAULT_OUTPUT_DIR
  const scenarioIds: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }
    if (arg === "--scenario") {
      const value = argv[index + 1]
      if (!value) throw new Error("--scenario requires a value")
      scenarioIds.push(value)
      index += 1
      continue
    }
    if (arg === "--output-dir") {
      const value = argv[index + 1]
      if (!value) throw new Error("--output-dir requires a value")
      outputDir = resolve(value)
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return {
    scenarioIds: scenarioIds.length > 0 ? scenarioIds : null,
    outputDir,
  }
}

function main(): void {
  const { scenarioIds, outputDir } = parseArgs(process.argv.slice(2))
  mkdirSync(outputDir, { recursive: true })

  const selectedScenarios = scenarioIds
    ? scenarioIds.map((id) => {
        const scenario = regressionScenarios.find((item) => item.id === id)
        if (!scenario) {
          throw new Error(`Unknown scenario: ${id}`)
        }
        return scenario
      })
    : regressionScenarios

  const manifest: Array<Record<string, unknown>> = []

  for (const scenario of selectedScenarios) {
    validateSemanticFixtures(scenario)

    const request = buildLimsRequest(scenario)
    const limsData = getMockAllLimsData(
      request.batchNo,
      request.reportNo,
      request.standardRef,
      request.personnelNames,
      request.instrumentNos,
      request.asOfDate,
      scenario.docType,
      request.qualitativeItems
    ) as JsonRecord

    const deterministicBase = runAllRules(scenario.docExtract, limsData, scenario.docType) as RegressionRuleResult[]
    if (deterministicBase.length !== 20) {
      throw new Error(`${scenario.id} deterministic rules must produce 20 results`)
    }

    const semanticBase = applyMechanicalSemanticRules(
      scenario.semanticResults.map(cloneRuleResult),
      limsData as Record<string, unknown>
    )
    const deterministicResults = deterministicBase
    const semanticResults = semanticBase
    const mergedResults = sortResults([...deterministicResults, ...semanticResults])
    const correctedMergedResults = applyCorrections(mergedResults, scenario.corrections, { requireMatch: true })
    const correctedSummary = summarize(correctedMergedResults, scenario.corrections.length)
    const correctedOverallResult = correctedSummary.overallResult

    const docExtract = asRecord(scenario.docExtract, `${scenario.id}.docExtract`)
    const reportInfo = asRecord(docExtract.reportInfo, `${scenario.id}.docExtract.reportInfo`)
    const sampleInfo = asRecord(docExtract.sampleInfo, `${scenario.id}.docExtract.sampleInfo`)
    const reportNo = readString(reportInfo, "reportNo", `${scenario.id}.docExtract.reportInfo`)
    const auditDate = firstNonEmpty(
      asRecord(docExtract.dates ?? {}, `${scenario.id}.docExtract.dates`).reportDate,
      reportInfo.reportDate
    )
    if (!auditDate) {
      throw new Error(`${scenario.id} must provide auditDate`)
    }

    const resultsPath = resolve(outputDir, `${reportNo}-results.json`)
    const reportPath = resolve(outputDir, `${reportNo}-audit-report.md`)

    const resultsJson = {
      docType: scenario.docType,
      reportNo,
      batchNo: readString(sampleInfo, "batchNo", `${scenario.id}.docExtract.sampleInfo`),
      productName: readString(sampleInfo, "productName", `${scenario.id}.docExtract.sampleInfo`),
      specification: readString(sampleInfo, "specification", `${scenario.id}.docExtract.sampleInfo`),
      standardRef: readString(docExtract, "standardRef", `${scenario.id}.docExtract`),
      auditDate,
      overallResult: correctedOverallResult,
      summary: correctedSummary.summary,
      ruleResults: correctedMergedResults,
      corrections: scenario.corrections,
      metadata: {
        generatedBy: "run-minimal-regression.ts",
        generatedAt: new Date().toISOString(),
        limsAvailable: true,
        ruleEngineAvailable: true,
        reportMethod: "script",
      },
    }

    writeFileSync(resultsPath, `${JSON.stringify(resultsJson, null, 2)}\n`, "utf-8")
    runCliScript(GENERATE_REPORT_SCRIPT, [resultsPath, reportPath])

    manifest.push({
      id: scenario.id,
      reportNo,
      overallResult: correctedOverallResult,
      summary: correctedSummary.summary,
      resultsPath,
      reportPath,
    })
  }

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
}

main()
