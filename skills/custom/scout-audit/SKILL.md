---
name: scout-audit
description: Use when a user provides or references a lab COA (检验报告) or ELN (原始记录) file and asks for 审核, 审查, audit, review, or GMP/NMPA/ICH compliance checking.
---

# Scout Audit

## Overview

**Skill Type: Rigid** — 严格按合同执行，不允许适应性偏移。

面向制药/实验室文档的 GMP/NMPA/ICH 合规审核编排合同。先通过 preflight gate，再按固定 phase 顺序执行 single 或 joint 审核，交付 `results.json`、审核报告和 `session-log.jsonl`。本技能只定义 orchestration，业务规则、schema、模板、脚本接口均以外部 supporting docs 为准。

## Quick Triage

- Use when:
  - 输入是 COA/ELN 原始文档或其 Markdown/纯文本转写，目标是做正式 GMP/NMPA/ICH 合规审核
- Stop when:
  - 输入不是 COA/ELN 审核场景，例如 SOP、方案、偏差报告、普通总结
  - 输入其实是已生成的 `results.json`、审核报告或 `session-log.jsonl`（已生成产物不得二次审核）
  - 缺少可用的 `reportNo` / `batchNo`，无法建立 single 或同批次 joint 锚点
  - 关键依赖不可用且无法给出结构化降级结果，或输出已存在但用户未确认覆盖
- Choose mode:
  - 1 个 COA 或 ELN 文档 -> `single`
  - 1 份 COA + 1..N 份同批次 ELN -> `joint`
- Completion means:
  - 先写 `results.json`，再生成报告，再通过 `validate-session-log.ts`
  - 若本技能改动触及 contract / supporting docs / 脚本接口，还要通过 `run-minimal-regression.ts`

## Non-Negotiables

- Preflight Gate 先于 Phase 0；gate 失败就停止，不能“先试试看”
- `joint` 必须保留独立 `3.5` 槽位；不得省略、改名、移位或并入 `2b`
- `5c` 只在 `joint` 执行；`single` 不得运行跨文档规则
- 交付顺序固定为 `results.json` -> 审核报告 -> `session-log` 校验
- 任一脚本非零退出、结构校验失败、覆盖确认缺失或产物数不完整，都只能停止，不能宣称“基本完成”

## Preflight Gate

进入 Phase 0 前必须完成 gate；它不是新增 phase，也不写入 `session-log.jsonl`。

1. Eligibility
   - 输入对象必须真的是 COA/ELN 审核任务，而不是总结、改写或泛化分析
   - 先排除 `results.json`、审核报告、`session-log.jsonl` 这类已生成产物被当作原始输入再次审核
2. Capability
   - 确认 `scout-lims-connector` 可用，且优先走 `fetch_all_lims_data`
   - 确认 `scout-rule-engine` 可用，主路径为 `run_all_rules`
   - 对 `.pdf` 输入确认至少存在一种可用的 Markdown 获取路径；必要时才回退到 `pdf` skill
3. Mode Detection
   - 1 个文档（COA 或 ELN）: `auditMode = "single"`
   - 1 份 COA + 1..N 份 ELN，且目标是同一批次联合审核: `auditMode = "joint"`
   - joint 场景中，ELN 需在提取阶段判定 `elnScope = "single-batch" | "multi-batch"`
4. Failure Policy
   - 任一 gate 失败即停止，不进入 Phase 0
   - 返回结构化失败摘要，说明缺失条件、影响范围、是否可恢复和建议动作
   - 不允许先“试试看”再补救；覆盖既有输出也必须先停下征求用户确认

最小失败摘要形状如下；它只定义 stop-signal contract，不替代完整 schema:

```json
{
  "failedStep": "",
  "reason": "",
  "recoverable": false,
  "suggestedAction": ""
}
```

## Execution Contract

以下不变量适用于 `single` 与 `joint` 两种模式:

1. 审核只执行 `rules/rule-map.md` 已定义的规则集合；不得自创、删改或重命名规则。
2. Preflight Gate 是进入正式审核的前置条件，不计入 phase；`single` 的正式 phase 固定为 Phase 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7。
3. `joint` 共享同一条 0-7 主链，但还必须处理 `3.5` 与 `5c` 这两个额外合同决策点；`3.5` 是 joint session log 中固定保留的 ELN 筛选槽位，`validate-session-log.ts` 按 15 行布局校验 `[0a,0b,1a,1b,2a,2b,3,3.5,4a,4b,5a,5b,5c,6,7]`，因此不得省略、改名、移位或并入 `2b`；当 `elnScope = "multi-batch"` 时记录真实筛选结果，当 `elnScope = "single-batch"` 时也必须写显式 no-op / passthrough `3.5` 记录；`5c` 是跨文档规则 sub-phase，不得省略、改名或并入其他 phase。
4. 每个正式 phase 与必需 sub-phase 的固定进度输出都以 `templates/phase-outputs.md` 为准；不得把多个步骤合并成一个不可追踪的输出。
5. `results.json`、`session-log.jsonl`、固定 phase 输出和审核报告模板的权威定义分别以 `schemas/report-schema.md`、`templates/session-log-schema.md`、`templates/phase-outputs.md`、`templates/report-template.md` 为准；本文件只保留 orchestration contract，不重复字段级细节。
6. `joint` 映射为 COA 证据域 + ELN 证据域两个逻辑文档域；结果计数与子车道结构以 `schemas/report-schema.md` 和 Mode Delta 表格为准。
7. `joint` 的并行子车道 (`0a/0b` 等) 与额外 sub-phase (`3.5`, `5c`) 的记录粒度以 `templates/phase-outputs.md` 和 `templates/session-log-schema.md` 为准。
8. supporting docs 与交付脚本共同构成交付 contract；任一仓库契约调整，都必须回看整条交付链是否仍然一致（参见 `docs/sync-matrix.md`）。
9. Phase 0 只允许 `convert` 或 `passthrough` 两种输入处理语义；Markdown/纯文本不得伪装成 PDF 转换。
10. Phase 2 产出的提取结果必须保留足够的原文上下文供后续 Phase 5 语义规则使用，相关提取结构以 `schemas/docExtract-schema.md` 为准。
10a. `B002` 的样品量字段合同以 `docExtract.sampleInfo.quantity` 为唯一 canonical 字段；“批量”“检品数量”“代表量”等原文都要在 Phase 2 统一归一到 `quantity`。进入结构化产物后，不得再以 `batchSize` 或其他旧字段名充当 canonical key、FAIL 详情或证据期望值。
10b. `scripts/generate-session-log.ts` 生成的 JSONL 只是一份可编辑骨架，不是可交付证据；凡是仍保留 `Generated from results.json`、`replace with full docExtract`、`replace with actual response`、`FILL_ME`、`durationMs <= 0`、或 Phase 4 默认零值计数伪装成真实执行的内容，都必须在 Delivery Gate 被拒绝。
11. Phase 3 的 LIMS 主路径优先使用聚合查询；若降级到拆分查询或不可用，必须在结构化产物中显式记录依赖状态与真实执行路径。
12. Phase 4 的确定性规则主路径优先使用规则引擎；若走 inline fallback，只能按 `rules/rule-map.md` 的既有算法执行，并显式记录降级范围。
12a. (joint only) Phase 3.5 成功筛选后（filteredSampleCount > 0），LLM 必须将 COA 的 batchNo 写入 ELN docExtract 的 `sampleInfo.resolvedBatchNo`，然后传递给 Phase 4b 规则引擎。若 Phase 3.5 筛选失败，不得注入 resolvedBatchNo。
13. Phase 5 不得重写 Phase 4 的确定性判定边界；语义修正只能发生在 `prompts/semantic-audit.md` 和规则映射允许的范围内。
14. `session-log.jsonl` 的 phase 级记录必须按 phase 完成顺序追加写入；Phase 7 的记录粒度与字段以 `templates/session-log-schema.md` 为准，不得把前序 phase 记录延后到最后批量补写。
15. Phase 6 负责合并、排序和汇总，不得掩盖前序 phase 中的缺依赖、回退或失败信息。
16. 输出产物固定为三件套，且命名由 `auditMode` 决定:
   - `single`: `outputs/{reportNo}-results.json`、`outputs/{reportNo}-audit-report.md`、`outputs/{reportNo}-session-log.jsonl`
   - `joint`: `outputs/{batchNo}-joint-results.json`、`outputs/{batchNo}-joint-audit-report.md`、`outputs/{batchNo}-joint-session-log.jsonl`
