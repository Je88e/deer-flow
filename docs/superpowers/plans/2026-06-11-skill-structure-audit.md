# Scout-Audit 技能主文件结构审计

> **审计对象:** `skills/custom/scout-audit/SKILL.md`
> **审计目标:** 识别主文件中冗余、定位模糊、职责越界的描述，并给出可迁移去向
> **审计日期:** 2026-06-11
> **审计结论类型:** 结构治理审计，不涉及运行产物复盘

---

## 一、结论摘要

`scout-audit` 的核心合同已经比较完整，但 `SKILL.md` 当前承载了过多非入口级内容，主要问题不是规则缺失，而是职责边界不清。

当前主文件同时混入了以下四类内容：

1. 编排合同
2. 字段级 schema 约束
3. 模板与脚本执行细节
4. 治理型维护说明

这使 `SKILL.md` 虽然“信息完整”，但不再是一个聚焦的 skill 主文件，而更像“总规范汇编”。结果是：

- 主文件篇幅偏重，检索与调用成本上升
- schema / template / script 与主文件形成双份真相
- 后续变更时容易出现合同漂移
- 维护者难以判断某条规则到底应该改哪里

**总体判断：** `scout-audit` 下一步应从“主文件全量承载”切换为“主文件保留入口级 contract，专项内容回归专项文件”的结构。

---

## 二、问题分级

| 优先级 | 问题 | 表现 | 风险 |
| ------ | ---- | ---- | ---- |
| P0 | 主文件职责越界 | `SKILL.md` 混入 schema、模板、脚本、治理说明 | 形成双份真相，后续极易漂移 |
| P0 | 交付链细节内嵌主文件 | Delivery Gate 写入了大量命令级与失败样式说明 | 脚本接口一旦调整，主文件同步成本高 |
| P1 | 模式细节展开过深 | `joint` 的 `3.5` / `5c` 约束中混入布局、记录粒度和样例级内容 | 主文件难以快速扫描，边界不清 |
| P1 | 字段 canonical 约束散落在主文件 | `quantity`、旧字段禁用等字段定义以正文方式保留 | schema 失去单点权威 |
| P2 | 治理性内容与调用入口混写 | `Reference Map`、`Rationalization Guardrails`、`Red Flags` 共存于主文件 | 影响技能主入口的阅读效率 |

---

## 三、应保留在主文件的内容

优化后，`SKILL.md` 只应保留以下内容：

- 技能定位与适用范围
- 不适用场景
- `single` / `joint` 模式选择规则
- 调用前准入要求
- 高层 phase 编排
- 少量必须反复强调的核心不变量
- 高层交付顺序与硬停止规则
- 指向权威文件的精简索引

用一句话概括：

> `SKILL.md` 负责回答“什么时候用、能做什么、必须怎么走、什么时候必须停”，不再负责回答“字段长什么样、模板怎么写、脚本怎么跑、维护时怎么同步”。

---

## 四、需迁移的内容清单

### 4.1 迁移到 `contracts/`

下列内容属于流程契约，不宜继续堆在 `SKILL.md` 正文：

- Preflight Gate 的 Eligibility / Capability / Mode Detection / Failure Policy 细则
- `joint` 模式中 `3.5` / `5c` 的专项 contract
- Delivery Gate 的完整 stop policy
- “覆盖既有输出前必须征求确认”这类执行约束

建议迁移去向：

- `skills/custom/scout-audit/contracts/preflight.md`
- `skills/custom/scout-audit/contracts/joint-mode.md`
- `skills/custom/scout-audit/contracts/delivery.md`

### 4.2 迁移到 `schemas/`

下列内容属于结构定义，不应由主文件兜底：

- 结构化失败摘要 JSON 形状
- `docExtract.sampleInfo.quantity` 的 canonical 定义
- 旧字段名禁用规则
- 结果计数与结构化产物字段约束

建议迁移去向：

- `skills/custom/scout-audit/schemas/gate-failure-schema.md`
- `skills/custom/scout-audit/schemas/docExtract-schema.md`
- `skills/custom/scout-audit/schemas/report-schema.md`

### 4.3 迁移到 `templates/`

