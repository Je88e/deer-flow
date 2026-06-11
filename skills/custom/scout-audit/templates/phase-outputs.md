# Phase 固定输出模板

> **Ownership:** 本文件是各 phase / sub-phase 固定进度输出文案与槽位的权威定义；`SKILL.md` 只引用输出 contract，不重复模板细节。
> 每个 Phase 完成后 MUST 按照以下固定模板输出进度信息。不可自由发挥。

## Phase 0: 源文档准备

开始时:
```
开始审核源文档。Phase 0: 源文档准备。
```

完成后:
```
Phase 0 完成。源文档已准备为 Markdown ({lineCount} 行, mode={mode}, method={method})。进入 Phase 1: 文档分类。
```

说明:

- `mode` 只能是 `convert` 或 `passthrough`
- `method` 示例:
  - PDF 转换: `markitdown` / `read-pdf` / `pdf-skill`
  - 原文直通: `read-markdown` / `read-text`
- Phase 0 不得预先输出 `docType`

## Phase 1: 文档分类

```
Phase 1: 文档分类为 {docType} ({docTypeChinese})。进入 Phase 2: 提取结构化数据。
```

| docType | docTypeChinese |
|---------|---------------|
| COA | 检验报告/Test Report |
| ELN | 电子实验记录/Electronic Lab Notebook |

## Phase 2: 提取结构化数据

```
Phase 2 完成。已提取 docExtract 数据:
  批号: {batchNo}
  报告: {reportNo}
  标准: {standardRef}
  检测项: {testItemCount} 项
  签名: {signatureCount} 个

进入 Phase 3: 获取 LIMS 数据。
```

## Phase 3: 获取 LIMS 数据

开始时:
```
Phase 3: 获取 LIMS 数据。批号: {batchNo}, 报告: {reportNo}, 标准: {standardRef}

```

完成后:
```
Phase 3 完成。LIMS 数据获取完毕:
  依赖状态: {dependencyStatus}
  请验单: {requestFormStatus}
  报告唯一性: {reportUniqueStatus}
  审计日志: {auditTrailCount} 条
  原始数据: {originalDataStatus}

进入 Phase 4: 运行确定性规则。
```

## Phase 4: 确定性规则

开始时:
```
Phase 4: 运行 {deterministicRuleCount} 条确定性规则 (executionMode={executionMode})...
```

完成后:
```
Phase 4 完成。{deterministicRuleCount} 条确定性规则已评估:
  PASS: {passCount} | FAIL: {failCount} | SKIP: {skipCount}

进入 Phase 5: AI 语义规则。
```

## Phase 5: AI 语义规则

```
Phase 5: AI 语义规则 — 分析 {semanticRuleCount} 条语义规则。
```

完成后:
```
Phase 5 完成。{semanticRuleCount} 条语义规则已评估。进入 Phase 6: 合并结果。
```

## Phase 6: 合并结果

```
Phase 6: 合并全部结果，按严重级别排序。
```

修正说明（如有修正）:
```
> **注:** {ruleId} 原始判定为 {originalStatus}。{correctionReason}，修正为 {correctedTo}。
```

完成后:
```
Phase 6 完成。全部 {totalRules} 条规则已评估。
  PASS: {passCount} | FAIL: {failCount} | SKIP: {skipCount}
  Overall: {overallResult}
  Corrections: {correctionCount}

进入 Phase 7: 生成审核报告。
```

## Phase 7: 输出文件

```
审核结果已保存至 outputs/{reportNo}-results.json
审核报告已生成并保存至 outputs/{reportNo}-audit-report.md
会话日志已保存至 outputs/{reportNo}-session-log.jsonl
报告脚本: exitCode={reportExitCode}, warnings={reportWarningCount}
日志校验: result={validationResult}, exitCode={validationExitCode}
```

---

## Joint Mode 变体

以下为 auditMode="joint" 时的额外或替代输出模板。Joint 模式同时包含并行子车道 `Phase N{a,b,c}` 与固定编号槽位（如 `Phase 3.5`）。

### Phase 0a/0b: 源文档准备 (并行)

`0a` 与 `0b` 是两条独立固定输出，分别在各自 sub-phase 完成时输出；不要把它们压缩成一条联合摘要。

```
开始联合审核。Phase 0a: COA 源文档准备。
Phase 0b: ELN 源文档准备。
```

