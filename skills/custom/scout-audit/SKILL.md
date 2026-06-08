---
name: scout-audit
description: Use when a user provides or references a lab COA (检验报告) or ELN (原始记录) file and asks for 审核, 审查, audit, review, or GMP/NMPA/ICH compliance checking. Applies to PDF, Markdown, or extracted text reports that contain batch and report identifiers.
---

# Scout Audit

## Overview

面向制药/实验室文档的合规审核技能。对 COA (检验报告) 和 ELN (原始记录) 按固定 8 个 phase 执行 32 条 NMPA/ICH/GMP 审核规则，并产出结构化结果、报告和会话日志。

核心原则:

- 先做 **Eligibility + Capability Handshake**，确认输入与依赖满足条件后再进入 Phase 0
- 8 个 phase 必须显式编排，输入来源、降级路径、输出验证都要写入结构化产物
- 任一步失败或验证不通过就停止，不得用自由文本掩盖静默失败

固定执行链路:

```text
Eligibility/Capability Check -> Phase 0 源文档准备 -> Phase 1 分类 -> Phase 2 提取 ->
Phase 3 LIMS -> Phase 4 确定性规则 -> Phase 5 语义规则 ->
Phase 6 合并 -> Phase 7 产物与校验
```

## When to Use

- 用户上传或给出 COA/ELN 的 `.pdf`、Markdown、纯文本内容
- 用户明确要求“审核 / 审查 / audit / review / 合规检查”
- 文档包含检测结果、签名、批号、报告编号、结论等审核要素
- 需要输出 `results.json`、审核报告和 `session-log.jsonl`

**NOT for:**

- SOP、方案、偏差报告、没有检测结果的通用文档
- 已经是 `scout-audit` 生成产物的报告二次审核
- 缺少 `reportNo` 或 `batchNo` 的文档

**遇到以下情况必须停下并与用户确认:**

- 关键依赖不可用，且降级策略会影响审核完整性
- 目标输出文件已存在，可能覆盖上一轮审核产物

## Prerequisites

**优先使用的 MCP / 能力:**

- `scout-lims-connector`：LIMS 聚合与明细查询，优先调用 `fetch_all_lims_data`
- `scout-rule-engine`：确定性规则执行，主入口 `run_all_rules`
- `Read`：读取 PDF / Markdown / 生成的报告文件
- PDF 转 Markdown 能力：Phase 0 主路径
- `pdf` skill：仅在确实存在且前述能力失败时作为回退

### Preflight Gate

进入 Phase 0 前先完成以下检查；这不是新增 phase，不写入 session log，但必须在思考链中显式执行:

1. **Eligibility**
   - 文档目的确实是 COA/ELN 审核，而不是总结、改写或报告生成
2. **Capability**
   - 确认 `scout-lims-connector` 是否可调用
   - 确认 `scout-rule-engine` 是否可调用
   - 对 `.pdf` 输入确认至少存在一种可用的 Markdown 转换路径
3. **Failure Policy**
   - 若 Eligibility 不满足：停止，不进入 Phase 0
   - 若关键 Capability 缺失且没有定义好的回退：停止，并返回缺失能力、影响范围、建议动作
   - 不允许“先乱试工具再临时补救”；能力检查失败时直接停下

**降级策略:**

- LIMS 不可用：执行可独立判断的规则，其余标记为 `SKIP`
- 规则引擎不可用：按 `rules/rule-map.md` 中算法内联执行确定性规则
- 任何降级都必须记录进 Phase 3/4/7 产物和日志，且不得伪装成正常路径
- 降级发生时，最终结论必须明确说明“审核完整性受限”；不得把它表述为“完整审核通过”

## Audit Contract

1. **只执行定义好的 32 条规则。** `rules/rule-map.md` 之外的规则不存在。
2. **Eligibility + Capability Handshake 必须先完成。** 这是进入 Phase 0 的前置条件，不计入 8 个 phase。
3. **Phase 0-7 必须完整执行。** Phase 6 不能并入 Phase 5，session log 必须单独记一行。
4. **Phase 0 永远执行，但只能是两种模式之一。** `mode = "convert"` 或 `mode = "passthrough"`；Markdown/纯文本不得伪造 PDF 转换。
5. **每个 phase 都使用固定进度输出。** 模板见 `templates/phase-outputs.md`。
6. **字段名必须与 schema 完全一致。** 例如 `reportNo`、`batchNo`、`docType`。
7. **输出产物固定为 3 个文件。**
   - `outputs/{reportNo}-results.json`
   - `outputs/{reportNo}-audit-report.md`
   - `outputs/{reportNo}-session-log.jsonl`