下列内容属于输出模板，而不是主文件 contract：

- Phase 固定输出文案
- session-log 记录粒度、固定布局、no-op 样例语义
- 审核报告模板中的来源标签写法

建议保留并强化的权威文件：

- `skills/custom/scout-audit/templates/phase-outputs.md`
- `skills/custom/scout-audit/templates/session-log-schema.md`
- `skills/custom/scout-audit/templates/report-template.md`

### 4.4 迁移到 `scripts/`

下列内容属于脚本接口文档，不应继续在主文件内联：

- `validate-results.ts` / `generate-report.ts` / `generate-session-log.ts` / `validate-session-log.ts` / `run-minimal-regression.ts` 的具体命令示例
- 常见失败原因与脚本级输入输出要求
- “脚本自动检测 auditMode”“仅脚本失败时允许手工补写”等操作性说明

建议新增：

- `skills/custom/scout-audit/scripts/README.md`

### 4.5 迁移到 `docs/`

下列内容更适合作为维护手册：

- `Reference Map`
- `Rationalization Guardrails`
- `Red Flags`
- 合同调整后的同步关系说明

建议保留或新增：

- `skills/custom/scout-audit/docs/sync-matrix.md`
- `skills/custom/scout-audit/docs/operator-guardrails.md`

---

## 五、推荐的职责边界

| 目录/文件 | 唯一职责 | 不再承载 |
| --------- | -------- | -------- |
| `SKILL.md` | 入口级编排合同 | 字段定义、模板细节、脚本说明、治理清单 |
| `contracts/` | 模式/交付/准入合同 | 字段级 schema 与模板样例 |
| `schemas/` | 结构化对象与字段定义 | 高层 phase 说明 |
| `templates/` | 固定输出与日志/报告样式 | 准入判断与停止策略 |
| `scripts/` | CLI 接口、校验与生成逻辑 | 主文件级业务定位 |
| `docs/` | 维护治理、同步矩阵、误用清单 | 运行时调用入口 |

---

## 六、推荐目录结构

```text
skills/custom/scout-audit/
├── SKILL.md
├── contracts/
│   ├── preflight.md
│   ├── joint-mode.md
│   └── delivery.md
├── rules/
│   └── rule-map.md
├── schemas/
│   ├── docExtract-schema.md
│   ├── limsData-schema.md
│   ├── report-schema.md
│   └── gate-failure-schema.md
├── templates/
│   ├── phase-outputs.md
│   ├── session-log-schema.md
│   └── report-template.md
├── prompts/
│   ├── classify.md
│   ├── extract.md
│   └── semantic-audit.md
├── scripts/
│   ├── README.md
│   ├── validate-results.ts
│   ├── generate-report.ts
│   ├── generate-session-log.ts
│   ├── validate-session-log.ts
│   ├── run-minimal-regression.ts
│   └── regression-fixtures.ts
├── docs/
│   ├── sync-matrix.md
│   ├── operator-guardrails.md
│   └── 2026-06-11-skill-structure-audit.md
└── mcps/
```

---

## 七、重构目标状态

当本次结构治理完成后，应满足以下结果：

- `SKILL.md` 可以在数分钟内读完，并让执行者明确入口条件与主流程
- 每类专项规则只有一个权威落点
- 任何字段、模板、脚本改动都能快速定位到唯一承载文件
- `sync-matrix.md` 能覆盖新引入的 contract 文件
- 后续 contract 收紧不再依赖“主文件补丁式追加”

---

## 八、建议执行顺序

1. 先新建承接文件，再缩减 `SKILL.md`
2. 先迁 Delivery / Preflight / Joint 三大块，再清理治理性内容
3. 完成后更新 `docs/sync-matrix.md`
4. 如实施改动触及 contract / schema / template / script，最后运行最小回归

---

## 九、审计结论

本次审计确认，`scout-audit` 的优化重点应从“补更多规则”转向“收紧主文件职责边界”。

主文件简洁化不是删减能力，而是把能力按正确的权责重新安放：

- 主文件回到入口合同
- 专项文件回到专项真相
- 维护文档回到治理用途

这将直接提升该技能的可维护性、可检索性、可演进性与回归验证可靠性。