16a. `joint` 报告中的整改建议与修正记录必须显式标注来源文档域；同号规则不得只写 `B002` / `S001`，而要写成 `COA - B002`、`ELN - S001`、`跨文档 - X003` 这类可执行格式。
17. 所有 FAIL、SKIP、correction、dependency degradation、脚本执行结果都必须落在结构化产物中，而不是只留在自然语言总结里。
18. 任一步前置条件、脚本校验或结构验证失败都必须停止；不能在失败状态下宣称审核完成。

## Mode Delta

| Topic | `single` | `joint` |
|-------|----------|---------|
| Input shape | 1 个 COA 或 ELN 文档 | 1 份 COA + 1..N 份同批次 ELN |
| Extra sub-phases | 无 | 固定包含 `3.5` 与 `5c` |
| Total result count | 32 | 69 = COA 32 + ELN 32 + 跨文档 5 |
| Output naming | `outputs/{reportNo}-*` | `outputs/{batchNo}-joint-*` |
| Session-log layout | Phase `0-7` 共 8 行 | `[0a,0b,1a,1b,2a,2b,3,3.5,4a,4b,5a,5b,5c,6,7]` 共 15 行 |

## Mode Flows

### Single

```text
Preflight Gate
-> Phase 0 source prep
-> Phase 1 classify
-> Phase 2 extract docExtract
-> Phase 3 fetch limsData
-> Phase 4 deterministic rules (20)
-> Phase 5 semantic rules (12)
-> Phase 6 merge to 32 results
-> Phase 7 deliver artifacts
```

### Joint

```text
Preflight Gate
-> Phase 0a/0b source prep in parallel
-> Phase 1a/1b classify in parallel
-> Phase 2a/2b extract COA + ELN
-> Phase 3 fetch shared limsData by COA.batchNo
-> Phase 3.5 fixed ELN filtering slot (real filter or explicit no-op)
-> Phase 4a/4b deterministic rules in parallel
-> Phase 5a/5b semantic rules in parallel
-> Phase 5c cross-document rules X001-X005
-> Phase 6 merge to 69 results
-> Phase 7 deliver artifacts
```

Joint Constraints:

- 适用于同一批次的 `1 COA + 1..N ELN`；多个 ELN 文档先汇成一个逻辑 ELN 证据集，再产出固定 32 条 ELN 结果
- `0a/0b`、`1a/1b`、`2a/2b`、`4a/4b`、`5a/5b` 是主链并行子车道；`3.5` 与 `5c` 都是额外强制 sub-phase，其中 `3.5` 在 joint mode 中始终占用固定槽位
- Phase 3 为共享 LIMS 基线；Phase `3.5` 之后才能进入 ELN 规则与跨文档规则，其中 `elnScope = "multi-batch"` 记录真实筛选结果，`elnScope = "single-batch"` 记录显式 no-op / passthrough 结果，但两种情况都必须保留独立 `3.5` 行
- 输出前缀以 `batchNo` 为锚点，交付结构使用 `JointResultsJSON`

## Delivery Gate

交付顺序固定，必须按以下顺序完成:

1. 写入 `results.json` 后立即校验结构完整性

```bash
npx tsx .claude/skills/scout-audit/scripts/validate-results.ts <results.json>
```

   - 校验通过 (exit 0) 才能继续；非零退出必须停止，修正 count / ruleId 覆盖 / FAIL evidence 等问题后重试
   - `single`: `outputs/{reportNo}-results.json`
   - `joint`: `outputs/{batchNo}-joint-results.json`

1. 先写 `results.json`
   - `single` 写 `outputs/{reportNo}-results.json`
   - `joint` 写 `outputs/{batchNo}-joint-results.json`
   - 结构、计数与 joint 变体以 `schemas/report-schema.md` 为准