8. **若输出路径已存在，必须先与用户确认是否覆盖。** 不得静默复用或覆盖旧产物。
9. **先写 `results.json`，再生成报告和 session log。**
10. **FAIL 结果必须写明证据。** `evidence.expected`、`evidence.actual` 必填，必要时加 `location`。
11. **所有修正必须落到 `corrections[]` 和报告注释。**
12. **任何降级、回退、能力缺失都必须写入 Phase 3/4/7 的结构化字段。** 不得只写自然语言摘要。
13. **报告脚本和 session-log 校验都必须成功。** 任一脚本非零退出或结构校验不通过都视为失败。
14. **最终必须校验 session log，且要与 sibling `results.json` 交叉校验。** 运行 `validate-session-log.ts outputs/{reportNo}-session-log.jsonl outputs/{reportNo}-results.json` 后才能宣称完成。
15. **规则名称必须与 `rules/rule-map.md` 完全一致。** 不得重命名 (如 D001 只能叫 "修改规范"，不可改为 "页码连续完整")。
16. **`results.json` 字段名必须与 `schemas/report-schema.md` 完全一致。** `summary` 用 `passCount/failCount/skipCount` (不是 passed/failed/skipped)，`corrections[]` 用 `correctedTo` (不是 correctedStatus)，不得添加 schema 外顶层字段 (如 testItems)。
17. **session-log 每行必须包含 `phase` + `name` + `timestamp`，载荷必须是结构化对象。** 完整定义见 `templates/session-log-schema.md`。
18. **`signatureMethod: "image"` 只表示看见签名图像。** 只有确认存在图片/印章签名证据时才允许输出；姓名和日期都空不等于 image 签名。
19. **任一步前置条件或后置验证失败都必须停止。** 返回结构化失败摘要，至少包含 `failedStep`、`reason`、`recoverable`、`suggestedAction`。

## Quick Reference

| Phase | 目标 | 关键输入 | 关键输出 | 参考 |
| ----- | ---- | -------- | -------- | ---- |
| 0 | 源文档准备 (`convert` / `passthrough`) | 文件路径或原文 | Markdown 文本 + `mode` + `method` | `templates/phase-outputs.md` |
| 1 | 判断 `COA`/`ELN` | Markdown | `docType` | `prompts/classify.md` |
| 2 | 生成 `docExtract` | Markdown + `docType` | `docExtract` JSON | `schemas/docExtract-schema.md`, `prompts/extract.md` |
| 3 | 获取 `limsData` | `docExtract` | `limsData` JSON + `dependencyStatus` | `schemas/limsData-schema.md` |
| 4 | 跑 20 条确定性规则 | `docExtract` + `limsData` + `docType` | 20 条结果 + `executionMode` | `rules/rule-map.md`, `run_all_rules` |
| 5 | 跑 12 条语义规则并修正特殊场景 | `docExtract` + `limsData` | 12 条结果 + 修正说明 | `prompts/semantic-audit.md` |
| 6 | 合并并计算总判定 | Phase 4 + 5 | 32 条结果 + `overallResult` | `schemas/report-schema.md` |
| 7 | 写入并校验产物 | 合并结果 | 3 个输出文件 + 脚本执行结果 | `templates/report-template.md`, `templates/session-log-schema.md` |

## Session Log

每行 MUST 包含 `phase` + `name` + `timestamp`(ISO-8601+时区)。`name` 值固定为: pdfConvert, classify, docExtract, limsData, deterministicRules, semanticRules, merge, summary。

- Phase 0 必须记录 `input.fileType`、`output.mode`、`output.method`
- Phase 3 必须记录 `dependencyStatus`、真实调用列表、完整响应或错误信息
- Phase 4 必须记录 `executionMode`，并在降级时列出 `degradedRules`
- Phase 7 必须记录报告脚本和校验脚本的执行结果，不能只列产物路径

完整行结构定义、必需载荷字段、校验规则见 `templates/session-log-schema.md`。

## Preflight

在 Phase 0 之前执行:

1. 排除 `results.json` / 审核报告 / `session-log.jsonl` 这类已生成产物
2. 检查 `scout-lims-connector`、`scout-rule-engine`、PDF 转换能力是否可用
3. 检查目标输出文件是否已存在

任何一步失败:

- 立即停止，不进入 Phase 0
- 返回缺失条件、影响 phase、是否可恢复、建议动作
- 不得靠猜测填值，不得继续“试试看”

## Phase Workflow

### Phase 0: 源文档准备

- 输入是 `.pdf` 时，按顺序尝试：PDF 转 Markdown 能力 -> `Read` -> `pdf` skill。
- 输入已是 Markdown / 纯文本时，执行 `passthrough`，保留原文进入 Phase 1。
- 转换后检查表格是否断裂、中文是否乱码。
- `docType` 在 Phase 1 才能确定，Phase 0 进度输出不得预先假定文档类型。
- Phase 0 session log 必须记录:
  - `input.filePath`
  - `input.fileType`
  - `output.mode = "convert" | "passthrough"`
  - `output.method`
