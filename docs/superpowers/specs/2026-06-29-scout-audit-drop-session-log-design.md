# Design: scout-audit 移除 session-log.jsonl 交付物（三件套 → 两件套）

- **Date:** 2026-06-29
- **Skill:** `skills/custom/scout-audit`（Rigid GMP/NMPA/ICH 审核技能）
- **Branch:** `local-dev`
- **Status:** 已通过设计评审，待写入实现计划
- **前置背景：** 本设计源自一轮 brainstorming；用户在权衡"用 Langfuse 观测平台替代 session-log.jsonl"的可行性后，选择 **方案 C —— 两件套、Langfuse 软依赖、不在 results.json 记录 langfuse 状态**。

## 1. 目标与背景

`session-log.jsonl` 当前是 scout-audit 的第三件交付物，定义为一行一 JSON 的**结构化审计证据**（固定 8 行 single / 15 行 joint，逐 phase 记录输入/输出/调用/计数/脚本退出码）。它由 `generate-session-log.ts` 生成、`validate-session-log.ts` 校验。

deer-flow 后端已全量集成 Langfuse 作为运维观测层（`backend/packages/harness/deerflow/tracing/factory.py` 在 graph 根注入 callback，session_id=thread_id、按 env+model 打 tag）。用户判断：Langfuse 已能证明"审核运行真实发生"，session-log.jsonl 的文件型证据是冗余负担，可整体放弃。

**目标：** 从交付合同中移除 `session-log.jsonl` 及一切仅服务于它的脚本/文档，使合同收敛为两件套（`results.json` + 审核报告）。观测退化为 ambient Langfuse，技能本身不感知、不引用、不门槛化它。

## 2. 锁定决策（实现期不可再变）

1. 交付合同 **三件套 → 两件套**：`results.json` + 审核报告。
2. Langfuse 是**后台 ambient 观测**；技能**不感知、不引用、不门槛化**它。
3. `results.json` **不新增任何字段**（含不记录 langfuse 状态/trace 引用）。
4. session-log.jsonl 的"phase 固定行槽位"概念（8/15 行、`3.5`/`5c` 固定行）随之消失。但**编排 Core Flow（Phase 0-7，joint 的 0a/0b/3.5/5c）作为审核流程本身保留** —— 删除的是"证据工件的固定行布局"，不是"审核流程的步骤"。
5. **不引入新 preflight 硬门槛**；Langfuse 是否配置不影响审核能否进行。

## 3. 可行性与数据完整性结论（已逐项验证）

| 验证项 | 结果 | 出处 |
|--------|------|------|
| `validate-results.ts` 是否引用 session-log | **零引用** | `grep -ni session scripts/validate-results.ts` → none |
| `generate-report.ts` 是否引用 session-log | **零引用** | `grep -ni session scripts/generate-report.ts` → none |
| corrections 一致性校验归属 | `validate-results.ts` **已自带** corrections↔ruleResults 校验（ruleId 存在 + correctedTo 匹配最终状态） | `validate-results.ts:127-141` |
| results.json 是否已承载合规结论 | 是：`ruleResults`(32/69)、`corrections`、`overallResult`、`summary`、`metadata.{limsAvailable, ruleEngineAvailable, reportMethod}` | `schemas/report-schema.md` |

**关键推论：** session-log Phase 6 那条"corrections 必须与 results.json 一致"（session-log-schema 校验规则 #14）本就是**冗余的第二道检查** —— 它拿 session-log 的 corrections 副本去比 results.json。删除 session-log 后没有"第二个副本"会漂移，`validate-results.ts` 继续保证 results.json 内部一致。**无数据缺口，results.json 无需新增字段。**

**删除后不再被任何产物记录、但可接受的项：**
- `generate-report.ts` 退出码 —— 非零退出本就硬停（report 不存在即证明失败），结果文件存在即证明。
- `mcpCallCount` —— 纯运维指标。
- phase 级结构化载荷（Phase 2 整段 docExtract 转储、Phase 3 完整 LIMS 响应、Phase 4/5 完整规则数组）—— 这些属运维细节，且 ruleResults 结论已在 results.json。

## 4. 改动清单

### 4.1 删除（3 个文件，共 1647 LOC 脚本 + 1 文档）

- `scripts/generate-session-log.ts`（562 LOC）
- `scripts/validate-session-log.ts`（1085 LOC）
- `templates/session-log-schema.md`

### 4.2 修改（7 个文件）

