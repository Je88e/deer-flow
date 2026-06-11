# Session Log Schema — JSONL 格式

> **Ownership:** 本文件是 `session-log.jsonl` 的权威结构定义与记录粒度来源；`SKILL.md` 只引用 session log contract，不重复字段级说明。

会话日志采用 JSONL 格式，每行一条独立 JSON。它是结构化审计证据，不是进度摘要，也不是 Markdown。

## 文件路径

- `single`: `outputs/{reportNo}-session-log.jsonl`
- `joint`: `outputs/{batchNo}-joint-session-log.jsonl`

## 总体约束

1. **固定行数**: `single` 恰好 8 行（Phase 0-7 各一行）；`joint` 恰好 15 行（`0a,0b,1a,1b,2a,2b,3,3.5,4a,4b,5a,5b,5c,6,7`）。
2. **固定顶层字段**: 每行 MUST 包含 `phase`, `name`, `timestamp`。
3. **规范字段名**: 使用 `name`, `data`, `method`, `calls`, `results`, `outputFiles` 等 schema 字段；不要用 `description` 或 `status` 代替结构。
4. **结构化载荷**: 不要把关键结果压缩成 `"20 rule results"`、`"3 artifacts"` 这类摘要字符串。
5. **ISO-8601 时间戳**: `timestamp` 必须可被 `new Date(timestamp)` 解析，且包含时区信息。
6. **禁止骨架占位交付**: `generate-session-log.ts` 生成的骨架只能作为补写起点；若仍保留 `Generated from results.json`、`replace with full docExtract`、`replace with actual response`、`FILL_ME`、或同类占位文本，则该日志不具备交付资格。
7. **禁止无效执行默认值**: Phase 3 的真实调用 `durationMs` 必须为正数；若 Phase 4 标记为真实执行（尤其 `executionMode = "rule-engine"`）却仍保留 `testItemCount = 0`、`limsDataSources = 0` 这类骨架默认值，视为未补全证据。
8. **写入前验证**:
   - `single`: `npx tsx .claude/skills/scout-audit/scripts/validate-session-log.ts outputs/{reportNo}-session-log.jsonl outputs/{reportNo}-results.json`
   - `joint`: `npx tsx .claude/skills/scout-audit/scripts/validate-session-log.ts outputs/{batchNo}-joint-session-log.jsonl outputs/{batchNo}-joint-results.json`
9. **自动生成 (推荐)**: 使用 `scripts/generate-session-log.ts` 从 results.json 自动生成 session-log 骨架，然后手动补充 Phase 0 源文件信息与 Phase 7 脚本执行结果:

```bash
npx tsx .claude/skills/scout-audit/scripts/generate-session-log.ts outputs/{reportNo}-results.json
```

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

交付约束:
- 不接受仅含骨架 `_summary` 的占位提取结果
- 不接受 `Generated from results.json` / `replace with full docExtract` 一类提示语残留在最终 JSONL 中

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

交付约束:
- `response` / `error` 必须是实际调用证据，不接受 `Generated from results.json` / `replace with actual response` 之类骨架占位
- 对已发生的调用，`durationMs` 必须是正数；`0` 仅代表骨架默认值，不能作为真实交付证据

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

交付约束:
- `input.testItemCount`、`input.limsDataSources` 必须反映真实运行计数
- 若 `executionMode = "rule-engine"` 且存在非 `SKIP` 结果，`testItemCount = 0` 或 `limsDataSources = 0` 视为骨架默认值未替换

