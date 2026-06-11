#!/usr/bin/env node
// generate-report.ts — Generate markdown audit report from JSON results
// Usage: npx tsx scripts/generate-report.ts <results.json> [output.md]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { dirname } from "path"

interface RuleResult {
  ruleId: string
  ruleName: string
  status: "PASS" | "FAIL" | "SKIP"
  severity: "severe" | "warning" | "info"
  details: string
  evidence?: { expected?: string; actual?: string; location?: string }
  remediation: string
}

interface ReportInput {
  auditMode?: "single" | "joint"
  docType: "COA" | "ELN"
  reportNo: string
  batchNo: string
  productName: string
  specification: string
  standardRef?: string
  auditDate: string
  overallResult?: "PASS" | "FAIL" | "CONDITIONAL_PASS"
  summary?: {
    totalRules: number
    passCount: number
    failCount: number
    skipCount: number
    applicableCount: number
    correctionCount: number
    severeFailCount: number
  }
  ruleResults: RuleResult[]
  corrections?: CorrectionRecord[]
  metadata?: MetadataRecord
}

interface JointReportInput {
  auditMode: "joint"
  batchNo: string
  productName: string
  specification: string
  standardRef?: string
  auditDate: string
  overallResult?: "PASS" | "FAIL" | "CONDITIONAL_PASS"
  summary?: {
    totalRules: number
    passCount: number
    failCount: number
    skipCount: number
  }
  documents: {
    coa: ReportInput
    eln: ReportInput
  }
  crossDocumentRules: RuleResult[]
  elnFiltering?: {
    elnScope: "single-batch" | "multi-batch"
    originalSampleCount: number
    filteredSampleCount: number
    filterMethod: "lims" | "coa-sampleIds" | "none"
    excludedSampleIds?: string[]
  }
  corrections?: CorrectionRecord[]
  metadata?: MetadataRecord
}

interface CorrectionRecord {
  ruleId: string
  originalStatus: "PASS" | "FAIL" | "SKIP"
  correctedTo: "PASS" | "FAIL" | "SKIP"
  reason: string
}

interface MetadataRecord {
  generatedBy: string
  generatedAt: string
  limsAvailable: boolean
  ruleEngineAvailable: boolean
  reportMethod: string
}

type JointSourceLabel = "COA" | "ELN" | "跨文档" | "待确认来源"

function groupSkipReasons(results: RuleResult[]): string {
  const groups = new Map<string, number>()
  for (const r of results.filter((r) => r.status === "SKIP")) {
    const reason = r.details || "未说明"
    groups.set(reason, (groups.get(reason) || 0) + 1)
  }
  return groups.size === 0
    ? "无"
    : Array.from(groups.entries())
        .map(([reason, count]) => (count > 1 ? `${reason} ×${count}` : reason))
        .join("; ")
}

const VALID_RULE_IDS = new Set([
  "B001","B002","B003","B004","B005",
  "N001","N002",
  "R001","R002","R003","R004",
  "P001","P002","P003",
  "E001","E002","E003","E004","E005",
  "S001","S002","S003","S004",
  "D001","D002","D003",
  "L001","L002","L003","L004",
  "C001","C002",
  "X001","X002","X003","X004","X005",
])

function main(): void {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    process.stderr.write("Usage: generate-report.ts <results.json> [output.md]\n")
    process.exit(1)
  }

  const inputPath = args[0]
  const rawInput = JSON.parse(readFileSync(inputPath, "utf-8"))

  // Detect auditMode and dispatch
  if (rawInput.auditMode === "joint") {
    mainJoint(rawInput as JointReportInput, args)
  } else {
    mainSingle(rawInput as ReportInput, args)
  }
}

function mainSingle(input: ReportInput, args: string[]): void {
  const inputPath = args[0]
  const outputPath = args[1] || `outputs/${input.reportNo}-audit-report.md`

  const validationErrors: string[] = []

  if (!input.ruleResults || input.ruleResults.length !== 32) {
    validationErrors.push(`Expected 32 ruleResults, got ${input.ruleResults?.length ?? 0}`)
  }
  const unknownIds = input.ruleResults?.filter((r) => !VALID_RULE_IDS.has(r.ruleId)).map((r) => r.ruleId) ?? []
  if (unknownIds.length > 0) {
    validationErrors.push(`Unknown rule IDs: ${unknownIds.join(", ")}`)
  }
  const emptyEvidenceFails = input.ruleResults?.filter(
    (r) => r.status === "FAIL" && (!r.evidence?.expected || !r.evidence?.actual)
  ) ?? []
  if (emptyEvidenceFails.length > 0) {
    validationErrors.push(`FAIL rules with empty evidence: ${emptyEvidenceFails.map((r) => r.ruleId).join(", ")}`)
  }

  if (validationErrors.length > 0) {
    process.stderr.write(`INVALID report input: ${inputPath}\n`)
    validationErrors.forEach((message) => process.stderr.write(`- ${message}\n`))
    process.exit(1)
  }

  const report = generateReport(input)

  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(outputPath, report, "utf-8")
  process.stdout.write(outputPath)
}

