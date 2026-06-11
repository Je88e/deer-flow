---
name: scout-audit
description: Use when a user provides or references a lab COA (检验报告) or ELN (原始记录) source document and asks for a formal GMP/NMPA/ICH compliance audit or review.
---

# Scout Audit

## Overview

**Skill Type: Rigid** — 严格按合同执行，不允许适应性偏移。

面向制药/实验室文档的 GMP/NMPA/ICH 合规审核编排合同。主文件只保留入口级 contract，用于回答四件事:

- 什么时候用
- 什么时候不能用
- 正式审核主链怎么走
- 什么情况下必须停止

字段结构、模板细节、脚本接口与治理说明均以专项权威文件为准。

## When to Use

- 输入是 COA/ELN 原始文档，或其可信的 Markdown / 纯文本转写。
- 用户目标是做正式 GMP/NMPA/ICH 合规审核，而不是普通总结、改写或泛化分析。
- 审核对象尚未被加工为最终产物。

## Do Not Use

- 输入不是 COA/ELN 审核场景，例如 SOP、方案、偏差报告、普通总结。
- 输入其实是已生成的 `results.json`、审核报告或 `session-log.jsonl`。
- 缺少可用的 `reportNo` / `batchNo`，无法建立审核锚点。
- 关键依赖不可用且无法给出结构化降级结果。

## Admission Rules

- Preflight gate 必须先于 Phase 0；gate 不计入正式 phase，也不写入 `session-log.jsonl`。
- 必须先完成 eligibility、capability、mode detection 与 failure policy 检查。
- `single`
  - 1 个 COA 或 ELN 文档
  - 输出锚点为 `reportNo`
- `joint`
  - 1 份 COA + 1..N 份同批次 ELN
  - 输出锚点为 `batchNo`
  - 必须保留独立 `3.5` 槽位与 `5c` sub-phase
- Gate 失败摘要结构见 `schemas/gate-failure-schema.md`。
- Preflight 细则见 `contracts/preflight.md`。

## Core Flow

所有审核都只执行 `rules/rule-map.md` 中已定义的规则集合，不得自创、删改或重命名规则。

### Single

```text
Preflight Gate
-> Phase 0 source prep
-> Phase 1 classify
-> Phase 2 extract docExtract
-> Phase 3 fetch limsData
-> Phase 4 deterministic rules
-> Phase 5 semantic rules
-> Phase 6 merge to 32 results
-> Phase 7 deliver artifacts
```

### Joint

```text
Preflight Gate
-> Phase 0a/0b source prep in parallel
-> Phase 1a/1b classify in parallel
-> Phase 2a/2b extract COA + ELN
-> Phase 3 fetch shared limsData by COA.batchNo
-> Phase 3.5 fixed ELN filtering slot
-> Phase 4a/4b deterministic rules in parallel
-> Phase 5a/5b semantic rules in parallel
-> Phase 5c cross-document rules
-> Phase 6 merge to 69 results
-> Phase 7 deliver artifacts
```

## Hard Stops

- Gate 未通过时，必须停止，不得进入 Phase 0。
- `joint` 不得省略、改名、移位或并回 `3.5` / `5c`。
- Phase 0 只允许 `convert` 或 `passthrough`；Markdown / 纯文本不得伪装成 PDF 转换。
- 字段级 canonical 约束以 `schemas/docExtract-schema.md` 为准。
- 交付顺序固定为 `results.json` -> 审核报告 -> `session-log` 校验。
- 任一脚本非零退出、结构校验失败、覆盖确认缺失或三件套不完整，都必须停止。
- 所有 FAIL、SKIP、correction、dependency degradation 与脚本执行结果都必须落在结构化产物中，不能只留在自然语言总结里。

## Delivery Rules

- 交付 contract 见 `contracts/delivery.md`。
- `joint` 专项约束见 `contracts/joint-mode.md`。
- 仓库契约发生调整时，必须回看 `docs/sync-matrix.md`，并运行最小回归。

## Authority Map

- Contracts: `contracts/preflight.md`, `contracts/joint-mode.md`, `contracts/delivery.md`
- Rules: `rules/rule-map.md`
- Schemas: `schemas/docExtract-schema.md`, `schemas/limsData-schema.md`, `schemas/report-schema.md`, `schemas/gate-failure-schema.md`
- Templates: `templates/phase-outputs.md`, `templates/session-log-schema.md`, `templates/report-template.md`
- Prompts: `prompts/classify.md`, `prompts/extract.md`, `prompts/semantic-audit.md`
- Scripts: `scripts/README.md`
- Governance: `docs/operator-guardrails.md`, `docs/sync-matrix.md`
