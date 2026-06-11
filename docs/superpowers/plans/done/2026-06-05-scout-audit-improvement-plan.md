# Scout Audit Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `scout-audit` skill 当前的 P0/P1 契约漂移问题，消除 `S001`/`S004` 误判，补齐检测限和 session log 一致性校验，并建立最小回归测试闭环。

**Architecture:** 本次改进不重做 `scout-audit` 的 8-phase 总流程，而是沿着三条线并行收敛：一条线修规则引擎与 mock-data，解决真实误判；一条线修 skill 文档、schema、prompt 与报告模板，消除规范和实现的偏差；一条线补测试和验证脚本，把当前依赖人工评估报告才能发现的问题改为自动拦截。交付结果应保持现有输入输出形态不变，只提高准确性、一致性和可维护性。

**Tech Stack:** Markdown skill docs, JSON schema, TypeScript MCP servers, `tsx`, `typescript`, optional `vitest`

**Primary Evidence:** `docs/reports/scout-audit-evaluation.md`

**Non-goals:** 不在本次计划内重写全部 32 条规则；不引入新的审核 phase；不改变 `results.json` / `audit-report.md` / `session-log.jsonl` 的三产物模型；不把 COA 和 ELN 拆成两个独立 skill。

---

## Problem Summary

| Priority | Problem | Root Cause | Required Outcome |
| -------- | ------- | ---------- | ---------------- |
| P0 | `S001` 把空 reviewer/approver 签名误判为 PASS | 规则引擎只检查 `role` 是否出现，不检查 `name/date`，也忽略 `signatureMethod: "image"` | `S001` 能区分缺失签名、图片签名、完整签名 |
| P0 | `S004` 把不完整 workflow 误判为 PASS | 规则引擎仅检查 `skipped` 和有限顺序条件，未验证 steps 完成度和签名有效性 | `S004` 仅在流程完整、状态一致时 PASS |
| P1 | 检测限豁免只存在于文档和提示词 | `N001/R001-R004` 未在规则引擎硬编码 `isDetectionLimit` 行为 | 检测限场景不再依赖 LLM 临场推理 |
| P1 | `session-log` 与 `report` 的 corrections 契约不一致 | `report-schema` 用对象数组，`session-log-schema` 仍用字符串数组 | 两类产物对 corrections 使用同一结构 |
| P1 | `B002` 在 COA 的“代表量”场景上存在字段映射歧义 | `docExtract` 只有 `batchSize`，缺少独立代表量字段 | COA 抽取和审核不再混淆“批量”和“代表量” |
| P2 | 规则引擎 warning/evidence/location 与模板输出衔接弱 | schema 已支持部分字段，但引擎与脚本未完全利用 | 报告、日志和规则执行证据更可追踪 |

---

## File Structure

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `skills/custom/scout-audit/SKILL.md` | Modify | 明确 S001/S004、检测限豁免、契约和验证顺序 |
| `skills/custom/scout-audit/rules/rule-map.md` | Modify | 把关键规则的判定逻辑从描述升级为算法/判定表 |
| `skills/custom/scout-audit/prompts/extract.md` | Modify | 收紧 `signatureMethod: "image"` 与空签名的提取边界 |
| `skills/custom/scout-audit/prompts/semantic-audit.md` | Modify | 与更新后的 corrections/evidence 结构保持一致 |
| `skills/custom/scout-audit/schemas/docExtract-schema.md` | Modify | 明确签名字段与代表量字段语义 |
| `skills/custom/scout-audit/schemas/report-schema.md` | Modify | 与 corrections/evidence/location 的最终设计对齐 |
| `skills/custom/scout-audit/templates/session-log-schema.md` | Modify | 统一 corrections 结构并增强 Phase 6 约束 |
| `skills/custom/scout-audit/templates/phase-outputs.md` | Modify | 增强 Phase 6 完成态和最终验证输出 |
| `skills/custom/scout-audit/templates/report-template.md` | Modify | 如落地 warning/location，则同步报告展示区块 |
| `skills/custom/scout-audit/scripts/generate-report.ts` | Modify | 正确渲染 corrections、warning、location |
| `skills/custom/scout-audit/scripts/validate-session-log.ts` | Modify | 新增结构和计数一致性校验 |
| `skills/custom/scout-audit/mcps/scout-rule-engine/src/rules.ts` | Modify | 修复 S001/S004 与检测限逻辑 |
| `skills/custom/scout-audit/mcps/scout-rule-engine/src/algorithms.ts` | Modify | 如需抽取检测限/签名辅助算法，放在此处 |
| `skills/custom/scout-audit/mcps/scout-rule-engine/package.json` | Modify | 增加测试脚本和依赖 |
| `skills/custom/scout-audit/mcps/scout-rule-engine/tests/rules.test.ts` | Create | 覆盖 S001/S004/检测限的最小回归测试 |
| `skills/custom/scout-audit/mcps/scout-lims-connector/src/mock-data.ts` | Modify | 补充 workflow / image 签名 / detection-limit 样本 |
| `skills/custom/scout-audit/mcps/scout-lims-connector/package.json` | Modify | 增加测试脚本和依赖 |
| `skills/custom/scout-audit/mcps/scout-lims-connector/tests/mock-data.test.ts` | Create | 验证 mock workflow 和边界样本结构 |
| `docs/reports/scout-audit-evaluation.md` | Modify | 更新已过时的 S004/mock-data 结论 |

