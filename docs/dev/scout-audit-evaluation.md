# Scout-Audit 技能评估报告

> **评估对象:** `/home/jesse/project/deer-flow/skills/custom/scout-audit/SKILL.md`
> **评估范围:** 技能规范、规则引擎、mock-data、最小回归驱动、报告/日志脚本
> **评估日期:** 2026-06-05
> **本轮基线产物目录:** `/home/jesse/project/deer-flow/docs/reports/regression-outputs/outputs`

---

## 一、总体结论

本轮按 Task 7 重跑了 3 组最小回归样例，并基于真实 `results.json / audit-report.md / session-log.jsonl` 刷新评估结论。

| 维度 | 当前评价 |
| ---- | -------- |
| 规范完整性 | ★★★★★ 优秀 — 8 阶段链路、32 规则、3 产物契约保持稳定 |
| 规则引擎正确性 | ★★★★☆ 良好 — `S001` / `S004` / `S002` / `S003` / detection-limit `L001` 已按新契约收口 |
| 端到端可重放 | ★★★★★ 优秀 — 最小驱动可稳定生成三件套并通过 session log 校验 |
| 报告/日志一致性 | ★★★★☆ 良好 — `generate-report.ts` 与 `validate-session-log.ts` 已纳入真实回归 |
| 剩余风险 | ★★★☆☆ 中等 — `A408H0001` 仍保留 6 个 severe FAIL，需要按业务语义继续判断真阳性 vs 契约待细化 |

**一句话总结：** 旧版评估里最关键的 P0 结论已经过时；当前 `scout-audit` 已具备可回放的最小回归闭环，`S001` 空签名漏报、`S004` workflow 误判、以及 detection-limit 场景下 `L001` 的残余误判都已被真实回归覆盖并修复。

---

## 二、本轮回归事实

### 2.1 样例与结果

| 样例 | 文档类型 | overallResult | 统计 | 关键结论 |
| ---- | -------- | ------------- | ---- | -------- |
| `A408H0001` | COA | FAIL | 14 PASS / 7 FAIL / 11 SKIP / 1 correction | 作为历史基准样例，`S001`、`S004` 现在按预期暴露问题 |
| `detection-limit-coa` | COA | PASS | 20 PASS / 0 FAIL / 12 SKIP | `N001`、`R002`、`R004`、`L001` 均已正确处理 detection-limit |
| `eln-with-complete-workflow` | ELN | PASS | 25 PASS / 0 FAIL / 7 SKIP | ELN 侧最小链路可完整生成三件套；`S004` 对 ELN 继续按规则定义 SKIP |

### 2.2 Task 7 验收点核对

| 验收点 | 结果 |
| ------ | ---- |
| 固定 3 组回归样例 | ✅ 已固定为 `A408H0001`、`detection-limit-coa`、`eln-with-complete-workflow` |
| 每组生成 `results.json / audit-report.md / session-log.jsonl` | ✅ 全部生成 |
| `ruleResults.length === 32` | ✅ 三组样例均满足 |
| `S001 / S004` 不再误判 | ✅ `A408H0001` 中均为预期 FAIL；`detection-limit-coa` 中均为预期 PASS |
| detection-limit 合同回归可验证 | ✅ `detection-limit-coa` 现为整体 PASS |
| `validate-session-log.ts` 通过 | ✅ 已随驱动真实执行通过 |

### 2.3 三件套状态

| 文件类型 | 说明 |
| -------- | ---- |
| `*-results.json` | 已用于确认 32 条规则分布、`corrections[]`、`summary` 计数 |
| `*-audit-report.md` | 已由 `generate-report.ts` 真实生成，不再依赖手写报告 |
| `*-session-log.jsonl` | 已由 `validate-session-log.ts` 校验，Phase 4/5/6 计数一致 |

---

## 三、已修复结论

以下结论与旧版评估不同，现已由真实回归确认刷新：

### F1. `S001` 不再漏报空签名

- 旧结论：`S001` 可能只检查角色是否存在，导致 reviewer / approver 空签名被放过。
- 当前事实：`A408H0001-results.json` 中 `S001 = FAIL`，明确报出 `空签名角色: reviewer, approver`。
- 结论：该 false negative 已被修复，并被回归测试覆盖。

### F2. `S004` 不再基于错误数据源误判

- 旧结论：评估报告中曾把 `requestForm.approvalWorkflow` 与 `limsData.workflow` 混用，导致对 mock-data 能力和规则结果的判断失真。
- 当前事实：
  - `A408H0001-results.json` 中 `S004 = FAIL`，因为 `limsData.workflow` 真实存在且 reviewer / approver 仍为 `pending`。
  - `detection-limit-coa-results.json` 中 `S004 = PASS`，因为 workflow 三步均 `completed`。
- 结论：旧版“mock-data 普遍缺 workflow，导致 S004 被错误判 PASS”的说法已不成立。

