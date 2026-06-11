# Synchronization Matrix

> 本文件是仓库契约变更时的维护参考文档，非审核执行时的必读内容。
> 当修改 SKILL.md contract、supporting docs、schema/template 或脚本接口时，使用此矩阵检查整条交付链的一致性。

| Authority doc | Single source of truth | Must stay synchronized with | Sync reason |
|---------------|------------------------|-----------------------------|-------------|
| `contracts/preflight.md` | preflight gate 准入、失败策略、覆盖确认 | `SKILL.md`, `schemas/gate-failure-schema.md`, `docs/operator-guardrails.md` | 保证入口级 contract、失败摘要结构与执行者 guardrails 对同一套准入与停止语义保持一致 |
| `contracts/joint-mode.md` | `joint` 模式专有 contract、`3.5` / `5c` 决策、`resolvedBatchNo` 注入前置条件 | `SKILL.md`, `templates/session-log-schema.md`, `templates/phase-outputs.md`, `templates/report-template.md`, `schemas/report-schema.md` | 保证 joint 专项 contract、日志布局、固定输出、报告来源标签与结果计数保持一致 |
| `contracts/delivery.md` | 交付顺序、覆盖确认、硬停止规则 | `SKILL.md`, `scripts/README.md`, `schemas/report-schema.md`, `templates/session-log-schema.md` | 保证入口级交付 contract、脚本接口说明和最终交付校验使用同一停止语义 |
| `schemas/gate-failure-schema.md` | preflight gate 失败摘要结构 | `contracts/preflight.md`, `SKILL.md` | 保证 gate 失败返回格式只有一个权威定义 |
| `rules/rule-map.md` | 规则集合、适用范围、编号边界 | `mcps/scout-rule-engine/src/rules.ts`, `prompts/semantic-audit.md`, `scripts/run-minimal-regression.ts` | 保证规则实现、语义审核提示和回归基线使用同一套规则清单 |
| `schemas/docExtract-schema.md` | 提取数据结构、字段定义、字段-规则映射 | `rules/rule-map.md`, `prompts/extract.md`, `mcps/scout-rule-engine/src/rules.ts`, `scripts/run-minimal-regression.ts` | 保证规则引用的字段（如 resolvedBatchNo）在 schema、规则定义、提取提示和规则实现中一致；规则映射表 (rule-map §B001) 与 schema 的字段-规则映射表 (docExtract-schema §字段-规则映射) 必须同步 |
| `schemas/report-schema.md` | `results.json` / `JointResultsJSON` 结构、计数约束 | `scripts/generate-report.ts`, `templates/report-template.md`, `scripts/validate-session-log.ts`， `scripts/run-minimal-regression.ts` | 保证结果文件能被报告脚本消费，且模板与回归对相同字段/计数做断言 |
| `templates/session-log-schema.md` | `session-log.jsonl` 行结构、phase 顺序、Phase 7 字段 | `scripts/validate-session-log.ts`, `templates/phase-outputs.md` | 保证日志校验脚本与用户可见 phase 输出指向同一记录粒度 |
| `templates/phase-outputs.md` | phase / sub-phase 固定进度文案与槽位 | 本文件的 orchestration phase 链路, `templates/session-log-schema.md` | 保证技能中的执行顺序、用户可见输出和 session log phase 粒度一致 |
| `templates/report-template.md` | Markdown 报告版式、段落顺序、占位符布局 | `scripts/generate-report.ts`, `schemas/report-schema.md` | 保证脚本生成的模板变量与 schema 字段、报告结构一致 |
| `scripts/README.md` | 交付脚本 CLI 接口、输入输出与退出码语义 | `contracts/delivery.md`, `scripts/validate-results.ts`, `scripts/generate-report.ts`, `scripts/generate-session-log.ts`, `scripts/validate-session-log.ts`, `scripts/run-minimal-regression.ts` | 保证文档中的脚本接口说明与实际脚本行为保持一致 |