---

## Task 1: 冻结 P0 规则契约

先改文档再改代码，目标是把 `S001`、`S004`、检测限豁免的“正确行为”写死到 skill 契约里，避免实现者继续按模糊描述发挥。

**Files:**

- Modify: `skills/custom/scout-audit/SKILL.md`
- Modify: `skills/custom/scout-audit/rules/rule-map.md`
- Modify: `skills/custom/scout-audit/prompts/extract.md`
- Modify: `skills/custom/scout-audit/schemas/docExtract-schema.md`

- [ ] **Step 1: 在 `rule-map.md` 为 `S001` 增加判定表**

把现有“签名完整”描述改成显式算法，至少覆盖以下分支：

- 缺少 `tester/reviewer/approver` 任一角色 -> `FAIL`
- 角色存在但 `name/date` 缺失，且 `signatureMethod !== "image"` -> `FAIL`
- 角色存在，`signatureMethod === "image"`，允许 OCR 未提取到姓名，但必须说明豁免依据 -> `PASS` 或 `PASS with note`
- 三角色均完整 -> `PASS`

- [ ] **Step 2: 在 `rule-map.md` 为 `S004` 增加 workflow 判定表**

明确写出：

- 读取字段以 `limsData.workflow` 为准
- workflow 缺失 -> `SKIP`
- workflow 存在但缺少 required steps -> `FAIL`
- step 存在但 status 非 `completed` -> `FAIL`
- 顺序、`currentStep`、`signatureValid` 任一不一致 -> `FAIL`
- 全量一致 -> `PASS`

- [ ] **Step 3: 更新 `SKILL.md` 的 Audit Contract 和 Common Mistakes**

把以下内容升格为技能级约束：

- `S004` 只认 `limsData.workflow`
- 检测限场景必须由规则引擎硬编码，不允许仅靠 Phase 5 修正
- `signatureMethod: "image"` 代表“看见签名但 OCR 不完整”，不是“姓名和日期都空就自动当图片签名”

- [ ] **Step 4: 更新 `extract.md` 与 `docExtract-schema.md`**

新增或改写以下提取说明：

- “姓名和日期均空”视为缺失签名，不是图片签名
- 只有识别到图片签名证据时，才允许输出 `signatureMethod: "image"`
- 为 COA 场景新增 `representativeQuantity` 字段，避免挤占 `batchSize`

- [ ] **Step 5: 文档一致性检查**

逐项核对以下文件是否仍互相矛盾：

- `SKILL.md`
- `rules/rule-map.md`
- `prompts/extract.md`
- `schemas/docExtract-schema.md`

- [ ] **Step 6: 提交**

```bash
git add \
  skills/custom/scout-audit/SKILL.md \
  skills/custom/scout-audit/rules/rule-map.md \
  skills/custom/scout-audit/prompts/extract.md \
  skills/custom/scout-audit/schemas/docExtract-schema.md
git commit -m "docs(scout-audit): freeze S001 S004 and extraction contracts"
```

---

## Task 2: 为规则引擎补最小回归测试

当前 `scout-rule-engine` 只有 `build/dev` 脚本，没有测试层。先补测试，再改 `rules.ts`，避免重复出现“评估报告能看出来、代码里拦不住”的情况。

**Files:**

- Modify: `skills/custom/scout-audit/mcps/scout-rule-engine/package.json`
- Create: `skills/custom/scout-audit/mcps/scout-rule-engine/tests/rules.test.ts`

- [ ] **Step 1: 为 `scout-rule-engine` 增加测试依赖**

建议使用 `vitest`，因为仓库 `frontend/package.json` 已在使用它，认知成本最低。更新 `package.json`：

- `devDependencies` 增加 `vitest`
- `scripts` 增加 `test: "vitest run"`

- [ ] **Step 2: 编写 `rules.test.ts` 的首批用例**

