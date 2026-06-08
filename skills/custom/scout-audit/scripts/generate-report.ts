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
  corrections?: Array<{
    ruleId: string
    originalStatus: "PASS" | "FAIL" | "SKIP"
    correctedTo: "PASS" | "FAIL" | "SKIP"
    reason: string
  }>
  metadata?: {
    generatedBy: string
    generatedAt: string
    limsAvailable: boolean
    ruleEngineAvailable: boolean
    reportMethod: string
  }
}

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
])

function main(): void {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    process.stderr.write("Usage: generate-report.ts <results.json> [output.md]\n")
    process.exit(1)
  }

  const inputPath = args[0]
  const outputPath = args[1] || `outputs/${JSON.parse(readFileSync(inputPath, "utf-8")).reportNo}-audit-report.md`

  const input: ReportInput = JSON.parse(readFileSync(inputPath, "utf-8"))
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

main()
