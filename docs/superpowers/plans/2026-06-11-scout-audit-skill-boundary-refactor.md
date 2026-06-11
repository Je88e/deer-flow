# Scout-Audit Skill Boundary Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `scout-audit` 的主文件收紧为入口级合同，把 preflight、joint、delivery、schema、模板、治理说明迁回各自专项文件。

**Architecture:** 本次改造不改变 `scout-audit` 的审核能力、phase 链路或三件套交付模型，只重构文档与合同边界。执行顺序采用“先建承接文件，再迁移内容，最后收紧主文件并补同步矩阵”的方式，避免中途出现合同真空或双份真相。

**Tech Stack:** Markdown contracts, TypeScript CLI scripts (`tsx`), documentation-driven refactor, regression validation

---

## Scope

本计划只处理文档与合同边界，不包含以下工作：

- 不新增业务规则
- 不修改 MCP 能力接口
- 不调整 `single` / `joint` 的 phase 设计
- 不变更 `results.json` / `audit-report.md` / `session-log.jsonl` 的产物模型

---

## File Structure

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `skills/custom/scout-audit/SKILL.md` | Modify | 保留技能定位、准入规则、高层流程和硬停止条件 |
| `skills/custom/scout-audit/contracts/preflight.md` | Create | 承接 preflight gate 细则与失败策略 |
| `skills/custom/scout-audit/contracts/joint-mode.md` | Create | 承接 `joint` 模式专有合同与 `3.5` / `5c` 约束 |
| `skills/custom/scout-audit/contracts/delivery.md` | Create | 承接 delivery gate、覆盖确认与停止条件 |
| `skills/custom/scout-audit/schemas/gate-failure-schema.md` | Create | 承接 gate 失败摘要结构 |
| `skills/custom/scout-audit/schemas/docExtract-schema.md` | Modify | 吸收字段 canonical 约束与旧字段禁用规则 |
| `skills/custom/scout-audit/templates/session-log-schema.md` | Modify | 继续作为 session-log 权威结构定义 |
| `skills/custom/scout-audit/templates/phase-outputs.md` | Modify | 继续作为 phase 固定输出权威模板 |
| `skills/custom/scout-audit/templates/report-template.md` | Modify | 继续作为报告模板权威文件 |
| `skills/custom/scout-audit/scripts/README.md` | Create | 承接脚本调用方式、输入输出与常见失败 |
| `skills/custom/scout-audit/docs/operator-guardrails.md` | Create | 承接 Rationalization Guardrails 与 Red Flags |
| `skills/custom/scout-audit/docs/sync-matrix.md` | Modify | 增加新增 contract/schema 文件的同步关系 |
| `skills/custom/scout-audit/docs/2026-06-11-skill-structure-audit.md` | Keep | 作为本次结构审计基线与验收参考 |

---

### Task 1: 建立新的权威文件承接位

**Files:**

- Create: `skills/custom/scout-audit/contracts/preflight.md`
- Create: `skills/custom/scout-audit/contracts/joint-mode.md`
- Create: `skills/custom/scout-audit/contracts/delivery.md`
- Create: `skills/custom/scout-audit/schemas/gate-failure-schema.md`
- Create: `skills/custom/scout-audit/scripts/README.md`
- Create: `skills/custom/scout-audit/docs/operator-guardrails.md`

- [ ] **Step 1: 新建 `contracts/preflight.md`**

```markdown
# Preflight Contract

## Purpose

定义进入 Phase 0 之前必须完成的 eligibility、capability、mode detection 与 failure policy。

## Sections

- Eligibility
- Capability
- Mode Detection
- Failure Policy
- Overwrite Confirmation
```

- [ ] **Step 2: 新建 `contracts/joint-mode.md`**

```markdown
# Joint Mode Contract

## Scope

适用于 `1 COA + 1..N ELN` 的同批次联合审核。

## Required Decisions

- `3.5` 固定槽位必须保留
- `5c` 仅在 `joint` 执行
- `elnScope` 决定筛选语义
- `resolvedBatchNo` 注入前置条件
```

- [ ] **Step 3: 新建 `contracts/delivery.md`**

```markdown
# Delivery Contract

## Fixed Order

1. Write `results.json`
2. Generate report
3. Generate or complete session-log
4. Validate session-log
5. Run minimal regression when contract changes

## Hard Stops

- Any non-zero script exit
- Any structure validation failure
- Missing overwrite confirmation
- Missing artifact in final bundle
```

- [ ] **Step 4: 新建 `schemas/gate-failure-schema.md`**

```markdown
# Gate Failure Schema

`json`
{
  "failedStep": "",
  "reason": "",
  "recoverable": false,
  "suggestedAction": ""
}
```

- [ ] **Step 5: 新建 `scripts/README.md`**

```markdown
# Script Interface Reference

## Covered Commands

- `validate-results.ts`
- `generate-report.ts`
- `generate-session-log.ts`
- `validate-session-log.ts`
- `run-minimal-regression.ts`

每个脚本必须说明：

- input
- output
- exit code semantics
- common failure patterns
```

- [ ] **Step 6: 新建 `docs/operator-guardrails.md`**