function mainJoint(input: JointReportInput, args: string[]): void {
  const inputPath = args[0]
  const outputPath = args[1] || `outputs/${input.batchNo}-joint-audit-report.md`

  const validationErrors: string[] = []
  const coa = input.documents.coa
  const eln = input.documents.eln

  if (!coa.ruleResults || coa.ruleResults.length !== 32) {
    validationErrors.push(`COA: Expected 32 ruleResults, got ${coa.ruleResults?.length ?? 0}`)
  }
  if (!eln.ruleResults || eln.ruleResults.length !== 32) {
    validationErrors.push(`ELN: Expected 32 ruleResults, got ${eln.ruleResults?.length ?? 0}`)
  }
  if (!input.crossDocumentRules || input.crossDocumentRules.length !== 5) {
    validationErrors.push(`crossDocumentRules: Expected 5, got ${input.crossDocumentRules?.length ?? 0}`)
  }
  const allResults = [...(coa.ruleResults ?? []), ...(eln.ruleResults ?? []), ...(input.crossDocumentRules ?? [])]
  const unknownIds = allResults.filter((r) => !VALID_RULE_IDS.has(r.ruleId)).map((r) => r.ruleId)
  if (unknownIds.length > 0) {
    validationErrors.push(`Unknown rule IDs: ${[...new Set(unknownIds)].join(", ")}`)
  }
  const emptyEvidenceFails = allResults.filter(
    (r) => r.status === "FAIL" && (!r.evidence?.expected || !r.evidence?.actual)
  )
  if (emptyEvidenceFails.length > 0) {
    validationErrors.push(`FAIL rules with empty evidence: ${emptyEvidenceFails.map((r) => r.ruleId).join(", ")}`)
  }

  if (validationErrors.length > 0) {
    process.stderr.write(`INVALID report input: ${inputPath}\n`)
    validationErrors.forEach((message) => process.stderr.write(`- ${message}\n`))
    process.exit(1)
  }

  const report = generateJointReport(input)

  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(outputPath, report, "utf-8")
  process.stdout.write(outputPath)
}