### F3. detection-limit 场景下 `L001` 残余误判已收口

- 旧结论：`N001 / R002 / R004` 已豁免，但 `L001` 仍沿用普通数值比较，导致 `<0.025%` + “符合规定”被判 FAIL。
- 当前事实：`detection-limit-coa-results.json` 中 `L001 = PASS`，样例整体 `overallResult = PASS`。
- 结论：该残余 bug 已修复，且已补入规则引擎测试。

### F4. 回归入口已从“计划”变成“可执行脚本”

- 旧结论：仓库内没有把 fixture、规则引擎、报告脚本、session-log 校验串起来的最小回放入口。
- 当前事实：`run-minimal-regression.ts` 已可一键生成三组三件套，并输出每组汇总结果。
- 结论：Task 7 的“重跑回归样例”现在具备稳定执行入口，不再依赖人工拼装。

---

## 四、当前基线解读

### 4.1 `A408H0001` 仍保留的失败项

`A408H0001` 当前仍有 5 个 FAIL，其中 4 个为 severe：

- `B002` 产品信息完整
- `D002` 原始数据可追溯
- `S001` 签名完整
- `S004` 审核流程完整
- `C001` 结论规范

其中 `L001` 仍保留 correction，结果为 `FAIL -> PASS`，原因是 COA 使用总结论且与全部定量项目结果一致。

### 4.2 当前不再视为 bug 的点

- `detection-limit-coa` 的 `N001 / R002 / R004 / L001` 全部 PASS，说明检测限契约已落到规则层，不再只是提示词约束。
- `A408H0001` 中 `S002 / S003` 现已按“sign 留痕完整 + user/account 一一稳定”新契约转为 PASS；在不使用黑名单的前提下，这与本轮决策一致。
- `eln-with-complete-workflow` 的 `S004 = SKIP` 仍符合当前规则定义，因为 `S004` 仅适用于 COA；这不是本轮回归缺陷。

### 4.3 仍需业务判断的点

以下点目前不阻塞 Task 7 完成，但仍建议后续单独决策：

- `B002` 中 `batchSize` 与 COA “代表量”字段是否应视为同一语义。
- `A408H0001` 中 `D002 / C001` 是否要继续细化 fixture，避免评估长期混入“样例不完整”与“规则命中”两类原因。

---

## 五、与旧版报告相比的明确更新

至少以下旧表述现已失效，并已在本报告中移除或改写：

| 旧表述 | 当前状态 |
| ------ | -------- |
| `S004` 的主要问题是 mock-data 缺 workflow，真实结果会被错误判 PASS | 已失效。现在 `limsData.workflow` 已有固定样例，`S004` 在 `A408H0001` / `detection-limit-coa` 上均表现符合预期 |
| detection-limit 只在提示词层面体现，规则引擎未真正验证 | 已失效。`detection-limit-coa` 已证明 deterministic rules 与 `L001` 都能真实通过 |
| `S002 / S003` 仍主要依赖主观语义判断，尚未形成稳定契约 | 已失效。现在两者已收紧为 `auditTrail (+ workflow)` 的机械校验，并进入回归驱动 |
| 仓库没有可执行的端到端回归入口 | 已失效。`run-minimal-regression.ts` 已提供最小回归驱动 |
| 本轮评估仍以单个 COA 报告为主 | 已部分失效。当前已纳入 1 个 COA 基准样例、1 个 detection-limit 样例、1 个 ELN 样例 |

---

## 六、后续建议

### 6.1 可以视为已完成的计划项

- `S001` / `S004` 误判修复
- `S002` / `S003` 机械契约落地
- detection-limit 场景回归补齐
- 最小回归驱动落地
- 三件套真实生成与校验
- 评估报告刷新

### 6.2 下一轮更合适的收敛方向

| 优先级 | 建议 |
| ------ | ---- |
| P1 | 单独澄清 `B002` 的字段映射契约，避免基准样例长期挂在语义歧义上 |
| P2 | 继续补更多 ELN 边界样例，如平行样、加标回收率、环境条件异常 |
| P2 | 为 `A408H0001` 增加更明确的原始数据 fixture，区分“真实不合规”与“样例缺字段” |

---

## 七、最终结论

截至 2026-06-05，`scout-audit` 的核心 P0 改进目标已达成：

- `S001` 空签名不再漏报
- `S004` 不再基于错误 workflow 认知做出错误结论
- `S002 / S003` 已改为可回归的机械契约，不再依赖“通用账号”黑名单或临场语义判断
- detection-limit 场景下的 `L001` 残余误判已修复
- Task 7 所需最小回归闭环已落地并可重复执行

当前更像是**“进入有真实回归护栏的稳定迭代阶段”**，而不是“仍停留在评估报告先发现、代码后补救”的阶段。后续工作的重点不再是补 P0 漏洞，而是继续把剩余语义边界收紧成更明确的契约。