至少覆盖 6 组断言：

- `S001`：三角色齐全且姓名日期完整 -> `PASS`
- `S001`：reviewer/approver 空签名 -> `FAIL`
- `S001`：`signatureMethod: "image"` -> 不误判缺签
- `S004`：workflow 为 `null` -> `SKIP`
- `S004`：workflow 存在但 approver 未 completed -> `FAIL`
- detection limit：`isDetectionLimit: true` 时 `N001/R002/R004` 按契约豁免

- [ ] **Step 3: 运行测试，确认当前基线能暴露失败**

Run:

```bash
cd /home/jesse/project/deer-flow/skills/custom/scout-audit/mcps/scout-rule-engine && npm run test
```

Expected:

- 至少 `S001` 与 `S004` 相关用例在改实现前失败

- [ ] **Step 4: 提交测试基线**

```bash
git add \
  skills/custom/scout-audit/mcps/scout-rule-engine/package.json \
  skills/custom/scout-audit/mcps/scout-rule-engine/tests/rules.test.ts
git commit -m "test(scout-rule-engine): add regression coverage for S001 S004"
```

---

## Task 3: 修复 `rules.ts` 的 P0/P1 逻辑

在测试已经失败的前提下，改 `rules.ts` 与必要的辅助算法，把关键逻辑从“存在性检查”升级为“契约检查”。

**Files:**

- Modify: `skills/custom/scout-audit/mcps/scout-rule-engine/src/rules.ts`
- Modify: `skills/custom/scout-audit/mcps/scout-rule-engine/src/algorithms.ts`

- [ ] **Step 1: 抽取签名完整性辅助函数**

在 `algorithms.ts` 或 `rules.ts` 内部抽出统一函数，例如：

- `isImageSignature(sig)`
- `isMissingSignature(sig)`
- `getRequiredSignatureRoles(docType?)`

要求：

- 输入异常时稳定返回布尔值，不抛出未捕获异常
- 不把空字符串当作“存在”

- [ ] **Step 2: 修复 `S001`**

将 `S001` 改为：

- 角色不存在 -> `FAIL`
- 角色存在且非 `image` 但 `name/date` 缺失 -> `FAIL`
- `image` 签名走豁免路径
- 失败 evidence 写出缺失角色或空签名角色列表

- [ ] **Step 3: 修复 `S004`**

将 `S004` 改为：

- `workflow == null` -> `SKIP`
- required steps 缺失 -> `FAIL`
- required steps 未完成 -> `FAIL`
- `currentStep` 与完成度冲突 -> `FAIL`
- `signatureValid === false` -> `FAIL`

- [ ] **Step 4: 将检测限逻辑下沉**

不要再把 detection limit 只留给 Prompt/Phase 5 修正。至少做到：

- `N001` 在 `isDetectionLimit: true` 且规格允许时自动 `PASS`
- `R002/R004` 在 `isDetectionLimit: true` 时豁免
- 如 `R001/R003` 也需要受检测限影响，则一并统一写入算法

- [ ] **Step 5: 运行单测和构建**

Run:

```bash
cd /home/jesse/project/deer-flow/skills/custom/scout-audit/mcps/scout-rule-engine && npm run test && npm run build
```

Expected:

- `vitest` 全部通过
- `tsc` 编译通过

- [ ] **Step 6: 提交**

```bash
git add \
  skills/custom/scout-audit/mcps/scout-rule-engine/src/rules.ts \
  skills/custom/scout-audit/mcps/scout-rule-engine/src/algorithms.ts
git commit -m "fix(scout-rule-engine): tighten S001 S004 and detection-limit logic"
```

---

## Task 4: 统一 corrections 和 Phase 6 契约

让 `report`、`session-log`、校验脚本三者使用同一 corrections 结构，并把 Phase 6 的计数交叉检查真正落到脚本层。

**Files:**

- Modify: `skills/custom/scout-audit/schemas/report-schema.md`
- Modify: `skills/custom/scout-audit/templates/session-log-schema.md`
- Modify: `skills/custom/scout-audit/templates/phase-outputs.md`
- Modify: `skills/custom/scout-audit/scripts/validate-session-log.ts`

- [ ] **Step 1: 统一 corrections 结构**

选定唯一结构，建议统一为：

```json
[
  {
    "ruleId": "L001",
    "originalStatus": "FAIL",
    "correctedTo": "PASS",
    "reason": "..."
  }
]
```

然后同步：

- `report-schema.md`
- `session-log-schema.md`
- `validate-session-log.ts`

- [ ] **Step 2: 增强 Phase 6 载荷**

要求 Phase 6/merge 至少可交叉验证：