2. 再运行 `scripts/generate-report.ts`

```bash
npx tsx .claude/skills/scout-audit/scripts/generate-report.ts <results.json> <audit-report.md>
```

   - 报告模板与占位符映射以 `templates/report-template.md` 为准
   - `single`: `outputs/{reportNo}-results.json` -> `outputs/{reportNo}-audit-report.md`
   - `joint`: `outputs/{batchNo}-joint-results.json` -> `outputs/{batchNo}-joint-audit-report.md`
   - 只有脚本失败时，才允许按同一模板手动补写报告
   - 常见失败: results.json 路径错误、模板占位符未覆盖
2.5. (推荐) 从 results.json 生成 session-log 骨架

```bash
npx tsx .claude/skills/scout-audit/scripts/generate-session-log.ts <results.json> [session-log.jsonl]
```

   - 脚本自动检测 auditMode，生成 8 行 (single) 或 15 行 (joint)
   - 生成后 LLM 需补充 Phase 0 源文件信息和 Phase 7 脚本执行结果 (exitCode/result)
   - 骨架中的占位摘要、占位 response、`FILL_ME`、`durationMs <= 0` 与默认零值计数都属于“未补全证据”，在 Delivery Gate 中必须被视为失败而不是“稍后补”
3. 补全 Phase 7 交付字段并校验 `session-log.jsonl`

```bash
npx tsx .claude/skills/scout-audit/scripts/validate-session-log.ts <session-log.jsonl> <results.json>
```

   - `session-log.jsonl` 结构、phase 顺序与 Phase 7 字段以 `templates/session-log-schema.md` 为准
   - `single`: `outputs/{reportNo}-session-log.jsonl` + `outputs/{reportNo}-results.json`
   - `joint`: `outputs/{batchNo}-joint-session-log.jsonl` + `outputs/{batchNo}-joint-results.json`
   - 未通过校验前，不得宣称交付完成
   - 常见失败: phase 行数不匹配 (single 8 行 / joint 15 行)、Phase 7 缺少 exitCode/result 字段、phase 顺序错乱、Phase 2/3 仍保留骨架占位、LIMS 调用 `durationMs <= 0`、Phase 4 仍保留骨架默认零值
4. 如本次变更触及仓库契约，再运行最小回归

```bash
npx tsx .claude/skills/scout-audit/scripts/run-minimal-regression.ts
```

   - `run-minimal-regression.ts` 只在仓库契约变更时必跑，例如修改 `SKILL.md` contract、supporting docs、schema/template、或相关脚本接口；普通单次审核执行不要求每次都跑
   - 一旦决定运行最小回归，任一脚本非零退出都视为 delivery failure
5. 明确停止条件
   - `validate-results.ts`、`generate-report.ts`、`validate-session-log.ts`、`run-minimal-regression.ts` 任一非零退出都必须停止
   - `session-log` / `results.json` 结构校验失败时，不允许用自然语言声明“内容大体正确”
   - 输出文件已存在但未获得用户覆盖确认时，不允许继续写入
   - 预期三件套产物缺任一件，或 joint / single 的计数不满足 contract 时，不允许宣称交付完成

## Reference Map

- 规则总表与适用性: `rules/rule-map.md` — Phase 4/5 规则执行时参考
- 提取结构定义: `schemas/docExtract-schema.md` — Phase 2 提取时参考
- LIMS 数据结构与查询组合: `schemas/limsData-schema.md` — Phase 3 LIMS 查询时参考
- 结果文件权威 schema: `schemas/report-schema.md` — Phase 6 合并与 Delivery Gate 时参考
- 各 phase 固定输出模板: `templates/phase-outputs.md` — 每个 phase 完成时参考
- 审核报告模板: `templates/report-template.md` — Phase 7 报告生成时参考
- 会话日志结构: `templates/session-log-schema.md` — Phase 7 session-log 写入时参考
- 分类提示词: `prompts/classify.md` — Phase 1 分类时参考
- 提取提示词: `prompts/extract.md` — Phase 2 提取时参考
- 语义审核提示词: `prompts/semantic-audit.md` — Phase 5 语义审核时参考
- 报告生成脚本: `scripts/generate-report.ts` — Delivery Gate 步骤 2 执行
- 会话日志生成脚本: `scripts/generate-session-log.ts` — Delivery Gate 步骤 2.5 执行
- 会话日志校验脚本: `scripts/validate-session-log.ts` — Delivery Gate 步骤 3 执行
- 结果结构校验脚本: `scripts/validate-results.ts` — Delivery Gate 步骤 0 执行
- 最小回归脚本: `scripts/run-minimal-regression.ts` — 仓库契约变更时执行
- 同步矩阵: `docs/sync-matrix.md` — 仓库契约变更时参考


