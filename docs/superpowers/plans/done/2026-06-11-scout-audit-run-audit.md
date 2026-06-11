# Scout-Audit 运行审计报告

> **审计对象:** `/home/jesse/project/deer-flow/skills/custom/scout-audit/SKILL.md`
> **审计范围:** `single` / `joint` 两次真实运行产物、报告文件、`session-log.jsonl`、相关 schema / template / script
> **审计日期:** 2026-06-11
> **single 线程目录:** `/home/jesse/project/deer-flow/backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/d683b50f-95d3-4412-8af2-76945e47a948`
> **joint 线程目录:** `/home/jesse/project/deer-flow/backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/a99b3aff-14d0-48d9-a2ca-ec1dcb900ff1`

---

## 一、总体结论

本次按 `scout-audit` 的技能合同，对 `single` 与 `joint` 两次真实运行进行了完整复盘，并交叉核对了以下内容：

- 输入文档与输出三件套是否完整
- 审核流程是否按 `SKILL.md` 约定执行
- `results.json`、审核报告、`session-log.jsonl` 是否符合 schema / template / delivery gate 要求
- `single` 与 `joint` 模式差异是否符合设计预期
- 是否存在运行异常、报错、输出遗漏或结果误判

### 1.1 总体判断

| 维度 | 结论 |
| ---- | ---- |
| 产物完整性 | ✅ 两次运行均产出三件套 |
| 主流程完整性 | ✅ `single` 与 `joint` 主链均已执行 |
| 命名与条数约束 | ✅ `single=32`、`joint=69`，命名符合合同 |
| 脚本校验状态 | ✅ 两份 `results.json` 与两份 `session-log.jsonl` 均通过官方校验脚本 |
| 结果准确性 | ⚠️ 存在字段契约漂移导致的误报风险 |
| 日志可信度 | ⚠️ `joint session-log` 存在骨架占位未补全仍能通过校验的问题 |
| 报告可执行性 | ⚠️ `joint` 整改建议缺少来源标识，影响落地整改 |

**一句话结论：** `scout-audit` 当前已经具备可运行、可交付、可校验的双模式输出能力，但仍存在 3 个高置信度问题，其中 2 个会影响结果准确性或运行可追溯性，1 个会影响联合报告的整改可执行性。

---

## 二、基础文件与运行对象

### 2.1 技能定义文件

- 技能合同入口：`/home/jesse/project/deer-flow/skills/custom/scout-audit/SKILL.md`

### 2.2 single 模式运行目录

- 线程目录：`/home/jesse/project/deer-flow/backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/d683b50f-95d3-4412-8af2-76945e47a948`
- 输入文件：
  - `user-data/uploads/批32037-COA.md`
  - `user-data/uploads/批32037-COA.pdf`
- 输出文件：
  - `user-data/outputs/HLGF-I-26040602-results.json`
  - `user-data/outputs/HLGF-I-26040602-audit-report.md`
  - `user-data/outputs/HLGF-I-26040602-session-log.jsonl`

### 2.3 joint 模式运行目录

- 线程目录：`/home/jesse/project/deer-flow/backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/a99b3aff-14d0-48d9-a2ca-ec1dcb900ff1`
- 输入文件：
  - `user-data/uploads/多批次-COA02.md`
  - `user-data/uploads/多批次ELN.md`
- 输出文件：
  - `user-data/outputs/B2025051102-joint-results.json`
  - `user-data/outputs/B2025051102-joint-audit-report.md`
  - `user-data/outputs/B2025051102-joint-session-log.jsonl`

---

## 三、single 模式复盘

### 3.1 输入识别

- 输入对象为单份 COA Markdown 文档，报告号 `HLGF-I-26040602`
- 批号为 `B202604035`
- 品名为“人血白蛋白原液”
- 规格为 `10%`
- 文档中存在 `检品数量 12ml`
- 文档页面签名栏为空，仅保留日期

### 3.2 流程复盘

`single` 运行日志与结果文件显示，该次执行遵循了 `SKILL.md` 约定的主链：

`Phase 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7`

具体表现如下：

- `Phase 0`：读取 Markdown，`mode=passthrough`
- `Phase 1`：分类为 `COA`
- `Phase 2`：提取 `reportNo/batchNo/specification/testItems/signatures`
- `Phase 3`：使用 `fetch_all_lims_data` 拉取聚合 LIMS 数据
- `Phase 4`：执行 20 条确定性规则
- `Phase 5`：执行 12 条语义规则
- `Phase 6`：合并为 32 条结果
- `Phase 7`：生成报告并校验 `session-log`