- `passCount`
- `failCount`
- `skipCount`
- `overallResult`
- `corrections[]`

- [ ] **Step 3: 在 `validate-session-log.ts` 增加一致性检查**

新增至少 3 类校验：

- Phase 4 + Phase 5 规则总数必须等于 32
- Phase 6 汇总计数必须等于 Phase 4/5 明细计算结果
- session log 的 corrections 与 `results.json` 中 corrections 数量和 ruleId 一致

- [ ] **Step 4: 运行脚本构建检查**

Run:

```bash
cd /home/jesse/project/deer-flow/skills/custom/scout-audit/mcps/scout-rule-engine && npm run build
cd /home/jesse/project/deer-flow/skills/custom/scout-audit/mcps/scout-lims-connector && npm run build
npx tsx /home/jesse/project/deer-flow/skills/custom/scout-audit/scripts/validate-session-log.ts --help
```

- [ ] **Step 5: 提交**

```bash
git add \
  skills/custom/scout-audit/schemas/report-schema.md \
  skills/custom/scout-audit/templates/session-log-schema.md \
  skills/custom/scout-audit/templates/phase-outputs.md \
  skills/custom/scout-audit/scripts/validate-session-log.ts
git commit -m "refactor(scout-audit): unify corrections and strengthen phase-6 validation"
```

---

## Task 5: 扩展 mock-data 与 LIMS 侧样本

让 mock-data 真正承担“边界样本仓库”的职责，而不是只提供 happy-path 结构。

**Files:**

- Modify: `skills/custom/scout-audit/mcps/scout-lims-connector/src/mock-data.ts`
- Modify: `skills/custom/scout-audit/mcps/scout-lims-connector/package.json`
- Create: `skills/custom/scout-audit/mcps/scout-lims-connector/tests/mock-data.test.ts`

- [ ] **Step 1: 补边界样本**

至少增加以下样本：

- `S001-empty-reviewer-approver`
- `S001-image-signature`
- `S004-missing-approver-step`
- `detection-limit-coa`
- `eln-with-complete-workflow`

要求每个样本都能指向一个明确的预期规则结果。

- [ ] **Step 2: 为 connector 增加最小测试脚本**

与 `scout-rule-engine` 保持一致，增加 `vitest` 和 `npm run test`。

- [ ] **Step 3: 编写 `mock-data.test.ts`**

至少验证：

- `getMockApprovalWorkflow(reportNo)` 对新增报告号返回预期结构
- 缺失 workflow 时稳定返回 `null`
- 新增样本中的 signature/workflow/status 字段满足 schema 契约

- [ ] **Step 4: 运行测试与构建**

Run:

```bash
cd /home/jesse/project/deer-flow/skills/custom/scout-audit/mcps/scout-lims-connector && npm run test && npm run build
```

- [ ] **Step 5: 提交**

```bash
git add \
  skills/custom/scout-audit/mcps/scout-lims-connector/src/mock-data.ts \
  skills/custom/scout-audit/mcps/scout-lims-connector/package.json \
  skills/custom/scout-audit/mcps/scout-lims-connector/tests/mock-data.test.ts
git commit -m "test(scout-lims-connector): add boundary workflow and signature fixtures"
```

---

## Task 6: 补报告模板和生成脚本

在不改变现有三产物模型的前提下，让报告和结果文件更好承接 corrections、warning 和 evidence location。

**Files:**

- Modify: `skills/custom/scout-audit/templates/report-template.md`
- Modify: `skills/custom/scout-audit/scripts/generate-report.ts`
- Modify: `skills/custom/scout-audit/prompts/semantic-audit.md`

- [ ] **Step 1: 确定 `evidence.location` 的落地策略**

二选一，必须统一：

- 方案 A：在 `report-schema.md` 明确 `location` 为推荐字段，脚本有则展示、无则省略
- 方案 B：如果近期不准备实现，则从模板和提示词中降级，不再暗示“默认存在”

- [ ] **Step 2: 更新报告模板**

若采用方案 A，建议增加两个区块：

- “修正记录”区块，展示 `corrections[]`
- “规则引擎告警/证据定位”区块，展示 warning 或 `evidence.location`

- [ ] **Step 3: 更新 `generate-report.ts`**

确保脚本输出与模板一致：

- 不重复渲染 corrections
- location 存在时显示，不存在时不输出空字段
- 不改变现有 summary 和 ruleResults 主结构

- [ ] **Step 4: 手工验证脚本输出**

Run:

```bash
npx tsx /home/jesse/project/deer-flow/skills/custom/scout-audit/scripts/generate-report.ts \
  /mnt/user-data/outputs/A408H0001-results.json \
  /tmp/A408H0001-audit-report.md
```