| 文件 | 改动 |
|------|------|
| `contracts/delivery.md` | 固定顺序 6 步 → 3 步（写 results → 校验 results → 生成报告）；三件套 → 两件套；命名表去掉 session-log 行；删"生成/补全/校验 session-log"两步；删"未通过 validate-session-log 不得交付"硬停；Manual Fallback 去掉 session-log 骨架说明；References 去掉 `session-log-schema.md` |
| `SKILL.md` | 删 Admission Rules/Core Flow/Hard Stops/Delivery Rules/Authority Map 中所有 session-log 提及；Hard Stop "交付顺序固定为 results.json -> 审核报告 -> session-log 校验" 改为 "results.json -> 审核报告"；Authority Map 的 Templates 行去掉 `session-log-schema.md`、Scripts 行去掉两个 session-log 脚本 |
| `scripts/README.md` | 删 `generate-session-log.ts`、`validate-session-log.ts` 两整节；Usage Rule 去掉 "最后校验 session-log.jsonl" |
| `scripts/run-minimal-regression.ts` | 删 `VALIDATE_SESSION_LOG_SCRIPT` 常量；`relativeOutputFiles` 第三项（session-log）；`sessionRows` 构造块（约 110 行，含 phaseTimestamp/phase4Summary 若仅服务 session-log）；`runCliScript(VALIDATE_SESSION_LOG_SCRIPT, ...)` 调用；printHelp 第三行；manifest 的 `sessionLogPath` |
| `docs/sync-matrix.md` | 删 `templates/session-log-schema.md` 整行；`scripts/README.md` 行的"Must stay synchronized with"去掉 `generate-session-log.ts`、`validate-session-log.ts`；`contracts/delivery.md` 行的同步对象去掉 `session-log-schema.md` |
| `docs/operator-guardrails.md` | 删 Rationalization Guardrails 中 session-log 骨架/占位条目；删 Red Flags 中所有 session-log 条目（未校验、占位残留、FILL_ME、duration≤0、批量补写等） |
| `templates/phase-outputs.md` | **最小改动**（详见 §5）：仅删 Phase 7 的 session-log 行与"日志校验"行 |

### 4.3 保留不动

`schemas/report-schema.md`、`scripts/validate-results.ts`、`scripts/generate-report.ts`、`scripts/fetch-lims.ts`、`scripts/run-rules.ts`、全部 `lib/`、`prompts/`、`rules/`、`schemas/{docExtract,limsData,report,gate-failure}-schema.md`、`contracts/{preflight,joint-mode}.md`、`templates/report-template.md`。

> 注：`contracts/joint-mode.md` 若含 session-log 提及（如 joint 15 行布局引用），在 plan 阶段需 grep 确认并按相同语义清理；预期仅文字层面提及，无逻辑耦合。

## 5. `templates/phase-outputs.md` 的精确处理（关键澄清）

经完整阅读，该文件是**智能体逐 phase 进度叙述模板**（LLM-facing），**并非** session-log 耦合 —— 仅 Phase 7 两处提及 session-log。因此改动最小化：

- **删除：** Phase 7（single，L117-125）与 Phase 7（joint，L248-256）中的：
  - "会话日志已保存至 outputs/{reportNo}-session-log.jsonl" / "联合会话日志已保存至 outputs/{batchNo}-joint-session-log.jsonl"
  - "日志校验: result={validationResult}, exitCode={validationExitCode}"
- **保留：** Phase 0-6 全部进度叙述模板，含 joint 的 `0a/0b` 独立输出、`3.5` 独立槽位（含 single-batch 显式 no-op）、`5a/5b/5c` 各自独立输出等"MUST-not-compress"约束。这些是**编排流程契约**，不属于被删除的证据工件。
- **保留：** Phase 6 的 "进入 Phase 7: 生成审核报告" 措辞不变。

> 这修正了设计评审阶段对该文件"需大改"的过度保守判断：memory 中"phase-outputs.md 自声明为权威输出契约"指的是叙述契约，而非 session-log 行布局。

## 6. 新交付合同（`contracts/delivery.md` 核心）

**固定顺序：**
1. 写入 `results.json`
2. 校验 `results.json`（`validate-results.ts` 非零即停）
3. 生成审核报告（`generate-report.ts`；失败可按同一模板手动补写，但 results 校验仍必跑）

**产物命名：**
- single: `outputs/{reportNo}-results.json` + `outputs/{reportNo}-audit-report.md`
- joint: `outputs/{batchNo}-joint-results.json` + `outputs/{batchNo}-joint-audit-report.md`