- 固定输出必须使用 `templates/phase-outputs.md` Phase 0 模板。

### Phase 1: 文档分类

- 按 `prompts/classify.md` 判断。输出只允许 `"COA"` 或 `"ELN"`。
- 优先看标题/页眉，不确定时检查签名结构。

### Phase 2: 提取 `docExtract`

- 按 `schemas/docExtract-schema.md` + `prompts/extract.md` 提取。
- Phase 0 的 Markdown 原文必须保留，供 Phase 5 中 L002/L003/C001/C002 使用。
- 前置条件: `docType` 已确定且 Markdown 原文已准备好。

### Phase 3: 获取 `limsData`

优先聚合调用 `fetch_all_lims_data(batchNo, reportNo, standardRef, personnelNames, instrumentNos, asOfDate, docType, qualitativeItems)`。仅在聚合调用失败时，才按 `schemas/limsData-schema.md` 的组合查询策略拆分调用。

如果 LIMS 不可用:

- 按 `rules/rule-map.md` 的 “LIMS 依赖分类” 只执行可独立评估规则
- 其余规则标记 `SKIP`
- 在 session log Phase 3 中保留真实调用方式、完整响应结构或错误信息
- `method` 只能是 `aggregated`、`individual`、`unavailable`
- `dependencyStatus` 必须显式标记 `available`、`degraded` 或 `unavailable`
- 若最终是 `unavailable`，Phase 7 必须再次说明审核完整性受限

### Phase 4: 确定性规则

调用 `run_all_rules`，输入含 `docExtract`、`limsData`、`docType`。总数必须是 20 条。

- COA/ELN 专用规则必须先按 `docType` 过滤适用性。
- 若规则引擎不可用，按 `rules/rule-map.md` 的算法手动执行，不要自创规则。
- `S001` 不能退化成“只看 role 是否存在”；`S004` 不能退化成“只看 workflow 有没有 skipped”。
- `S004` 的 workflow 来源固定为 `limsData.workflow`。
- session log Phase 4 必须记录 `executionMode = "rule-engine" | "inline-fallback"`。
- 若进入 `inline-fallback`，必须记录 `degradedRules[]` 或明确说明哪些规则因依赖缺失而 `SKIP`。

### Phase 5: 语义规则

- 总数必须是 12 条。详细判定指引见 `prompts/semantic-audit.md` 与 `rules/rule-map.md`。
- L002/L003/C001/C002 需要传入 Phase 0 的 Markdown 原文作为 `markdownText` 输入。
- 注意 `N002` 允许合理部分匹配，`L003` 仅 ELN，`C001` 仅 COA 且不能只写“合格”。

**必须保持一致的场景:**

1. **检测限:** 判定以 Phase 4 规则引擎输出为准；Phase 5 不得把未在规则引擎硬编码的 detection-limit 场景临时修正为 PASS
2. **COA 总结论:** L001 单项结论为空时检查总结论，一致则修正为 PASS

### Phase 6: 合并结果

- 合并 Phase 4 与 Phase 5 的全部结果，合计必须是 32 条。
- 按严重级别排序：`severe` > `warning` > `info`。
- 计算:

```text
overallResult = FAIL             if any severe FAIL
overallResult = CONDITIONAL_PASS if any non-severe FAIL and no severe FAIL
overallResult = PASS             if no FAIL
```

- 本 phase 必须在 session log 单独记录。
- 本 phase 只负责计算规则结果，不负责掩盖降级；降级说明要继续保留到 Phase 7。

### Phase 7: 写入产物

#### Step 1: 先写 `results.json`

- 路径：`outputs/{reportNo}-results.json`
- 结构：`schemas/report-schema.md`
- 写入前检查:
  - 顶层字段是 flat 结构，不要嵌套
  - `ruleResults.length === 32`
  - 每条 `ruleResults[].ruleName` 与 `rules/rule-map.md` 一致
  - FAIL 的 `evidence` 与 `remediation` 非空
  - 所有修正进入 `corrections[]`，字段名用 `correctedTo`
  - `summary` 子字段用 `passCount/failCount/skipCount` (不是 passed/failed/skipped)
  - 不含 schema 外顶层字段 (如 `testItems`)
  - 若 Phase 3/4 有降级，`metadata` 中要明确记录依赖可用性与生成方式

#### Step 2: 生成审核报告

- 模板必须符合 `templates/report-template.md`
- **必须先执行脚本**（不得跳过直接手写报告）:

```bash
npx tsx skills/custom/scout-audit/scripts/generate-report.ts outputs/{reportNo}-results.json outputs/{reportNo}-audit-report.md
```

- 仅当脚本执行失败（报错退出）时，才按 `templates/report-template.md` 模板手动生成
- 手动生成时也必须严格遵循模板结构，不得添加模板外的自定义章节
- 生成后用 `Read` 读取 `.md` 进行输出
- 必须记录:
  - `command`
  - `exitCode`
  - `stderrSummary`
  - `warnings[]`
  - `outputPath`

#### Step 3: 写入并校验 session log

- 路径：`outputs/{reportNo}-session-log.jsonl`
- 结构必须符合 `templates/session-log-schema.md`（8 行 JSONL，Phase 0-7 各一行）
- 最终校验 (**必须通过后才能宣称完成**):

```bash
npx tsx skills/custom/scout-audit/scripts/validate-session-log.ts outputs/{reportNo}-session-log.jsonl outputs/{reportNo}-results.json
```

- 必须记录:
  - `command`
  - `exitCode`
  - `result = "OK" | "INVALID"`
  - `stderrSummary`

#### Step 4: 交付前最小验证

- 修改 `schema`、`template`、`script` 后，必须运行:

```bash
npx tsx skills/custom/scout-audit/scripts/run-minimal-regression.ts
```

- 回归失败时，不得宣称 skill 已完成修复

## Key References

- 32 条规则与适用范围：`rules/rule-map.md`
- `docExtract` 字段与提取要求：`schemas/docExtract-schema.md`
- LIMS 组合查询与字段：`schemas/limsData-schema.md`
- `results.json` 权威结构：`schemas/report-schema.md`
- 固定 phase 输出：`templates/phase-outputs.md`
- 审核报告模板：`templates/report-template.md`
- `session-log.jsonl` 结构：`templates/session-log-schema.md`
- 语义规则提示词：`prompts/semantic-audit.md`
- 报告生成脚本：`scripts/generate-report.ts`
- 会话日志校验脚本：`scripts/validate-session-log.ts`
- 最小回归：`scripts/run-minimal-regression.ts`

## Common Mistakes

> Audit Contract 已覆盖的规则（如字段名、产物顺序、session log 结构）不再重复列出。以下为高频独特错误。

| Mistake | Fix |
| ------- | --- |
| COA/ELN 规则混用 | 先判断 `docType`，再决定不适用规则标记 `SKIP` |
| 漏传 Phase 0 Markdown 给 Phase 5 | L002/L003/C001/C002 依赖原文，必须传入 `markdownText` |
| 把 `N002` 当数值比较 | `N002` 只用于定性结果 (qualitative)，不做数值范围判断 |
| 用"四舍五入"替代"四舍六入五成双" | `R002` 必须按 `rules/rule-map.md` 的 Round Half To Even 算法 |
| 检测限结果直接报 FAIL | `isDetectionLimit: true` 时 R002/R004 豁免，N001 按规格自动 PASS |
| 把空签名当成图片签名 | `signatureMethod: "image"` 只在确认存在图片/印章签名证据时使用；姓名和日期都空就是缺失签名 |
| 图片签名报 S001 FAIL | `signatureMethod: "image"` 表示看见签名图像但 OCR 不完整，不应按缺签直接 FAIL |
| S004 混用 workflow 来源 | `S004` 只读取 `limsData.workflow`，不得从其他字段补推流程状态 |
| 在 Phase 0 预先输出 docType | `docType` 只能在 Phase 1 决定；Phase 0 只能说“源文档准备” |
| Markdown/纯文本伪装成 PDF 转换 | Phase 0 记录 `mode = passthrough`，不要伪造 conversion |
| LIMS / 规则引擎降级但只写一句话 | 必须在 Phase 3/4/7 的结构化字段里写清 `dependencyStatus` / `executionMode` / 脚本结果 |
| 直接自由生成报告 | **必须先运行** `generate-report.ts`，失败才按模板手动生成 |
| 先写报告再写 `results.json` | 顺序: `results.json` → 报告 → session log |
| 覆盖已有输出文件 | 先停下并与用户确认是否允许覆盖 |

## Red Flags

- 文档不是 COA/ELN 却继续审核
- `reportNo`/`batchNo` 缺失却自行补猜
- 没做 Capability Handshake 就直接进入 Phase 0
- Phase 0 对 Markdown/纯文本伪造 PDF 转换
- 依赖降级后仍把结果表述为“完整审核通过”
- Phase 5 做了修正，但没写入 `corrections[]`
- 报告脚本或校验脚本失败仍继续生成最终结论
- 产物少于 3 个文件就宣称完成
- `session-log.jsonl` 未跑 `validate-session-log.ts` 就宣称完成

