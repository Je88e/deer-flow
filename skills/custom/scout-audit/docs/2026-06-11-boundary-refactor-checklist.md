# Scout-Audit 改进核对清单

> 日期: 2026-06-11
> 目标: 对齐 `2026-06-11-skill-structure-audit.md` 与 `2026-06-11-scout-audit-skill-boundary-refactor.md`，完成 `SKILL.md` 入口级收紧、专项承接文件补齐、双重校验与问题闭环。

## 已完成修改项

- [x] 新建 `contracts/preflight.md`，承接 preflight gate、失败策略与覆盖确认
- [x] 新建 `contracts/joint-mode.md`，承接 `joint` 专项合同、`3.5` / `5c` 约束与 `resolvedBatchNo` 注入前置条件
- [x] 新建 `contracts/delivery.md`，承接交付顺序、校验门与硬停止规则
- [x] 新建 `schemas/gate-failure-schema.md`，承接 gate 失败摘要结构
- [x] 新建 `scripts/README.md`，承接脚本命令、输入输出、退出码与常见失败模式
- [x] 新建 `docs/operator-guardrails.md`，承接 Rationalization Guardrails 与 Red Flags
- [x] 新建 `docs/2026-06-11-skill-structure-audit.md`，作为技能目录内的本地审计基线与验收参考
- [x] 重写 `SKILL.md`，只保留技能定位、准入规则、高层流程、硬停止与权威索引
- [x] 回收 `docExtract.sampleInfo.quantity` 的 canonical 约束到 `schemas/docExtract-schema.md`
- [x] 强化 `templates/phase-outputs.md`、`templates/session-log-schema.md`、`templates/report-template.md` 的 ownership 声明
- [x] 更新 `docs/sync-matrix.md`，覆盖新增 contracts / schema / scripts 权威文件

## 审计问题闭环

| 审计问题 | 整改动作 | 结果 |
| -------- | -------- | ---- |
| 主文件职责越界 | 将 preflight、joint、delivery、脚本与治理内容迁移到专项文件 | 已闭环 |
| 交付链细节内嵌主文件 | 将 CLI 命令与失败模式迁到 `scripts/README.md` | 已闭环 |
| 模式细节展开过深 | 将 `3.5` / `5c` / `elnScope` / `resolvedBatchNo` 迁到 `contracts/joint-mode.md` | 已闭环 |
| 字段 canonical 约束散落主文件 | 将 `quantity` canonical 规则回收到 `schemas/docExtract-schema.md` | 已闭环 |
| 治理性内容与调用入口混写 | 将 Guardrails / Red Flags 迁到 `docs/operator-guardrails.md` | 已闭环 |

## `writing-skills` 规范核对

- [x] `SKILL.md` frontmatter 仅保留 `name` 与 `description`
- [x] `description` 继续以 “Use when...” 描述触发条件，不复述流程细节
- [x] 主文件结构聚焦入口级 contract，避免字段级 schema 和脚本 CLI 内联
- [x] 权威落点明确，避免主文件与专项文件双份展开
- [x] 使用可检索的关键词覆盖 COA / ELN / GMP / NMPA / ICH / audit / review 等触发词

## `using-superpowers` 适配核对

- [x] 按流程先加载相关 skill，再开始执行
- [x] 依据现成实施计划逐项落地，而非跳步修改
- [x] 主文件现在可独立回答 “何时用 / 何时不用 / 主链怎么走 / 何时必须停”
- [x] 专项 contract、schema、template、scripts、docs 已回到各自单一职责文件
- [x] `docs/sync-matrix.md` 已覆盖新增权威文件，支持后续 contract 变更回看

## 验证记录

- [x] 已执行 Markdown 诊断检查
- [x] 已执行最小回归 `skills/custom/scout-audit/scripts/run-minimal-regression.ts`
- [x] 已人工复核 `SKILL.md` 不再重复 JSON schema、CLI 命令、session-log 细节与治理清单

## 结论

- `SKILL.md` 已回到入口级 contract
- `contracts/` 已承接流程专项细则
- `scripts/README.md` 已接住脚本接口说明
- `docs/sync-matrix.md` 已覆盖新增权威文件
- 本次审计发现的问题已全部形成闭环整改