### 3.3 输出摘要

| 文件 | 结果 |
| ---- | ---- |
| `results.json` | `FAIL`，共 32 条规则，18 PASS / 2 FAIL / 12 SKIP |
| `audit-report.md` | 已生成，内容与 `results.json` 基本一致 |
| `session-log.jsonl` | 共 8 行，phase 顺序符合 `single` 合同 |

### 3.4 single 模式主要失败项

- `B002 产品信息完整`：结果写为 `字段 batchSize 缺失`
- `S001 签名完整`：报告页 `tester/reviewer/approver` 均为空

---

## 四、joint 模式复盘

### 4.1 输入识别

- 输入对象为 `1 份 COA + 1 份 ELN`
- COA 报告号：`HLGF-I-25051102`
- COA 批号：`B2025051102`
- ELN 编号：`ELN20190064`
- ELN 中共识别 17 个取样点结果
- `elnScope = single-batch`

### 4.2 流程复盘

`joint` 运行日志显示主链与额外槽位均已执行：

`0a/0b -> 1a/1b -> 2a/2b -> 3 -> 3.5 -> 4a/4b -> 5a/5b -> 5c -> 6 -> 7`

具体表现如下：

- `0a/0b`：COA 与 ELN 均按 Markdown passthrough 读取
- `1a/1b`：分别识别为 `COA` 与 `ELN`
- `2a/2b`：产生文档提取结果
- `3`：共享拉取 LIMS 数据
- `3.5`：保留了固定槽位，`single-batch` 下执行显式 no-op
- `4a/4b`：分别执行 COA / ELN 确定性规则
- `5a/5b`：分别执行 COA / ELN 语义规则
- `5c`：执行 `X001-X005` 跨文档规则
- `6`：汇总为 69 条结果
- `7`：生成联合报告并校验 `session-log`

### 4.3 输出摘要

| 文件 | 结果 |
| ---- | ---- |
| `joint-results.json` | `FAIL`，共 69 条规则，36 PASS / 4 FAIL / 29 SKIP |
| `joint-audit-report.md` | 已生成，统计与结果文件一致 |
| `joint-session-log.jsonl` | 共 15 行，包含 `3.5` 与 `5c` |

### 4.4 joint 模式主要失败项

- COA `B002 产品信息完整`：结果写为 `字段 batchSize 缺失`
- COA `S001 签名完整`：`approver` 缺失，`reviewer` 为空
- ELN `B002 产品信息完整`：结果写为 `字段 specification 缺失`
- ELN `S001 签名完整`：`reviewer/approver` 缺失

### 4.5 joint 模式差异核查结论

| 检查项 | 结果 |
| ------ | ---- |
| 顶层 `auditMode=joint` | ✅ |
| COA 32 + ELN 32 + X 5 = 69 | ✅ |
| `3.5` 槽位独立保留 | ✅ |
| `5c` 跨文档规则存在 | ✅ |
| 输出命名以 `batchNo` 为锚点 | ✅ |
| session-log 15 行布局 | ✅ |

---

## 五、脚本校验结果

本次审计对四个结构化产物执行了官方脚本校验。

### 5.1 已执行校验

```bash
npx tsx skills/custom/scout-audit/scripts/validate-results.ts <single-results.json>
npx tsx skills/custom/scout-audit/scripts/validate-session-log.ts <single-session-log.jsonl> <single-results.json>
npx tsx skills/custom/scout-audit/scripts/validate-results.ts <joint-results.json>
npx tsx skills/custom/scout-audit/scripts/validate-session-log.ts <joint-session-log.jsonl> <joint-results.json>
```

### 5.2 校验结论

| 产物 | 结论 |
| ---- | ---- |
| `HLGF-I-26040602-results.json` | ✅ 通过 |
| `HLGF-I-26040602-session-log.jsonl` | ✅ 通过 |
| `B2025051102-joint-results.json` | ✅ 通过 |
| `B2025051102-joint-session-log.jsonl` | ✅ 通过 |

### 5.3 解释

当前问题不是“文件缺失”或“结构不合法”，而是：

- 某些运行结果虽通过脚本校验，但仍可能存在字段契约漂移导致的业务误判
- 某些 `joint session-log` 内容虽通过结构校验，但实际上仍保留由骨架生成器写入的占位信息

---

## 六、问题清单

### P1. `B002` 字段契约漂移导致误报 `FAIL`

