# Report Schema — 审核报告输出结构

> **重要:** 此 schema 是 `results.json` 的权威定义。
> `generate-report.ts` 脚本严格依赖此结构。两者必须保持同步。
> 如果修改此 schema，必须同步更新 `scripts/generate-report.ts` 的 `ReportInput` 接口。

## JSON 结构 (flat, 非 nested)

```typescript
interface RuleResult {
  ruleId: string                // "B001"
  ruleName: string              // "样品批号准确"
  status: "PASS" | "FAIL" | "SKIP"
  severity: "severe" | "warning" | "info"
  details: string               // 具体问题描述
  evidence?: {                  // FAIL 时 MUST 填写，PASS/SKIP 可为空对象
    expected?: string
    actual?: string
    location?: string           // 字段路径，如 "testItems[0].result"
  }
  remediation: string           // 整改建议 (FAIL 时 MUST 填写)
}

interface ResultsJSON {
  docType: "COA" | "ELN"
  reportNo: string              // 报告编号
  batchNo: string               // 批号
  productName: string           // 品名
  specification: string         // 规格
  standardRef?: string          // 执行标准
  auditDate: string             // YYYY-MM-DD
  overallResult?: "PASS" | "FAIL" | "CONDITIONAL_PASS"  // 可选，脚本可自行计算
  summary?: {                   // 可选，脚本可自行计算
    totalRules: number
    passCount: number
    failCount: number
    skipCount: number
    applicableCount: number
    correctionCount: number
    severeFailCount: number
  }
  ruleResults: RuleResult[]     // MUST 恰好 32 条 (B001–C002)
  corrections?: Array<{         // 修正记录
    ruleId: string
    originalStatus: "PASS" | "FAIL" | "SKIP"
    correctedTo: "PASS" | "FAIL" | "SKIP"
    reason: string
  }>
  metadata?: {
    generatedBy: string
    generatedAt: string         // ISO 8601
    limsAvailable: boolean
    ruleEngineAvailable: boolean
    reportMethod: string        // "script" | "llm" | "hybrid"
  }
}
```

## 关键约束

| 约束 | 说明 |
|------|------|
| **Flat 结构** | 顶层字段是 `docType`, `reportNo`, `batchNo`, `ruleResults[]`。**不要**嵌套到 `reportMeta`/`summary`/`results` 下 |
| **32 条规则** | `ruleResults` 必须恰好 32 条，覆盖 B001–C002 |
| **FAIL evidence** | FAIL 结果的 `evidence` 必须非空，含 `expected` + `actual`，建议含 `location` |
| **FAIL remediation** | FAIL 结果的 `remediation` 必须非空 |
| **corrections 完整** | 所有修正都必须在 `corrections[]` 中记录，结构固定为 `{ ruleId, originalStatus, correctedTo, reason }` |

## overallResult 判定逻辑

| 条件 | 结果 |
|------|------|
| 无 FAIL | PASS |
| 仅有 warning/info 级别 FAIL | CONDITIONAL_PASS |
| 存在 severe 级别 FAIL | FAIL |

## overallSummary 模板

| overallResult | 中文描述 |
|--------------|---------|
| PASS | 该 {docType} 文档全部适用规则审核通过，未发现合规问题。 |
| CONDITIONAL_PASS | 该 {docType} 文档存在 {warningCount} 项警告级别问题，需复核后确认。 |
| FAIL | 该 {docType} 文档存在 {severeCount} 项严重问题，审核不通过，需整改后重新提交。 |

## 修正注释 (correctionNote)

当规则结果被修正时，在报告对应分组的表格后添加注释:

```markdown
> **注:** {ruleId} 原始判定为 FAIL。{correctionReason}，修正为 PASS。
```

`corrections[]` 推荐使用如下结构:

```json
[
  {
    "ruleId": "L001",
    "originalStatus": "FAIL",
    "correctedTo": "PASS",
    "reason": "COA 使用总结论且与全部合格结果一致"
  }
]
```

典型修正场景:
1. **检测限结果**: R002/R004 原始判定为 FAIL → 因 `isDetectionLimit: true` 依据规则豁免条款修正为 PASS
2. **COA 格式**: L001 原始判定为 FAIL (单项结论字段为空) → COA 格式使用总结论而非逐项结论，总结论与全部合格结果一致，修正为 PASS

## 模板变量映射 (generate-report.ts)

| 模板变量 | 来源 |
|---------|------|
| `{reportNo}` | resultsJSON.reportNo |
| `{batchNo}` | resultsJSON.batchNo |
| `{productName}` | resultsJSON.productName |
| `{specification}` | resultsJSON.specification |
| `{docType}` | resultsJSON.docType |
| `{auditDate}` | resultsJSON.auditDate |
| `{overallResult}` | 脚本从 ruleResults 计算 |
| `{passCount}` | 脚本从 ruleResults 计算 |
| `{skipCount}` | 脚本从 ruleResults 计算 |
| `{failCount}` | 脚本从 ruleResults 计算 |
| `{B001_status}` | ruleResults[B001].status |
| `{B001_details}` | ruleResults[B001].details |
| `{overallSummary}` | 脚本根据 overallResult 生成 |