```markdown
# Operator Guardrails

## Rationalization Guardrails

保留“借口 -> 合同现实”的对照表。

## Red Flags

保留误用清单，供维护者与执行者自检。
```

- [ ] **Step 7: 提交新建文件**

```bash
git add \
  skills/custom/scout-audit/contracts/preflight.md \
  skills/custom/scout-audit/contracts/joint-mode.md \
  skills/custom/scout-audit/contracts/delivery.md \
  skills/custom/scout-audit/schemas/gate-failure-schema.md \
  skills/custom/scout-audit/scripts/README.md \
  skills/custom/scout-audit/docs/operator-guardrails.md
git commit -m "docs(scout-audit): add contract boundary files"
```

---

### Task 2: 将 `SKILL.md` 的越界内容迁移出去

**Files:**

- Modify: `skills/custom/scout-audit/SKILL.md`
- Modify: `skills/custom/scout-audit/contracts/preflight.md`
- Modify: `skills/custom/scout-audit/contracts/joint-mode.md`
- Modify: `skills/custom/scout-audit/contracts/delivery.md`
- Modify: `skills/custom/scout-audit/schemas/gate-failure-schema.md`
- Modify: `skills/custom/scout-audit/docs/operator-guardrails.md`

- [ ] **Step 1: 迁移 Preflight Gate 细则**

```text
把 `SKILL.md` 中以下内容迁到 `contracts/preflight.md`：
- Eligibility
- Capability
- Mode Detection
- Failure Policy
- 覆盖既有输出前先停下征求确认
```

- [ ] **Step 2: 迁移失败摘要结构**

```text
把 `SKILL.md` 中最小失败摘要 JSON 从正文移到 `schemas/gate-failure-schema.md`。
`SKILL.md` 仅保留一句引用：
“Gate failure payload 见 `schemas/gate-failure-schema.md`。”
```

- [ ] **Step 3: 迁移 `joint` 专项细节**

```text
把以下内容从 `SKILL.md` 迁到 `contracts/joint-mode.md`：
- `3.5` 固定槽位的具体语义
- `5c` 的 joint-only 规则
- `elnScope = single-batch | multi-batch` 的处理差异
- `resolvedBatchNo` 注入前置条件
```

- [ ] **Step 4: 迁移 Delivery Gate 细节**

```text
把以下内容从 `SKILL.md` 迁到 `contracts/delivery.md` 与 `scripts/README.md`：
- 脚本命令示例
- 脚本执行顺序
- 常见失败原因
- “脚本失败时才允许手工补写”这类操作说明
```

- [ ] **Step 5: 迁移治理型内容**

```text
把 `Rationalization Guardrails` 与 `Red Flags` 整块迁到 `docs/operator-guardrails.md`。
`SKILL.md` 只保留一句：
“维护与误用清单见 `docs/operator-guardrails.md`。”
```

- [ ] **Step 6: 收缩 `Reference Map`**