`output.results` MUST 恰好 20 条，且:
- `passCount + failCount + skipCount = 20`
- `results.length = 20`
- 每条 result MUST 包含 `ruleId`, `ruleName`, `status`, `severity`, `details`

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
    "results": [
      { "ruleId": "B001", "ruleName": "样品批号准确", "status": "PASS", "severity": "severe", "details": "批号格式正确" },
      { "ruleId": "B002", "ruleName": "产品信息完整", "status": "FAIL", "severity": "severe", "details": "字段缺失" }
    ]
  }
}
```

### Phase 5: semanticRules

必需字段: `results`

`results` MUST:
- 恰好 12 条
- 每个对象都使用 `ruleId` 字段
- 记录每条语义规则的 `ruleId`, `ruleName`, `status`, `severity`, `details`

```json
{
  "phase": 5,
  "name": "semanticRules",
  "timestamp": "2026-04-23T10:33:00+08:00",
  "results": [
    { "ruleId": "N002", "ruleName": "结果在可选结果内", "status": "SKIP", "severity": "severe", "details": "无定性检测项目" },
    { "ruleId": "E001", "ruleName": "人员资质校验", "status": "PASS", "severity": "severe", "details": "人员王斌资质有效" }
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
    "command": "npx tsx .claude/skills/scout-audit/scripts/generate-report.ts outputs/{reportNo}-results.json outputs/{reportNo}-audit-report.md",
    "exitCode": 0,
    "warnings": [],
    "outputPath": "outputs/{reportNo}-audit-report.md"
  },
  "sessionLogValidation": {
    "command": "npx tsx .claude/skills/scout-audit/scripts/validate-session-log.ts outputs/{reportNo}-session-log.jsonl outputs/{reportNo}-results.json",
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

---

## Joint Mode Session Log

联合模式 (`auditMode="joint"`) 的 session log 固定为 15 行。路径使用 `outputs/{batchNo}-joint-session-log.jsonl`。

`validate-session-log.ts` 当前按固定布局校验 `[0a,0b,1a,1b,2a,2b,3,3.5,4a,4b,5a,5b,5c,6,7]`，因此 `3.5` 是 joint mode 的固定槽位，即使 `elnScope = "single-batch"` 也必须保留显式记录。

### 行序列

| 行序 | phase | name | 说明 |
|------|-------|------|------|
| 1 | 0a | pdfConvert | COA 源文档准备 |
| 2 | 0b | pdfConvert | ELN 源文档准备 |
| 3 | 1a | classify | COA 文档分类 |
| 4 | 1b | classify | ELN 文档分类 |
| 5 | 2a | docExtract | COA 结构化提取 |
| 6 | 2b | docExtract | ELN 结构化提取（含 elnScope） |
| 7 | 3 | limsData | LIMS 数据获取（共享，使用 COA.batchNo） |
| 8 | 3.5 | elnFiltering | ELN 数据筛选固定槽位；`multi-batch` 记录真实筛选，`single-batch` 记录显式 no-op |
| 9 | 4a | deterministicRules | COA 确定性规则 (20) |
| 10 | 4b | deterministicRules | ELN 确定性规则 (20) |
| 11 | 5a | semanticRules | COA 语义规则 (12) |
| 12 | 5b | semanticRules | ELN 语义规则 (12) |
| 13 | 5c | crossDocumentRules | 跨文档规则 (5) |
| 14 | 6 | merge | 合并全部结果 |
| 15 | 7 | summary | 产物输出与校验 |

### Phase 3.5: elnFiltering (joint fixed slot)

```json
{
  "phase": "3.5",
  "name": "elnFiltering",
  "timestamp": "2026-05-11T10:32:00+08:00",
  "input": {
    "elnScope": "multi-batch",
    "originalSampleCount": 17,
    "filterMethod": "lims",
    "batchNo": "B2025051101"
  },
  "output": {
    "filteredSampleCount": 6,
    "excludedSampleIds": ["250511-20551", "250511-20559", "..."],
    "keptSampleIds": ["250511-20201", "250511-20210", "..."]
  }
}
```

若 `elnScope = "single-batch"`，也必须写显式 no-op / passthrough 记录，而不是省略该行:

```json
{
  "phase": "3.5",
  "name": "elnFiltering",
  "timestamp": "2026-05-11T10:32:00+08:00",
  "input": {
    "elnScope": "single-batch",
    "originalSampleCount": 6,
    "filterMethod": "none"
  },
  "output": {
    "filteredSampleCount": 6,
    "excludedSampleIds": [],
    "keptSampleIds": ["250511-20201", "250511-20210", "250511-20214", "250511-20551", "250511-20559", "250511-20560"]
  }
}
```

若筛选不可用（报错前记录）:
```json
{
  "phase": "3.5",
  "name": "elnFiltering",
  "timestamp": "2026-05-11T10:32:00+08:00",
  "input": {
    "elnScope": "multi-batch",
    "originalSampleCount": 17,
    "filterMethod": "unavailable"
  },
  "output": {
    "filteredSampleCount": 0,
    "excludedSampleIds": [],
    "keptSampleIds": []
  },
  "error": {
    "code": "FILTER_IMPOSSIBLE",
    "message": "无法确定批次样品归属：LIMS 无数据且 COA 无 sampleIds",
    "recoverable": false,
    "suggestedAction": "提供该批次的样品ID清单或LIMS数据"
  }
}
```

即使记录失败，也必须保留 `output.filteredSampleCount`、`output.excludedSampleIds`、`output.keptSampleIds`，否则不会通过 `validate-session-log.ts`。

`input.filterMethod` 允许值:
- `lims` — 通过 LIMS 数据筛选
- `coa-sampleIds` — 通过 COA 的 sampleIds 筛选
- `none` — 无需筛选（single-batch 直通）
- `unavailable` — 筛选不可用（需人工介入）

### Phase 5c: crossDocumentRules (joint-only)

```json
{
  "phase": "5c",
  "name": "crossDocumentRules",
  "timestamp": "2026-05-11T10:35:00+08:00",
  "results": [
    { "ruleId": "X001", "ruleName": "结果数据一致", "status": "PASS", "severity": "severe", "details": "COA与ELN结果一致" },
    { "ruleId": "X002", "ruleName": "签名角色对应", "status": "PASS", "severity": "warning", "details": "签名角色一致" },
    { "ruleId": "X003", "ruleName": "日期逻辑一致", "status": "FAIL", "severity": "severe", "details": "COA报告日期晚于ELN完成日期" },
    { "ruleId": "X004", "ruleName": "检测项目覆盖", "status": "PASS", "severity": "severe", "details": "检测项目完全覆盖" },
    { "ruleId": "X005", "ruleName": "仪器使用一致", "status": "SKIP", "severity": "warning", "details": "ELN无仪器数据" }
  ]
}
```

`results` MUST 恰好 5 条 (X001-X005)。每条 result MUST 包含 `ruleId`, `ruleName`, `status`, `severity`, `details`。

### Phase 6: merge (joint)

> **注意:** joint Phase 6 的 `input` 使用 `coaDeterministicCount/coaSemanticCount/elnDeterministicCount/elnSemanticCount/crossDocumentCount` 前缀字段名，不同于 single 模式的 `deterministicCount/semanticCount`。

```json
{
  "phase": 6,
  "name": "merge",
  "timestamp": "2026-05-11T10:35:30+08:00",
  "input": {
    "coaDeterministicCount": 20,
    "coaSemanticCount": 12,
    "elnDeterministicCount": 20,
    "elnSemanticCount": 12,
    "crossDocumentCount": 5
  },
  "output": {
    "totalRules": 69,
    "passCount": 45,
    "failCount": 8,
    "skipCount": 16,
    "corrections": [],
    "overallResult": "FAIL",
    "elnFiltering": {
      "elnScope": "multi-batch",
      "originalSampleCount": 17,
      "filteredSampleCount": 6
    }
  }
}
```

### Phase 7: summary (joint)

```json
{
  "phase": 7,
  "name": "summary",
  "timestamp": "2026-05-11T10:36:00+08:00",
  "mcpCallCount": 12,
  "auditMode": "joint",
  "overallResult": "FAIL",
  "dependencyStatus": {
    "lims": "available",
    "ruleEngine": "available"
  },
  "reportGeneration": {
    "command": "npx tsx .claude/skills/scout-audit/scripts/generate-report.ts outputs/{batchNo}-joint-results.json outputs/{batchNo}-joint-audit-report.md",
    "exitCode": 0,
    "warnings": [],
    "outputPath": "outputs/{batchNo}-joint-audit-report.md"
  },
  "sessionLogValidation": {
    "command": "npx tsx .claude/skills/scout-audit/scripts/validate-session-log.ts outputs/{batchNo}-joint-session-log.jsonl outputs/{batchNo}-joint-results.json",
    "exitCode": 0,
    "result": "OK"
  },
  "outputFiles": [
    "outputs/{batchNo}-joint-results.json",
    "outputs/{batchNo}-joint-audit-report.md",
    "outputs/{batchNo}-joint-session-log.jsonl"
  ]
}
```

---

## 常见无效模式

- 仅写 `description` + `status` + 字符串型 `input`/`output`
- Phase 3 只保留聚合摘要，不保留 `calls[].response` / `error`
- Phase 2 / Phase 3 仍保留 `Generated from results.json`、`replace with ...`、`FILL_ME` 等骨架占位
- Phase 3 调用 `durationMs = 0`
- Phase 4 在 `executionMode = "rule-engine"` 下仍保留 `testItemCount = 0` 或 `limsDataSources = 0`
- Phase 4 只写 `failRules`/`skipRules`，不写完整 `output.results`
- Phase 5 用状态 map 或计数字段代替 12 条结构化 `results[]`
- Phase 6 计数与 Phase 4/5 实际结果不一致
- Phase 6 仍使用 `correctionsApplied: string[]`，未与 `results.json` 对齐
- Phase 7 只列三条输出路径，不写报告脚本与校验脚本执行结果

## 校验规则

写入 JSONL 文件前，每条记录必须满足:

1. **JSON 合法性**: 每行必须是可解析的 JSON (`JSON.parse()` 不抛错)
2. **Phase 完整性**: single 必须为 Phase 0-7 共 8 行；joint 必须按 `[0a,0b,1a,1b,2a,2b,3,3.5,4a,4b,5a,5b,5c,6,7]` 固定顺序出现，共 15 行
3. **顶层字段**: 每行必须包含 `phase`, `name`, `timestamp`
4. **字段命名**: 使用 `ruleId` 而不是 `ruleruleId` 或其他变体
5. **Phase 0 模式**: `output.mode` 必须是 `convert` 或 `passthrough`，且 `input.fileType` 非空
6. **禁止占位残留**: 不得在任何 phase 中保留 `Generated from results.json`、`replace with full docExtract`、`replace with actual response`、`FILL_ME` 等骨架占位文本
7. **Phase 3 结构**: `calls[]` 必须包含完整 `response` 或结构化 `error`，不接受 `responseSummary` 字符串；真实调用 `durationMs` 必须大于 0
8. **Phase 4 结构与数量一致性**: `single` 的 Phase 4、以及 `joint` 的 Phase `4a`/`4b`，`output.results` 都必须恰好 20 条。每条 result 必须包含 `ruleId`, `ruleName`, `status`, `severity`, `details`。且 `passCount + failCount + skipCount = 20`
9. **Phase 4 骨架默认值拦截**: 若 `executionMode = "rule-engine"` 且存在非 `SKIP` 结果，`testItemCount` 与 `limsDataSources` 都不得为 `0`
10. **Phase 5 结构与数量一致性**: `single` 的 Phase 5、以及 `joint` 的 Phase `5a`/`5b`，`results` 都必须恰好 12 条；`joint` 的 Phase `5c` 必须恰好 5 条。每条 result 必须包含 `ruleId`, `ruleName`, `status`, `severity`, `details`
11. **Phase 6 数量一致性**: `single` 的 `totalRules = 32`，且 `passCount + failCount + skipCount = 32`；`joint` 的 `totalRules = 69`，且 `passCount + failCount + skipCount = 69`
12. **Phase 6 corrections 契约**: `output.corrections` 必须存在，且每项都包含 `ruleId`, `originalStatus`, `correctedTo`, `reason`
13. **Phase 7 可观测性**: 必须记录 `reportGeneration` 与 `sessionLogValidation` 对象
14. **results/session-log 一致性**: 若同目录存在对应的 `results.json` / `joint-results.json`，其 `corrections[]` 与 Phase 6 的 `output.corrections[]` 数量和 `ruleId` 必须一致
15. **Joint 3.5 固定槽位**: `auditMode="joint"` 时，无论 `elnScope` 是 `multi-batch` 还是 `single-batch`，都必须存在 `phase = "3.5"` 的独立记录
16. **时间戳格式**: 所有 `timestamp` 必须是 ISO-8601 且含时区
