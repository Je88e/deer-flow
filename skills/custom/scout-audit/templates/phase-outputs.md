# Phase 固定输出模板

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
> **注:** {ruleId} 原始判定为 FAIL。{correctionReason}，修正为 PASS。
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