```text
将 `Reference Map` 改写为短索引：
- Rules: `rules/rule-map.md`
- Schemas: `schemas/*.md`
- Templates: `templates/*.md`
- Prompts: `prompts/*.md`
- Scripts: `scripts/README.md`
```

- [ ] **Step 7: 提交迁移结果**

```bash
git add \
  skills/custom/scout-audit/SKILL.md \
  skills/custom/scout-audit/contracts/preflight.md \
  skills/custom/scout-audit/contracts/joint-mode.md \
  skills/custom/scout-audit/contracts/delivery.md \
  skills/custom/scout-audit/schemas/gate-failure-schema.md \
  skills/custom/scout-audit/docs/operator-guardrails.md \
  skills/custom/scout-audit/scripts/README.md
git commit -m "docs(scout-audit): move detailed contracts out of SKILL"
```

---

### Task 3: 收紧主文件为入口级合同

**Files:**

- Modify: `skills/custom/scout-audit/SKILL.md`

- [ ] **Step 1: 重写主文件结构**

```markdown
## Overview
## When to Use
## Admission Rules
## Core Flow
## Hard Stops
## Authority Map
```

- [ ] **Step 2: 只保留高层合同**

```text
保留以下信息：
- 适用/不适用场景
- `single` / `joint` 选择条件
- Gate 必须先于 Phase 0
- `single` 与 `joint` 的高层 phase 链路
- 交付顺序固定
- 任一硬失败即停止
```

- [ ] **Step 3: 删除或改写越界表述**

```text
从 `SKILL.md` 中删去或改写以下类型内容：
- JSON 字段结构
- 脚本 CLI 命令
- Phase 输出模板原文
- session-log 行布局细节
- 维护者治理清单
```

- [ ] **Step 4: 控制主文件篇幅**

```text
目标：将 `SKILL.md` 压缩到当前体量的约 35%-45%，但不损失入口级合同信息。
```

- [ ] **Step 5: 手工复核主文件是否还能独立回答四个问题**

```text
1. 什么时候用？
2. 什么时候不能用？
3. 正式审核主链怎么走？
4. 什么情况下必须停止？
```

- [ ] **Step 6: 提交主文件收紧结果**

```bash
git add skills/custom/scout-audit/SKILL.md
git commit -m "docs(scout-audit): tighten SKILL to entry contract"
```

---

### Task 4: 更新 schema/template/sync 归属关系

**Files:**

- Modify: `skills/custom/scout-audit/schemas/docExtract-schema.md`
- Modify: `skills/custom/scout-audit/templates/session-log-schema.md`
- Modify: `skills/custom/scout-audit/templates/phase-outputs.md`
- Modify: `skills/custom/scout-audit/templates/report-template.md`
- Modify: `skills/custom/scout-audit/docs/sync-matrix.md`

- [ ] **Step 1: 把字段 canonical 约束回收到 schema**

```text
确认以下约束只在 schema 承载：
- `docExtract.sampleInfo.quantity` 是唯一 canonical 样品量字段
- 旧字段名不得再作为最终结构化产物 key
```

- [ ] **Step 2: 复核模板 ownership 声明**

```text
确保以下文件仍明确写出：
- `templates/session-log-schema.md` 是 session-log 权威结构定义
- `templates/phase-outputs.md` 是 phase 固定输出权威模板
- `templates/report-template.md` 是报告版式权威模板
```

- [ ] **Step 3: 更新同步矩阵**

```text
在 `docs/sync-matrix.md` 新增以下同步项：
- `contracts/preflight.md`
- `contracts/joint-mode.md`
- `contracts/delivery.md`
- `schemas/gate-failure-schema.md`
```

- [ ] **Step 4: 检查所有“single source of truth”只出现一次**

```text
逐一确认同一约束没有同时在 `SKILL.md` 与专项文件中重复展开。
```

- [ ] **Step 5: 提交专项文件同步更新**

```bash
git add \
  skills/custom/scout-audit/schemas/docExtract-schema.md \
  skills/custom/scout-audit/templates/session-log-schema.md \
  skills/custom/scout-audit/templates/phase-outputs.md \
  skills/custom/scout-audit/templates/report-template.md \
  skills/custom/scout-audit/docs/sync-matrix.md
git commit -m "docs(scout-audit): align schema template and sync ownership"
```

---

### Task 5: 验证结构治理没有破坏交付链

**Files:**

- Verify: `skills/custom/scout-audit/SKILL.md`
- Verify: `skills/custom/scout-audit/contracts/preflight.md`
- Verify: `skills/custom/scout-audit/contracts/joint-mode.md`
- Verify: `skills/custom/scout-audit/contracts/delivery.md`
- Verify: `skills/custom/scout-audit/scripts/run-minimal-regression.ts`
- Verify: `skills/custom/scout-audit/docs/sync-matrix.md`

- [ ] **Step 1: 搜索残余重复块**

Run:

```bash
grep -R "Rationalization Guardrails\|Red Flags\|validate-session-log.ts outputs\|Generated from results.json" \
  /home/jesse/project/deer-flow/skills/custom/scout-audit
```

Expected:

- 相关内容只保留在新的权威文件中，不再在 `SKILL.md` 重复展开

- [ ] **Step 2: 运行最小回归**

Run:

```bash
cd /home/jesse/project/deer-flow
npx tsx skills/custom/scout-audit/scripts/run-minimal-regression.ts
```

Expected:

- 退出码 `0`
- 无 contract drift 相关报错

- [ ] **Step 3: 检查新增 Markdown 文件诊断**

```text
使用 IDE diagnostics 确认新增与修改的 Markdown 文件没有明显格式问题，链接与路径命名一致。
```

- [ ] **Step 4: 输出验收结论**

```text
验收必须明确回答：
- `SKILL.md` 是否已只保留入口级合同？
- `contracts/` 是否已承接流程专项细则？
- `scripts/README.md` 是否已接住脚本接口说明？
- `docs/sync-matrix.md` 是否已覆盖新增权威文件？
```

- [ ] **Step 5: 提交最终验收状态**

```bash
git add \
  skills/custom/scout-audit/SKILL.md \
  skills/custom/scout-audit/contracts \
  skills/custom/scout-audit/schemas \
  skills/custom/scout-audit/templates \
  skills/custom/scout-audit/scripts/README.md \
  skills/custom/scout-audit/docs
git commit -m "docs(scout-audit): finalize skill boundary refactor"
```

---

## Handoff Checklist

- [ ] 新增 contract/schema/docs 文件都已创建
- [ ] `SKILL.md` 只保留入口级合同
- [ ] 脚本用法已从主文件迁出到 `scripts/README.md`
- [ ] 治理性内容已迁到 `docs/operator-guardrails.md`
- [ ] `sync-matrix.md` 已覆盖新增权威文件
- [ ] 最小回归通过

---

## Success Criteria

本计划完成后，执行者应能在不阅读全文树的前提下：

- 通过 `SKILL.md` 快速理解是否应调用该技能
- 通过 `contracts/` 查到流程与停止规则
- 通过 `schemas/` 查到结构定义
- 通过 `templates/` 查到输出格式
- 通过 `scripts/README.md` 查到脚本接口
- 通过 `docs/sync-matrix.md` 查到变更时的同步范围
