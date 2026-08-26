# Synchronization Matrix

> 本文件是仓库契约变更时的维护参考文档，非审核执行时的必读内容。
> 当修改 SKILL.md contract、supporting docs、schema/template 或脚本接口时，使用此矩阵检查整条交付链的一致性。

| Authority doc | Single source of truth | Must stay synchronized with | Sync reason |
|---------------|------------------------|-----------------------------|-------------|
| `SKILL.md` | 入口 contract、流程链、Hard Stops 唯一清单、Phase→authority 加载表 | `contracts/preflight.md`, `contracts/joint-mode.md`, `contracts/delivery.md`, `docs/operator-guardrails.md` | 保证入口停止语义与 phase 加载绑定同各 authority 文件一致；SKILL.md 变更必须回看本矩阵并运行最小回归 |
| `contracts/preflight.md` | preflight gate 准入（资格/能力/模式判定）、失败策略、覆盖确认 | `SKILL.md`, `schemas/gate-failure-schema.md`, `docs/operator-guardrails.md` | 保证入口级 contract、失败摘要结构与执行者 guardrails 对同一套准入与停止语义保持一致 |
| `contracts/joint-mode.md` | `joint` 模式专有 contract、`3.5` / `5c` 决策、`resolvedBatchNo` 注入前置条件 | `SKILL.md`, `templates/phase-outputs.md`, `templates/report-template.md`, `schemas/report-schema.md` | 保证 joint 专项 contract、结果计数结构与报告来源标签一致（产物命名归 `contracts/delivery.md`） |
| `contracts/delivery.md` | 交付固定顺序、产物命名、交付期校验门、手动补写策略 | `SKILL.md`, `scripts/README.md`, `schemas/report-schema.md`, `contracts/preflight.md` | 保证交付 contract 与脚本接口说明、结果结构一致（覆盖确认归 `contracts/preflight.md`，硬停止清单归 `SKILL.md`） |
| `schemas/gate-failure-schema.md` | preflight gate 失败摘要结构 | `contracts/preflight.md`, `SKILL.md` | 保证 gate 失败返回格式只有一个权威定义 |
| `rules/rule-map.md` | 规则集合、适用范围、编号边界 | `lib/rules.ts`, `prompts/semantic-audit.md`, `scripts/run-minimal-regression.ts` | 保证规则实现、语义审核提示和回归基线使用同一套规则清单 |
| `schemas/docExtract-schema.md` | 提取数据结构、字段定义、字段-规则映射 | `rules/rule-map.md`, `prompts/extract.md`, `lib/rules.ts`, `scripts/run-minimal-regression.ts` | 保证规则引用的字段（如 resolvedBatchNo）在 schema、规则定义、提取提示和规则实现中一致；规则映射表 (rule-map §B001) 与 schema 的字段-规则映射表 (docExtract-schema §字段-规则映射) 必须同步 |
| `schemas/report-schema.md` | `results.json` / `JointResultsJSON` 结构、计数约束 | `scripts/generate-report.ts`, `templates/report-template.md`, `scripts/run-minimal-regression.ts` | 保证结果文件能被报告脚本消费，且模板与回归对相同字段/计数做断言 |
| `templates/phase-outputs.md` | phase / sub-phase 固定进度文案与槽位 | `SKILL.md` 流程链 | 保证技能中的执行顺序与用户可见输出一致 |
| `templates/report-template.md` | Markdown 报告版式、段落顺序、占位符布局 | `scripts/generate-report.ts`, `schemas/report-schema.md` | 保证脚本生成的模板变量与 schema 字段、报告结构一致 |
| `scripts/README.md` | 交付/执行脚本 CLI 接口、输入输出与退出码语义 | `contracts/delivery.md`, `scripts/fetch-lims.ts`, `scripts/run-rules.ts`, `scripts/validate-results.ts`, `scripts/generate-report.ts`, `scripts/run-minimal-regression.ts` | 保证文档中的脚本接口说明与实际脚本行为保持一致 |
