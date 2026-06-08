# Session Log Schema — JSONL 格式

会话日志采用 JSONL 格式，每行一条独立 JSON。它是结构化审计证据，不是进度摘要，也不是 Markdown。

## 文件路径

`outputs/{reportNo}-session-log.jsonl`

## 总体约束

1. **恰好 8 行**: Phase 0-7 各一行，按顺序出现。
2. **固定顶层字段**: 每行 MUST 包含 `phase`, `name`, `timestamp`。
3. **规范字段名**: 使用 `name`, `data`, `method`, `calls`, `results`, `outputFiles` 等 schema 字段；不要用 `description` 或 `status` 代替结构。
4. **结构化载荷**: 不要把关键结果压缩成 `"20 rule results"`、`"3 artifacts"` 这类摘要字符串。
5. **ISO-8601 时间戳**: `timestamp` 必须可被 `new Date(timestamp)` 解析，且包含时区信息。
6. **写入前验证**: 必须运行 `npx tsx skills/custom/scout-audit/scripts/validate-session-log.ts outputs/{reportNo}-session-log.jsonl`。

## 行格式定义

### Phase 0: pdfConvert

必需字段: `input.filePath`, `input.fileType`, `output.lineCount`, `output.method`, `output.mode`

```json
{
  "phase": 0,
  "name": "pdfConvert",
  "timestamp": "2026-04-27T10:00:00+08:00",
  "input": { "filePath": "rules/xxx.pdf", "fileType": "pdf" },
  "output": { "lineCount": 45, "method": "markitdown", "mode": "convert" }
}
```

Markdown / 纯文本输入也必须保留 Phase 0，只是使用 `passthrough`:

```json
{
  "phase": 0,
  "name": "pdfConvert",
  "timestamp": "2026-04-27T10:00:00+08:00",
  "input": { "filePath": "rules/xxx.md", "fileType": "markdown" },
  "output": { "lineCount": 45, "method": "read-markdown", "mode": "passthrough" }
}
```

### Phase 1: classify

必需字段: `output.docType`, `output.docTypeChinese`

```json
{
  "phase": 1,
  "name": "classify",
  "timestamp": "2026-04-27T10:00:05+08:00",
  "output": { "docType": "COA", "docTypeChinese": "检验报告/Test Report" }
}
```

### Phase 2: docExtract

必需字段: `data`，且内容应与 `schemas/docExtract-schema.md` 一致。

```json
{
  "phase": 2,
  "name": "docExtract",
  "timestamp": "2026-04-23T10:30:00+08:00",
  "data": { /* 完整 docExtract JSON */ }
}
```

### Phase 3: limsData

必需字段: `method`, `dependencyStatus`, `calls[]`

`method` 允许值:
- `aggregated`
- `individual`
- `unavailable`

`dependencyStatus` 允许值:
- `available`
- `degraded`
- `unavailable`

`calls[]` 每项必须包含:
- `tool`
- `params`
- `response` 或 `error`
- `durationMs`

聚合调用模式:

```json
{
  "phase": 3,
  "name": "limsData",
  "timestamp": "2026-04-23T10:31:00+08:00",
  "method": "aggregated",
  "dependencyStatus": "available",
  "calls": [
    {
      "tool": "fetch_all_lims_data",
      "params": { "batchNo": "...", "reportNo": "...", "standardRef": "...", "personnelNames": [], "instrumentNos": [], "asOfDate": "...", "docType": "..." },
      "response": { /* 完整响应 */ },
      "durationMs": 1200
    }
  ]
}
```

单独调用回退模式:

```json
{
  "phase": 3,
  "name": "limsData",
  "timestamp": "2026-04-23T10:31:00+08:00",
  "method": "individual",
  "dependencyStatus": "degraded",
  "calls": [
    { "tool": "fetch_request_form", "params": { "batchNo": "..." }, "response": { /* 完整响应 */ }, "durationMs": 200 },
    { "tool": "check_report_unique", "params": { "reportNo": "..." }, "response": { /* 完整响应 */ }, "durationMs": 150 }
  ]
}
```

完全不可用时:

```json
{
  "phase": 3,
  "name": "limsData",
  "timestamp": "2026-04-23T10:31:00+08:00",
  "method": "unavailable",
  "dependencyStatus": "unavailable",
  "calls": [
    {
      "tool": "fetch_all_lims_data",
      "params": { "batchNo": "...", "reportNo": "..." },
      "error": { "code": "MCP_UNAVAILABLE", "message": "connector offline" },
      "durationMs": 120
    }
  ]
}
```

### Phase 4: deterministicRules

必需字段: `input.docType`, `input.testItemCount`, `input.limsDataSources`, `input.executionMode`, `output.passCount`, `output.failCount`, `output.skipCount`, `output.results`

`input.executionMode` 允许值:
- `rule-engine`
- `inline-fallback`

若 `executionMode = "inline-fallback"`，建议附加 `input.degradedRules[]` 说明哪些规则依赖降级或改为 `SKIP`

`output.results` MUST 恰好 20 条，且:
- `passCount + failCount + skipCount = 20`
- `results.length = 20`

```json
{
  "phase": 4,
  "name": "deterministicRules",
  "timestamp": "2026-04-23T10:32:00+08:00",
  "input": {
    "docType": "ELN",
    "testItemCount": 3,
    "limsDataSources": 8,
    "executionMode": "rule-engine"
  },
  "output": {
    "passCount": 13,
    "failCount": 2,
    "skipCount": 5,
    "results": [ /* 完整规则结果数组，MUST 恰好 20 条 */ ]
  }
}
```

### Phase 5: semanticRules

必需字段: `results`

