# Scout-Audit Contract Tightening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收紧 `scout-audit` 的合同、模板与脚本校验，阻止占位 session-log 过检，并让 joint 报告的整改建议带上来源标签。

**Architecture:** 先用审计产物复现当前问题，再同步修改 `SKILL.md`、权威模板文档与两个脚本。`validate-session-log.ts` 负责把“占位骨架”从结构合法提升为交付不合法，`generate-report.ts` 负责把 joint 模式的 FAIL/修正输出补上来源标签。

**Tech Stack:** Markdown contracts, TypeScript CLI scripts (`tsx`), fixture/regression validation

---

### Task 1: 复现审计问题

**Files:**
- Modify: `docs/superpowers/plans/2026-06-11-scout-audit-contract-tightening.md`
- Verify: `skills/custom/scout-audit/scripts/validate-session-log.ts`
- Inspect: `backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/a99b3aff-14d0-48d9-a2ca-ec1dcb900ff1/user-data/outputs/B2025051102-joint-session-log.jsonl`
- Inspect: `backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/a99b3aff-14d0-48d9-a2ca-ec1dcb900ff1/user-data/outputs/B2025051102-joint-audit-report.md`

- [ ] **Step 1: 运行现状校验**

```bash
npx tsx skills/custom/scout-audit/scripts/validate-session-log.ts \
  backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/a99b3aff-14d0-48d9-a2ca-ec1dcb900ff1/user-data/outputs/B2025051102-joint-session-log.jsonl \
  backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/a99b3aff-14d0-48d9-a2ca-ec1dcb900ff1/user-data/outputs/B2025051102-joint-results.json
```

Expected: 旧版本错误返回 `OK`，证明占位骨架仍能通过校验。

- [ ] **Step 2: 检查联合报告整改建议**

```text
确认 `B2025051102-joint-audit-report.md` 的整改建议中只出现 `### B002` / `### S001`，没有 `COA` / `ELN` / `跨文档` 来源标签。
```

- [ ] **Step 3: 记录根因**

```text
确认根因是合同未把“骨架占位不得交付”和“joint 报告必须带来源标签”提升为强制 gate，同时脚本没有做对应拦截。
```

### Task 2: 收紧合同与权威模板

**Files:**
- Modify: `skills/custom/scout-audit/SKILL.md`
- Modify: `skills/custom/scout-audit/templates/session-log-schema.md`
- Modify: `skills/custom/scout-audit/templates/report-template.md`

- [ ] **Step 1: 更新 `SKILL.md`**

```text
补充三条硬约束：
1. B002 的样品量字段统一为 `sampleInfo.quantity`，不得再以 `batchSize` 等旧字段名对外交付。
2. session-log 骨架仅可用于补写起点；任何 `Generated from results.json` / `replace with ...` / `FILL_ME` / 无效 duration 的内容都不得通过 Delivery Gate。
3. joint 报告的整改建议必须显式标注来源：`COA`、`ELN` 或 `跨文档`。
```

- [ ] **Step 2: 更新 session-log 权威模板**

```text
把占位字符串、Phase 3 skeleton response、`durationMs <= 0`、以及 rule-engine 场景下 `testItemCount/limsDataSources = 0` 写成无效模式和校验规则。
```

- [ ] **Step 3: 更新 joint 报告模板**

```text
把整改建议标题格式固定为：
- `### COA - B002: 产品信息完整`
- `### ELN - S001: 签名完整`
- `### 跨文档 - X003: 日期逻辑一致`
```

### Task 3: 修复脚本行为

**Files:**
- Modify: `skills/custom/scout-audit/scripts/validate-session-log.ts`
- Modify: `skills/custom/scout-audit/scripts/generate-report.ts`

- [ ] **Step 1: 先让旧 joint session-log 失败**

```text
在 `validate-session-log.ts` 中新增占位检测和 skeleton 默认值检测：
- 拒绝 `Generated from results.json`
- 拒绝 `replace with full docExtract`
- 拒绝 `replace with actual response`
- 拒绝 `FILL_ME`
- 拒绝 `durationMs <= 0`
```

- [ ] **Step 2: 补 joint 报告来源标签**

```text
在 `generate-report.ts` 中把 COA / ELN / 跨文档 FAIL 分开渲染，再合并成带来源标题的整改建议。
同时把 joint 修正记录优先从 `documents.coa.corrections`、`documents.eln.corrections` 和顶层跨文档修正中带来源输出。
```

- [ ] **Step 3: 保持 single 行为不变**

```text
single 报告继续沿用当前标题格式；
validator 只加强证据真实性，不改变 single / joint 的 phase 数量、计数逻辑和 overallResult 交叉校验。
```

### Task 4: 验证与交付

**Files:**
- Verify: `skills/custom/scout-audit/scripts/validate-session-log.ts`
- Verify: `skills/custom/scout-audit/scripts/generate-report.ts`
- Verify: `skills/custom/scout-audit/scripts/run-minimal-regression.ts`

- [ ] **Step 1: 重新运行真实 joint 校验**

```bash
npx tsx skills/custom/scout-audit/scripts/validate-session-log.ts \
  backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/a99b3aff-14d0-48d9-a2ca-ec1dcb900ff1/user-data/outputs/B2025051102-joint-session-log.jsonl \
  backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/a99b3aff-14d0-48d9-a2ca-ec1dcb900ff1/user-data/outputs/B2025051102-joint-results.json
```

Expected: 非零退出，并明确指出占位 docExtract / placeholder response / `durationMs` 问题。

- [ ] **Step 2: 重新生成 joint 报告**

```bash
npx tsx skills/custom/scout-audit/scripts/generate-report.ts \
  backend/.deer-flow/users/60e813bb-7ed5-45d8-ac40-9e9c4fe61923/threads/a99b3aff-14d0-48d9-a2ca-ec1dcb900ff1/user-data/outputs/B2025051102-joint-results.json \
  /tmp/B2025051102-joint-audit-report.md
```

Expected: `整改建议` 标题包含 `COA - ...` / `ELN - ...` / `跨文档 - ...`。

- [ ] **Step 3: 跑最小回归**

```bash
npx tsx skills/custom/scout-audit/scripts/run-minimal-regression.ts
```

Expected: 退出码 0。

- [ ] **Step 4: 检查编辑文件诊断**

```text
使用 IDE diagnostics 确认新增 TypeScript / Markdown 改动没有明显语法问题。
```