Phase 0a 完成后:
```
Phase 0a 完成。COA 已准备为 Markdown ({coaLineCount} 行, mode={coaMode}, method={coaMethod})。
```

Phase 0b 完成后:
```
Phase 0b 完成。ELN 已准备为 Markdown ({elnLineCount} 行, mode={elnMode}, method={elnMethod})。
进入 Phase 1: 文档分类。
```

### Phase 1a/1b: 文档分类 (并行)

`1a` 与 `1b` 也是两条独立固定输出，分别记录 COA 与 ELN 的分类结果。

```
Phase 1a: COA 分类为 {coaDocType} ({coaDocTypeChinese})。
```

```
Phase 1b: ELN 分类为 {elnDocType} ({elnDocTypeChinese})。
进入 Phase 2: 提取结构化数据。
```

### Phase 2a/2b: 提取结构化数据 (并行)

ELN 提取时额外输出 elnScope:
```
Phase 2a 完成。COA docExtract: 批号={coaBatchNo}, 报告={coaReportNo}, 检测项={coaTestItemCount} 项。
```

```
Phase 2b 完成。ELN docExtract: elnScope={elnScope}, 取样点={elnSampleCount} 个, 检测项={elnTestItemCount} 项。
进入 Phase 3: 获取 LIMS 数据。
```

### Phase 3: 获取 LIMS 数据 (共享)

同上单文档模板，使用 COA.batchNo。

### Phase 3.5: ELN 数据筛选固定槽位 (joint)

```
Phase 3.5: ELN 数据筛选。elnScope={elnScope}。
  筛选方式: {filterMethod}（lims / coa-sampleIds / none）
  原始样品数: {originalSampleCount}
  筛选后样品数: {filteredSampleCount}
  排除样品ID: {excludedSampleIds}
  保留样品ID: {keptSampleIds}
```

`Phase 3.5` 在 joint mode 中始终保留独立槽位；`single-batch` 也要输出显式 no-op / passthrough 记录，不能把该决策并回 `Phase 2b` 或直接省略。

single-batch no-op 示例:
```
Phase 3.5: ELN 数据筛选。elnScope=single-batch。
  筛选方式: none
  原始样品数: {originalSampleCount}
  筛选后样品数: {originalSampleCount}
  排除样品ID: []
  保留样品ID: {allSampleIds}
```

若筛选不可用（LIMS 无数据 + COA 无 sampleIds）:
```
Phase 3.5 失败: 无法确定批次样品归属。
  LIMS: {limsStatus}
  COA sampleIds: {coaSampleIdsStatus}
  需人工介入，提供该批次的样品ID清单。
```

### Phase 4a/4b: 确定性规则 (并行)

```
Phase 4a: COA 确定性规则 — {deterministicRuleCount} 条 (executionMode={executionMode})...
Phase 4b: ELN 确定性规则 — {deterministicRuleCount} 条 (executionMode={executionMode})...
```

### Phase 5a/5b: 语义规则 (并行) + Phase 5c: 跨文档规则

`5a`、`5b`、`5c` 必须各自输出独立进度，不能合并成单条总结。

```
Phase 5a: COA 语义规则完成。
```

```
Phase 5b: ELN 语义规则完成。
```

```
Phase 5c: 跨文档一致性规则 — 分析 5 条跨文档规则 (X001-X005)。
```

### Phase 6: 合并结果 (joint)

```
Phase 6 完成。全部 {totalRules} 条规则已评估 (COA 32 + ELN 32 + 5 跨文档)。
  PASS: {passCount} | FAIL: {failCount} | SKIP: {skipCount}
  Overall: {overallResult}
  Corrections: {correctionCount}
  ELN 筛选: {filteredSampleCount}/{originalSampleCount} 样品

进入 Phase 7: 生成审核报告。
```

### Phase 7: 输出文件 (joint)

```
联合审核结果已保存至 outputs/{batchNo}-joint-results.json
联合审核报告已保存至 outputs/{batchNo}-joint-audit-report.md
联合会话日志已保存至 outputs/{batchNo}-joint-session-log.jsonl
报告脚本: exitCode={reportExitCode}, warnings={reportWarningCount}
日志校验: result={validationResult}, exitCode={validationExitCode}
```