然后检查 `/tmp/A408H0001-audit-report.md` 的 corrections、warning、location 展示是否符合模板。

- [ ] **Step 5: 提交**

```bash
git add \
  skills/custom/scout-audit/templates/report-template.md \
  skills/custom/scout-audit/scripts/generate-report.ts \
  skills/custom/scout-audit/prompts/semantic-audit.md
git commit -m "feat(scout-audit): improve report rendering for corrections and evidence"
```

---

## Task 7: 更新评估报告并重跑回归样例

文档修复后，需要重跑一轮最小回归，并把评估报告中已过时的 S004/mock-data 结论更新掉。

**Files:**

- Modify: `docs/reports/scout-audit-evaluation.md`
- Modify: `docs/reports/A408H001.json` only if regenerated as part of fresh evaluation

- [ ] **Step 1: 更新评估报告中过时陈述**

至少修正以下表述：

- “`WORKFLOWS` 仅包含一个 reportNo” 已不再成立
- 保留“`S004` 规则算法仍过宽”的结论，但根因改成“验证条件不足”

- [ ] **Step 2: 选定 3 组回归样例**

建议固定以下样例：

- `A408H0001`：现有 COA 基准样例
- 一个 detection-limit 样例
- 一个 ELN workflow 完整样例

- [ ] **Step 3: 重跑并记录结果**

输出至少包括：

- `results.json`
- `audit-report.md`
- `session-log.jsonl`

检查：

- `ruleResults.length === 32`
- `S001/S004` 不再误判
- corrections 结构一致
- `validate-session-log.ts` 校验通过

- [ ] **Step 4: 提交**

```bash
git add docs/reports/scout-audit-evaluation.md
git commit -m "docs(scout-audit): refresh evaluation after contract and engine fixes"
```

---

## Rollout Order

1. Task 1: 冻结契约
2. Task 2: 先补回归测试，制造红灯
3. Task 3: 修规则引擎
4. Task 4: 统一 schema 和校验器
5. Task 5: 补 mock-data 边界样本
6. Task 6: 收口报告模板和生成脚本
7. Task 7: 重跑评估并更新文档

---

## Acceptance Criteria

- `S001` 在 reviewer/approver 空签名时稳定 `FAIL`
- `S001` 在真实图片签名场景下不误判缺签
- `S004` 只有在 workflow 完整、状态一致、签名有效时才 `PASS`
- detection limit 行为由规则引擎直接决定，而不是依赖 Prompt 修正
- `results.json` 与 `session-log.jsonl` 的 corrections 结构完全一致
- `validate-session-log.ts` 能拦截 Phase 4/5/6 的计数漂移
- `mock-data` 至少覆盖 COA、ELN、image signature、empty signature、detection limit 五类边界样本
- `generate-report.ts` 能正确呈现 corrections，且对 `location` 采取统一策略
- `scout-rule-engine` 和 `scout-lims-connector` 都具备最小自动化测试入口

---

## Risks And Mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| 只改文档不改引擎 | 误判继续存在 | Task 2 必须先建失败用例，Task 3 才允许改实现 |
| 只改引擎不改 schema | 产物契约继续漂移 | Task 4 作为独立任务并要求脚本校验 |
| mock-data 不补边界样本 | 回归覆盖不足 | Task 5 固定新增样本并加测试 |
| `location` 设计不清 | 报告脚本与 schema 继续打架 | Task 6 先做单一决策，再同步模板/脚本/提示词 |
| 评估报告不更新 | 后续判断继续基于旧信息 | Task 7 明确刷新文档结论 |

---

## Verification Checklist

- [ ] `SKILL.md` / `rule-map.md` / `prompt` / `schema` 对 `S001`、`S004`、检测限、corrections 的描述一致
- [ ] `scout-rule-engine` 的 `npm run test` 和 `npm run build` 通过
- [ ] `scout-lims-connector` 的 `npm run test` 和 `npm run build` 通过
- [ ] `generate-report.ts` 对真实样例输出符合模板
- [ ] `validate-session-log.ts` 能校验并拦截错误输入
- [ ] `docs/reports/scout-audit-evaluation.md` 已更新为当前实现状态

---

## Suggested Follow-up

- 如果后续继续扩展规则，应把“规则定义 + 测试样例 + mock-data 样本”作为一个原子变更提交，避免再次出现“规范先变、实现后补、测试缺失”的漂移。
- 如果 `scout-audit` 后续进入生产使用，建议再补一份 `ELN end-to-end regression plan`，因为本轮评估仍以 COA 为主。