## Rationalization Guardrails

| Excuse | Contract Reality |
|--------|------------------|
| "先试试看再补救" | Gate 失败就停止，不能进入 Phase 0。 |
| "3.5 可以并回 2b" | `3.5` 是 `joint` 的固定槽位，`single-batch` 也要保留显式 no-op。 |
| "脚本失败但内容看起来对" | 交付只有在脚本和结构校验都通过后才成立。 |
| "已有报告也可以再审一次" | 已生成产物不是原始审核输入，必须在 preflight 直接拦下。 |
| "缺个 reportNo/batchNo 可以先猜" | 审核锚点缺失时只能停止并返回结构化失败摘要。 |
| "ELN 是 single-batch 所以不需要 3.5" | `single-batch` 也必须保留显式 no-op / passthrough `3.5` 记录。 |
| "`batchSize` 只是旧叫法，先继续用也没关系" | `B002` 的 canonical 字段只有 `quantity`；旧字段名不能再出现在结构化产物或最终 FAIL 文案中。 |
| "session-log 骨架已经能过脚本，先交付再说" | 骨架只是补写起点；占位摘要、占位 response、`FILL_ME`、无效 duration 或默认零值一律不算真实审计证据。 |
| "joint 报告里同号规则读者自己能分辨" | 联合报告必须给整改项标来源；没有 `COA/ELN/跨文档` 标签就不具备执行性。 |
| "规则引擎不可用但我知道算法" | inline fallback 只能按 `rule-map.md` 既有算法，且必须显式记录降级范围。 |
| "Phase 5 可以修正 Phase 4 的判定" | Phase 5 不得重写确定性判定边界；语义修正有明确范围限制。 |

## Red Flags

- 文档不是 COA/ELN 却继续审核
- `reportNo`/`batchNo` 缺失却自行补猜
- 没做 Capability Handshake 就直接进入 Phase 0
- 已生成的 `results.json` / 报告 / `session-log.jsonl` 被误当原始输入继续审核
- 把 `3.5` 并回 `2b`、把 `5c` 并回其他 phase，或用“single-batch 不需要单独写”做理由
- Phase 0 对 Markdown/纯文本伪造 PDF 转换
- single / joint 模式识别错误，或 joint 未以 COA 批次为共享锚点
- `elnScope = "multi-batch"` 却跳过 Phase 3.5 直接继续审计
- 跨文档规则 X001-X005 在 single 模式执行，或 joint 漏跑
- 依赖降级后仍把结果表述为“完整审核通过”
- 报告先于 `results.json` 生成，或跳过 `generate-report.ts`
- 脚本非零退出、结构校验失败或产物不完整，却仍用“差不多完成”对外交付
- `session-log.jsonl` 未经 `validate-session-log.ts` 校验就宣称完成
- `session-log.jsonl` 中仍保留 `Generated from results.json`、`replace with ...`、`FILL_ME`、`durationMs <= 0` 或明显骨架默认值
- `B002` 在文档已存在样品量信息时仍输出 `batchSize 缺失` 一类旧字段 FAIL 文案
- `joint` 报告整改建议仍只写规则号，不写 `COA` / `ELN` / `跨文档` 来源
- 任一脚本、结构校验或覆盖确认未通过，却继续对外输出最终结论
- `session-log.jsonl` 未按 phase 完成顺序追加写入，而是在最后批量补写所有记录