**Validation Gates：** results.json 写入后必须先过 `validate-results.ts` 才能生成报告。报告生成后无后续校验步。

**Hard Stops 收敛为：** 任一脚本非零退出 / 任一结构校验失败 / 缺覆盖确认 / **两件套缺一** / single/joint 计数或命名不满足 contract。

## 7. 测试与回归策略

- `npx vitest run`（`lib/` 单测，19/19）**不受影响** —— 它只测 `lib/rules.ts`、`mock-data.ts`、`semantic-signature-rules.ts`，本不碰 session-log。
- `run-minimal-regression.ts` 改后仍产 `{reportNo}-results.json` + `-audit-report.md`，不再产 session-log；退出码 0 即回归通过。
- `validate-results.ts` 对新两件套预期**无改动即全绿**（已验证其与 session-log 零耦合）。
- **孤儿产物清理（用户已确认）：** 回归重跑后删除：
  - `docs/reports/regression-outputs/outputs/{A408H0001,detection-limit-coa,eln-with-complete-workflow}-session-log.jsonl`（4 个 git 跟踪文件，其中 git status 显示已被改动）
  - `skills/custom/scout-audit/outputs/` 下未跟踪的旧 session-log 文件
- 命令（从技能目录，bash 会重置 cwd）：`cd /home/jesse/project/deer-flow/skills/custom/scout-audit && npx vitest run && npx tsx scripts/run-minimal-regression.ts`（exit 0）。

## 8. 有意放弃的边界（方案 C 代价，明确记录）

1. **文件型审计证据消失**：审核运行的可追溯性退化为"依赖 ambient Langfuse（若配置）+ results.json 结论"。
2. **Langfuse 未配置时审核仍可完成，但无独立运维 trace** —— 这是方案 C 的既定前提，用户已在设计评审中明确接受。
3. **phase 级结构化证据消失**：Phase 0-7 逐行载荷不再存在。
4. **长期 GMP 记录保留**：不再有随单归档文件；保留责任完全移出本技能（用户已在现实 2 讨论中接受）。

## 9. 范围外（Out of Scope）

- 在技能内集成 Langfuse SDK / 发射 phase span —— 不做，Langfuse 保持 ambient。
- 修改 `results.json` schema —— 不做。
- 修改 preflight 准入规则 —— 不做。
- 修改 `prompts/`、`schemas/`、`rules/` 内容 —— 这些属另一条独立的 token-优化工作线（见 memory `scout-audit-token-optimization`），不在本设计内。

## 10. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 漏改某处 session-log 引用导致 contract drift | 中 | 改动后 `grep -ri "session-log\|session_log\|sessionLog" skills/custom/scout-audit`（排除 node_modules/outputs）应只剩 git 历史与（若保留）外部引用；run-minimal-regression 退出码 0 兜底 |
| `contracts/joint-mode.md` / 其他文档存在未发现的 session-log 文字提及 | 低 | plan 阶段先做全量 grep，列出所有命中点逐个清理 |
| 孤儿 session-log 文件残留在 outputs 误导后续审核 | 中 | 回归重跑后显式删除 §7 列出的文件 |
| 删除证据工件后，未来需要复盘某次审核却无 trace | 中（已被用户接受） | 记录于 §8；若日后需要，退路是方案 3（混合保留极简 JSONL），但不在本次实现 |

## 11. 验收标准

- [ ] `grep -rni "session-log\|sessionLog" SKILL.md contracts/ scripts/ templates/ docs/sync-matrix.md docs/operator-guardrails.md`（相对技能目录）在**活跃合同文件**中无残留
  - **豁免（历史快照，记录变更前结构，不应改动）：** `docs/2026-06-11-skill-structure-audit.md`、`docs/2026-06-11-boundary-refactor-checklist.md`；二者若命中属预期
- [ ] `scripts/generate-session-log.ts`、`scripts/validate-session-log.ts`、`templates/session-log-schema.md` 已删除
- [ ] `contracts/delivery.md` 固定顺序为 3 步、两件套命名
- [ ] `SKILL.md` 无 session-log 提及，Hard Stop 顺序为两件套
- [ ] `cd skills/custom/scout-audit && npx vitest run` 全绿
- [ ] `npx tsx scripts/run-minimal-regression.ts` exit 0，且不再产出 session-log 文件
- [ ] `docs/reports/regression-outputs/outputs/` 与 `skills/custom/scout-audit/outputs/` 下旧 session-log 文件已清理