#### P2 问题描述

当前规则引擎中的 `B002` 已按 `productName/specification/quantity` 进行校验，但两次真实运行产物中仍出现 `字段 batchSize 缺失` 的失败结论。

这与当前提取 schema / 规则实现已不一致，说明运行链路中仍存在旧字段命名残留或字段映射漂移。

#### 证据

- `single` 输入文档明确存在 `检品数量 12ml`
- `single results.json` 仍报 `batchSize 缺失`
- `joint` COA 输入文档明确存在 `检品数量 11份`
- `joint results.json` 同样报 `batchSize 缺失`
- 规则引擎源码当前使用的是 `quantity`

#### P2 影响范围

- 直接影响 `single` 与 `joint` 的 COA 审核准确性
- 会造成 `overallResult` 被严重问题拉成 `FAIL`
- 会进一步污染生成的 Markdown 报告与整改建议

#### P2 改进建议

- 统一 `B002` 的字段契约，只保留 `quantity`
- 修正提取阶段、LIMS 对账映射、结果生成链路中的旧字段残留
- 为 `quantity` 与旧字段兼容增加明确回归样例

---

### P2. `joint session-log` 存在占位骨架未补全仍可过校验的问题

#### P3 问题描述

`joint session-log.jsonl` 中的 `Phase 2a/2b/3` 明显保留了由 `generate-session-log.ts` 写入的占位摘要，例如：

- `Generated from results.json; replace with full docExtract`
- `Generated from results.json — replace with actual response`

但当前 `validate-session-log.ts` 只校验结构存在，不校验这些值是否为真实运行证据，因此该日志仍然被判定为 `OK`。

#### P3 影响范围

- 影响 `joint` 模式运行日志的可信度与可追溯性
- 可能导致“骨架日志”被误认为“真实日志”
- 不利于后续问题复盘、稽核与监管审查

#### P3 改进建议

- 在 `validate-session-log.ts` 中显式拒绝占位值
- 至少校验以下内容不得为骨架默认值：
  - Phase 2 的 `_summary`
  - Phase 3 `calls[].response`
  - Phase 4 `testItemCount/limsDataSources`
  - `durationMs = 0` 的无效聚合调用

---

### P3. `joint` 报告整改建议缺少来源标识

#### 问题描述

`joint-audit-report.md` 的整改建议段落把 `COA`、`ELN` 的同号规则直接平铺输出，例如：

- `B002: 产品信息完整`
- `S001: 签名完整`

由于没有 `COA/ELN/跨文档` 来源标签，读者无法直接判断整改对象属于哪一份文档。

#### 影响范围

- 影响联合报告整改执行
- 影响责任归属与问题定位
- 当 `COA` 和 `ELN` 同时出现相同规则号失败时，歧义明显

#### 改进建议

- 在整改建议中增加来源字段
- 推荐格式：
  - `COA - B002`
  - `ELN - S001`
  - `X003 (跨文档)`

---

## 七、风险点与审计说明

### 7.1 已确认问题与风险点区分

本报告将问题分为两类：

- **高置信度问题**：已有输入、结果、代码或脚本证据直接支撑
- **风险点**：现象可疑，但缺少足够运行时证据，不纳入正式缺陷

### 7.2 当前未列为正式缺陷的风险点

- `joint` 顶层 `specification` 当前为 `液体`，而 COA 原文中 `规格` 为 `N/A`、`剂型` 为 `液体`
- 由于缺少该次运行时完整真实 `docExtract`，暂不把该点列为正式缺陷，只标记为后续需继续核查的提取映射风险

---

## 八、最终审计判断

截至本次审计，`scout-audit` 在 `single` 与 `joint` 两种模式下已经满足以下基本目标：

- 能完成预设审核流程
- 能生成约定三件套
- 能在官方结构脚本下通过校验
- 能体现 `single/joint` 差异化合同约束

但仍存在以下未完全收口的问题：

1. `B002` 字段契约漂移，影响结果准确性
2. `joint session-log` 可追溯性不足，骨架内容可能伪装成真实日志
3. `joint` 报告整改建议缺少来源标识，影响整改执行

**最终结论：** `scout-audit` 已达到“功能可运行、产物可交付、结构可校验”的阶段，但距离“结果完全可信、日志完全可审、联合报告完全可执行”的目标仍有明确差距。建议优先修复 `B002` 契约一致性与 `joint session-log` 骨架放行问题，再优化联合报告的整改来源标识。