`results` MUST:
- 恰好 12 条
- 每个对象都使用 `ruleId` 字段
- 记录每条语义规则的 `ruleId`, `ruleName`, `status`, `details`

```json
{
  "phase": 5,
  "name": "semanticRules",
  "timestamp": "2026-04-23T10:33:00+08:00",
  "results": [
    { "ruleId": "N002", "ruleName": "结果在可选结果内", "status": "SKIP", "details": "无定性检测项目" },
    { "ruleId": "E001", "ruleName": "人员资质校验", "status": "PASS", "details": "..." }
  ]
}
```

### Phase 6: merge

必需字段: `input.deterministicCount`, `input.semanticCount`, `output.totalRules`, `output.passCount`, `output.failCount`, `output.skipCount`, `output.overallResult`, `output.corrections`

一致性约束:
- `input.deterministicCount = 20`
- `input.semanticCount = 12`
- `output.totalRules = 32`
- `output.passCount + output.failCount + output.skipCount = 32`
- `output.corrections` 使用与 `results.json` 相同的对象数组结构

```json
{
  "phase": 6,
  "name": "merge",
  "timestamp": "2026-04-23T10:33:30+08:00",
  "input": {
    "deterministicCount": 20,
    "semanticCount": 12
  },
  "output": {
    "totalRules": 32,
    "passCount": 20,
    "failCount": 0,
    "skipCount": 12,
    "corrections": [
      {
        "ruleId": "R002",
        "originalStatus": "FAIL",
        "correctedTo": "PASS",
        "reason": "isDetectionLimit=true，按规则豁免"
      },
      {
        "ruleId": "R004",
        "originalStatus": "FAIL",
        "correctedTo": "PASS",
        "reason": "isDetectionLimit=true，按规则豁免"
      }
    ],
    "overallResult": "PASS"
  }
}
```

### Phase 7: summary

必需字段: `mcpCallCount`, `overallResult`, `outputFiles`, `dependencyStatus`, `reportGeneration`, `sessionLogValidation`

`outputFiles` 必须包含:
- `outputs/{reportNo}-results.json`
- `outputs/{reportNo}-audit-report.md`
- `outputs/{reportNo}-session-log.jsonl`

`reportGeneration` 必须包含:
- `command`
- `exitCode`
- `warnings`
- `outputPath`

`sessionLogValidation` 必须包含:
- `command`
- `exitCode`
- `result`

`dependencyStatus` 必须至少包含:
- `lims`
- `ruleEngine`

```json
{
  "phase": 7,
  "name": "summary",
  "timestamp": "2026-04-23T10:35:00+08:00",
  "mcpCallCount": 9,
  "overallResult": "FAIL",
  "dependencyStatus": {
    "lims": "available",
    "ruleEngine": "available"
  },
  "reportGeneration": {
    "command": "npx tsx skills/custom/scout-audit/scripts/generate-report.ts outputs/{reportNo}-results.json outputs/{reportNo}-audit-report.md",
    "exitCode": 0,
    "warnings": [],
    "outputPath": "outputs/{reportNo}-audit-report.md"
  },
  "sessionLogValidation": {
    "command": "npx tsx skills/custom/scout-audit/scripts/validate-session-log.ts outputs/{reportNo}-session-log.jsonl outputs/{reportNo}-results.json",
    "exitCode": 0,
    "result": "OK"
  },
  "outputFiles": [
    "outputs/{reportNo}-results.json",
    "outputs/{reportNo}-audit-report.md",
    "outputs/{reportNo}-session-log.jsonl"
  ]
}
```

## 常见无效模式

- 仅写 `description` + `status` + 字符串型 `input`/`output`
- Phase 3 只保留聚合摘要，不保留 `calls[].response` / `error`
- Phase 4 只写 `failRules`/`skipRules`，不写完整 `output.results`
- Phase 5 用状态 map 或计数字段代替 12 条结构化 `results[]`
- Phase 6 计数与 Phase 4/5 实际结果不一致
- Phase 6 仍使用 `correctionsApplied: string[]`，未与 `results.json` 对齐
- Phase 7 只列三条输出路径，不写报告脚本与校验脚本执行结果

## 校验规则

写入 JSONL 文件前，每条记录必须满足:

1. **JSON 合法性**: 每行必须是可解析的 JSON (`JSON.parse()` 不抛错)
2. **Phase 完整性**: Phase 0-7 必须按顺序出现，不可跳过 (共 8 行)
3. **顶层字段**: 每行必须包含 `phase`, `name`, `timestamp`
4. **字段命名**: 使用 `ruleId` 而不是 `ruleruleId` 或其他变体
5. **Phase 0 模式**: `output.mode` 必须是 `convert` 或 `passthrough`，且 `input.fileType` 非空
6. **Phase 3 结构**: `calls[]` 必须包含完整 `response` 或结构化 `error`，不接受 `responseSummary` 字符串
7. **Phase 4 数量一致性**: `output.results` 必须 20 条，且 `passCount + failCount + skipCount = 20`
8. **Phase 5 数量一致性**: `results` 必须 12 条
9. **Phase 6 数量一致性**: `totalRules = 32`，且 `passCount + failCount + skipCount = 32`
10. **Phase 6 corrections 契约**: `output.corrections` 必须存在，且每项都包含 `ruleId`, `originalStatus`, `correctedTo`, `reason`
11. **Phase 7 可观测性**: 必须记录 `reportGeneration` 与 `sessionLogValidation` 对象
12. **results/session-log 一致性**: 若同目录存在 `results.json`，其 `corrections[]` 与 Phase 6 的 `output.corrections[]` 数量和 `ruleId` 必须一致
13. **时间戳格式**: 所有 `timestamp` 必须是 ISO-8601 且含时区