function generateReport(input: ReportInput): string {
  const { docType, reportNo, batchNo, productName, specification, auditDate, ruleResults, corrections } = input

  const passCount = ruleResults.filter((r) => r.status === "PASS").length
  const failCount = ruleResults.filter((r) => r.status === "FAIL").length
  const skipCount = ruleResults.filter((r) => r.status === "SKIP").length
  const applicableCount = ruleResults.filter((r) => r.status !== "SKIP").length
  const severeFailCount = ruleResults.filter((r) => r.status === "FAIL" && r.severity === "severe").length
  const warningFailCount = ruleResults.filter((r) => r.status === "FAIL" && r.severity === "warning").length

  const overallResult = input.overallResult ?? (
    severeFailCount > 0 ? "FAIL"
    : failCount > 0 ? "CONDITIONAL_PASS"
    : "PASS"
  )

  const overallSummary = overallResult === "PASS"
    ? `该 ${docType} 文档全部适用规则审核通过，未发现合规问题。`
    : overallResult === "CONDITIONAL_PASS"
    ? `该 ${docType} 文档存在 ${warningFailCount} 项警告级别问题，需复核后确认。`
    : `该 ${docType} 文档存在 ${severeFailCount} 项严重问题，审核不通过，需整改后重新提交。`

  const categories = [
    { title: "基本信息 (B001–B005)", ids: ["B001", "B002", "B003", "B004", "B005"] },
    { title: "数值判定 (N001–N002)", ids: ["N001", "N002"] },
    { title: "数值规范 (R001–R004)", ids: ["R001", "R002", "R003", "R004"] },
    { title: "精密度 (P001–P003) — ELN 专用", ids: ["P001", "P002", "P003"] },
    { title: "环境/仪器 (E001–E005) — ELN 专用", ids: ["E001", "E002", "E003", "E004", "E005"] },
    { title: "签名/审核 (S001–S004)", ids: ["S001", "S002", "S003", "S004"] },
    { title: "数据完整性 (D001–D003)", ids: ["D001", "D002", "D003"] },
    { title: "逻辑一致性 (L001–L004)", ids: ["L001", "L002", "L003", "L004"] },
    { title: "结论/表述 (C001–C002)", ids: ["C001", "C002"] },
  ]

  const resultMap = new Map(ruleResults.map((r) => [r.ruleId, r]))

  function renderRow(id: string): string {
    const r = resultMap.get(id)
    if (!r) return `| ${id} | - | SKIP | 规则未执行 |`
    return `| ${r.ruleId} | ${r.ruleName} | ${r.status} | ${r.details} |`
  }

  function renderCategory(cat: { title: string; ids: string[] }): string {
    return `### ${cat.title}\n\n| 规则ID | 规则名称 | 状态 | 说明 |\n|--------|---------|------|------|\n${cat.ids.map(renderRow).join("\n")}`
  }

  let correctionsSection = ""
  if (corrections && corrections.length > 0) {
    const rows = corrections
      .map((c) => `| ${c.ruleId} | ${c.originalStatus} | ${c.correctedTo} | ${c.reason} |`)
      .join("\n")
    correctionsSection = `## 修正记录\n\n| 规则ID | 原始状态 | 修正后 | 原因 |\n|--------|---------|--------|------|\n${rows}\n\n---\n\n`
  }

  const traceResults = ruleResults.filter(
    (r) => (r.status === "FAIL" && r.severity === "warning") || Boolean(r.evidence?.location)
  )
  let traceSection = ""
  if (traceResults.length > 0) {
    const rows = traceResults
      .map((r) => `| ${r.ruleId} | ${r.severity} | ${r.evidence?.location ?? "-"} | ${r.details} |`)
      .join("\n")
    traceSection = `## 规则引擎告警与证据定位\n\n| 规则ID | 严重级别 | 证据定位 | 说明 |\n|--------|---------|---------|------|\n${rows}\n\n---\n\n`
  }

  const failResults = ruleResults.filter((r) => r.status === "FAIL")
  let remediationSection = ""
  if (failResults.length > 0) {
    const items = failResults.map((r) =>
      `### ${r.ruleId}: ${r.ruleName}\n- **期望:** ${r.evidence?.expected ?? "-"}\n- **实际:** ${r.evidence?.actual ?? "-"}${r.evidence?.location ? `\n- **证据定位:** ${r.evidence.location}` : ""}\n- **严重级别:** ${r.severity}\n- **整改建议:** ${r.remediation}`
    ).join("\n\n")
    remediationSection = `## 整改建议\n\n${items}`
  }

  const skipReasons = groupSkipReasons(ruleResults)

  return `# Scout 合规审核报告

> 报告编号: ${reportNo} | 批号: ${batchNo} | 文档类型: ${docType}
> 品名: ${productName} | 规格: ${specification} | 审核日期: ${auditDate}

---

## 审核总评: ${overallResult}

| 状态 | 数量 |
|------|------|
| PASS | ${passCount} |
| SKIP | ${skipCount} |
| FAIL | ${failCount} |

---

## 详细规则结果

${categories.map(renderCategory).join("\n\n")}

${correctionsSection}${traceSection}## 规则执行汇总

| 状态 | 数量 |
|------|------|
| PASS | ${passCount} |
| SKIP | ${skipCount} |
| FAIL | ${failCount} |
| **TOTAL** | **32** |

- 适用规则: ${applicableCount} | 通过: ${passCount} | 失败: ${failCount}
- 豁免规则: ${skipCount} (${skipReasons || "无"})

${remediationSection ? remediationSection + "\n\n---\n\n" : ""}## 审核结论

**${overallResult}** — ${overallSummary}
`
}

