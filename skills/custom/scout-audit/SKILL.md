---
name: scout-audit
description: Use when a user provides or references a lab COA (检验报告) or ELN (原始记录) source document and asks for a formal GMP/NMPA/ICH compliance audit or review.
---

# Scout Audit

**Skill Type: Rigid** — 严格按合同执行，不允许适应性偏移。本文件只定义入口 contract；字段结构、模板细节、脚本接口以各 phase 加载的 authority 文件为准。

## When to Use

- 输入是 COA / ELN 原始文档，或其可信的 Markdown / 纯文本转写。
- 目标是正式 GMP / NMPA / ICH 合规审核，而非普通总结、改写或泛化分析。

## Do Not Use

- 非 COA/ELN 审核场景：SOP、方案、偏差报告、普通总结。
- 输入是已生成的 `results.json` 或审核报告。
- 缺少可用的 `reportNo` / `batchNo`，无法建立审核锚点。

## Flow

模式判定：`single` = 1 个 COA 或 ELN，锚点 `reportNo`；`joint` = 1 份 COA + 1..N 份同批次 ELN，锚点 `batchNo`。
Preflight Gate 先于 Phase 0，不计入正式 phase。
所有审核只执行 `rules/rule-map.md` 中已定义的规则集合，不得自创、删改或重命名。

single:

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

joint:

```text
Preflight Gate
-> Phase 0a/0b source prep in parallel
-> Phase 1a/1b classify in parallel
-> Phase 2a/2b extract COA + ELN
-> Phase 3 fetch shared limsData by COA.batchNo
-> Phase 3.5 fixed ELN filtering slot
-> Phase 4a/4b deterministic rules in parallel
-> Phase 5a/5b semantic rules in parallel
-> Phase 5c cross-document rules X001-X005
-> Phase 6 merge to 69 results
-> Phase 7 deliver artifacts
```

## Phase 资源

进入任一 phase 前，先加载该行的 authority 文件；每个 phase 完成后，按 `templates/phase-outputs.md` 输出固定进度文案。

| Phase | 加载 | 产物 / 通过条件 |
|-------|------|----------------|
| Gate | `contracts/preflight.md`；失败摘要结构 → `schemas/gate-failure-schema.md` | 资格/能力/模式/覆盖确认四项通过，否则输出失败摘要并停止 |
| 0 | — | 源文档就绪为 Markdown |
| 1 | `prompts/classify.md` | `docType` 判定 |
| 2 | `prompts/extract.md`、`schemas/docExtract-schema.md` | `docExtract` |
| 3 | `scripts/README.md`（fetch-lims）、`schemas/limsData-schema.md` | `limsData` |
| 3.5 | `contracts/joint-mode.md` | ELN 筛选记录（single-batch 也写显式 no-op） |
| 4 | `scripts/README.md`（run-rules）、`rules/rule-map.md` | 20 条确定性 `RuleResult` |
| 5 | `prompts/semantic-audit.md`、`rules/rule-map.md` | 12 条语义规则结果 |
| 5c | `contracts/joint-mode.md`、`rules/rule-map.md`（X001-X005） | 5 条跨文档结果 |
| 6 | `schemas/report-schema.md` | `results.json`（single 32 条 / joint 69 条） |
| 7 | `contracts/delivery.md`、`scripts/README.md`、`templates/report-template.md` | 两件套通过校验并交付 |

## Hard Stops

停止条件以此清单为准；任一发生即停止：

- Gate 未通过，不得进入 Phase 0。
- 任一脚本非零退出、任一结构校验失败、覆盖确认缺失、两件套缺任一件。
- `joint` 链路缺失、改名、移位或合并 `3.5` / `5c` 槽位。
- Phase 0 对 Markdown / 纯文本伪装 PDF 转换（`mode` 只允许真实的 `convert` 或 `passthrough`）。
- 交付顺序颠倒：`results.json` 必须先写入并通过校验，再生成审核报告。
- 计数或命名不满足 contract。

所有 FAIL、SKIP、correction、dependency degradation 与脚本执行结果都必须落在结构化产物中，不能只留在自然语言总结里。交付前对照 `docs/operator-guardrails.md` 的 Red Flags 自检。

## Delivery

两件套 = `results.json` + 审核报告。

- 固定顺序、产物命名、校验门、手动补写 → `contracts/delivery.md`
- `joint` 专项（`elnScope`、`resolvedBatchNo` 注入、来源标签）→ `contracts/joint-mode.md`

## Maintenance

契约（contract / schema / template / 脚本接口）发生调整时：先回看 `docs/sync-matrix.md` 检查交付链一致性，再运行 `scripts/run-minimal-regression.ts`。