function generateJointReport(input: JointReportInput): string {
  const { batchNo, productName, specification, auditDate, documents, crossDocumentRules, elnFiltering, corrections } = input
  const { coa, eln } = documents

  const coaPassCount = coa.ruleResults.filter((r) => r.status === "PASS").length
  const coaFailCount = coa.ruleResults.filter((r) => r.status === "FAIL").length
  const coaSkipCount = coa.ruleResults.filter((r) => r.status === "SKIP").length

  const elnPassCount = eln.ruleResults.filter((r) => r.status === "PASS").length
  const elnFailCount = eln.ruleResults.filter((r) => r.status === "FAIL").length
  const elnSkipCount = eln.ruleResults.filter((r) => r.status === "SKIP").length

  const crossPassCount = crossDocumentRules.filter((r) => r.status === "PASS").length
  const crossFailCount = crossDocumentRules.filter((r) => r.status === "FAIL").length
  const crossSkipCount = crossDocumentRules.filter((r) => r.status === "SKIP").length

  const passCount = coaPassCount + elnPassCount + crossPassCount
  const failCount = coaFailCount + elnFailCount + crossFailCount
  const skipCount = coaSkipCount + elnSkipCount + crossSkipCount

  const allResults = [...coa.ruleResults, ...eln.ruleResults, ...crossDocumentRules]
  const severeFailCount = allResults.filter((r) => r.status === "FAIL" && r.severity === "severe").length
  const warningFailCount = allResults.filter((r) => r.status === "FAIL" && r.severity === "warning").length

  const overallResult = input.overallResult ?? (
    severeFailCount > 0 ? "FAIL"
    : failCount > 0 ? "CONDITIONAL_PASS"
    : "PASS"
  )

  const overallSummary = overallResult === "PASS"
    ? `该批次联合审核（COA + ELN）全部适用规则审核通过，未发现合规问题。`
    : overallResult === "CONDITIONAL_PASS"
    ? `该批次联合审核存在 ${warningFailCount} 项警告级别问题，需复核后确认。`
    : `该批次联合审核存在 ${severeFailCount} 项严重问题，审核不通过，需整改后重新提交。`

  // ELN filtering note
  let filteringNote = ""
  if (elnFiltering && elnFiltering.elnScope === "multi-batch") {
    const excludedList = elnFiltering.excludedSampleIds?.join(", ") ?? "无"
    filteringNote = `> **ELN 筛选说明:** ELN 原始含 ${elnFiltering.originalSampleCount} 个样品，经 Phase 3.5 筛选（依据 COA 批号 ${batchNo}，方式: ${elnFiltering.filterMethod}），保留 ${elnFiltering.filteredSampleCount} 个样品参与审核。排除样品ID: ${excludedList}。\n\n`
  }

  // Render single-document category tables
  const categories = [
    { title: "基本信息 (B001–B005)", ids: ["B001", "B002", "B003", "B004", "B005"] },
    { title: "数值判定 (N001–N002)", ids: ["N001", "N002"] },
    { title: "数值规范 (R001–R004)", ids: ["R001", "R002", "R003", "R004"] },
    { title: "精密度 (P001–P003) — ELN 专用", ids: ["P001", "P002", "P003"] },
    { title: "环境/仪器 (E001–E005) — ELN 专用", ids: ["E001", "E002", "E003", "E004", "E005"] },
    { title: "签名/审核 (S001–S004)", ids: ["S001", "S002", "S003", "S004"] },
    { title: "数据完整性 (D001–D003)", ids: ["D001", "D002", "D003"] },
    { title: "逻辑一致性 (L001–L004)", ids: ["L001", "L002", "L003", "L004"] },
    { title: "结论/表述 (C001–C002)", ids: ["C001", "C002"] },
  ]

  function renderCategoryForDoc(results: RuleResult[], title: string, ids: string[]): string {
    const resultMap = new Map(results.map((r) => [r.ruleId, r]))
    const rows = ids.map((id) => {
      const r = resultMap.get(id)
      if (!r) return `| ${id} | - | SKIP | 规则未执行 |`
      return `| ${r.ruleId} | ${r.ruleName} | ${r.status} | ${r.details} |`
    }).join("\n")
    return `### ${title}\n\n| 规则ID | 规则名称 | 状态 | 说明 |\n|--------|---------|------|------|\n${rows}`
  }

  const coaSections = categories.map((c) => renderCategoryForDoc(coa.ruleResults, c.title, c.ids)).join("\n\n")
  const elnSections = categories.map((c) => renderCategoryForDoc(eln.ruleResults, c.title, c.ids)).join("\n\n")

  // Cross-document rules table
  const crossRows = crossDocumentRules.map((r) =>
    `| ${r.ruleId} | ${r.ruleName} | ${r.status} | ${r.details} |`
  ).join("\n")

  // Corrections (with doc source)
  const nestedCorrections = [
    ...(coa.corrections ?? []).map((correction) => ({ source: "COA" as const, correction })),
    ...(eln.corrections ?? []).map((correction) => ({ source: "ELN" as const, correction })),
  ]
  const fallbackCorrections = (corrections ?? []).map((correction) => ({
    source: correction.ruleId.startsWith("X") ? "跨文档" as const : "待确认来源" as const,
    correction,
  }))
  const correctionKey = ({ source, correction }: { source: JointSourceLabel; correction: CorrectionRecord }) =>
    `${source}|${correction.ruleId}|${correction.originalStatus}|${correction.correctedTo}|${correction.reason}`
  const labeledCorrections = Array.from(
    new Map(
      [...nestedCorrections, ...fallbackCorrections].map((entry) => [correctionKey(entry), entry])
    ).values()
  )
  let correctionsSection = ""
  if (labeledCorrections.length > 0) {
    const rows = labeledCorrections
      .map(({ source, correction }) => `| ${source} | ${correction.ruleId} | ${correction.originalStatus} | ${correction.correctedTo} | ${correction.reason} |`)
      .join("\n")
    correctionsSection = `## 修正记录\n\n| 文档 | 规则ID | 原始状态 | 修正后 | 原因 |\n|------|--------|---------|--------|------|\n${rows}\n\n---\n\n`
  }

  // Remediation - all FAILs
  const labeledFailResults = [
    ...coa.ruleResults.filter((result) => result.status === "FAIL").map((result) => ({ source: "COA" as const, result })),
    ...eln.ruleResults.filter((result) => result.status === "FAIL").map((result) => ({ source: "ELN" as const, result })),
    ...crossDocumentRules.filter((result) => result.status === "FAIL").map((result) => ({ source: "跨文档" as const, result })),
  ]
  let remediationSection = ""
  if (labeledFailResults.length > 0) {
    const items = labeledFailResults.map(({ source, result }) =>
      `### ${source} - ${result.ruleId}: ${result.ruleName}\n- **期望:** ${result.evidence?.expected ?? "-"}\n- **实际:** ${result.evidence?.actual ?? "-"}${result.evidence?.location ? `\n- **证据定位:** ${result.evidence.location}` : ""}\n- **严重级别:** ${result.severity}\n- **整改建议:** ${result.remediation}`
    ).join("\n\n")
    remediationSection = `## 整改建议\n\n${items}`
  }

  return `# Scout 联合合规审核报告

> 批号: ${batchNo} | 品名: ${productName} | 规格: ${specification}
> COA 报告编号: ${coa.reportNo} | ELN 编号: ${eln.reportNo}
> 审核日期: ${auditDate} | 审核模式: 联合审核 (COA + ELN)

---

## 审核总评: ${overallResult}

| 文档 | PASS | FAIL | SKIP | 合计 |
|------|------|------|------|------|
| COA | ${coaPassCount} | ${coaFailCount} | ${coaSkipCount} | 32 |
| ELN | ${elnPassCount} | ${elnFailCount} | ${elnSkipCount} | 32 |
| 跨文档 | ${crossPassCount} | ${crossFailCount} | ${crossSkipCount} | 5 |
| **合计** | **${passCount}** | **${failCount}** | **${skipCount}** | **69** |

${filteringNote}---

## COA 审核结果

${coaSections}

---

## ELN 审核结果${elnFiltering && elnFiltering.elnScope === "multi-batch" ? `（筛选后，${elnFiltering.filteredSampleCount}/${elnFiltering.originalSampleCount} 样品）` : ""}

${elnSections}

---

## 跨文档一致性审核 (X001-X005)

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
${crossRows}

${correctionsSection}## 规则执行汇总

| 状态 | 数量 |
|------|------|
| PASS | ${passCount} |
| SKIP | ${skipCount} |
| FAIL | ${failCount} |
| **TOTAL** | **69** |

- COA: ${coaPassCount} PASS / ${coaFailCount} FAIL / ${coaSkipCount} SKIP
- ELN: ${elnPassCount} PASS / ${elnFailCount} FAIL / ${elnSkipCount} SKIP
- 跨文档: ${crossPassCount} PASS / ${crossFailCount} FAIL / ${crossSkipCount} SKIP

${remediationSection ? remediationSection + "\n\n---\n\n" : ""}## 审核结论

**${overallResult}** — ${overallSummary}
`
}

main()
