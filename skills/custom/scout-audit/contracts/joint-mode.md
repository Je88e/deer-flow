# Joint Mode Contract

## Scope

适用于同一批次的 `1 COA + 1..N ELN` 联合审核。多个 ELN 文档先汇成一个逻辑 ELN 证据域，再进入固定 joint 审核链路。

## Core Decisions

- `joint` 必须保留独立的 `3.5` 槽位。
- `5c` 仅在 `joint` 执行；`single` 不得运行跨文档规则。
- `elnScope` 决定 ELN 筛选语义。
- `resolvedBatchNo` 只能在满足前置条件时注入。

## Fixed Flow

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

## Phase 3.5 Fixed Slot

- `3.5` 是 joint mode 的固定 ELN 筛选槽位，不得省略、改名、移位或并入 `2b`。
- `elnScope = "multi-batch"` 时，必须记录真实筛选结果。
- `elnScope = "single-batch"` 时，也必须写显式 no-op / passthrough 记录。
- `3.5` 的输出模板以 `../templates/phase-outputs.md` 为准。

## Phase 5c Joint-Only Rules

- `5c` 是跨文档规则专用 sub-phase，规则范围限定为 X001-X005。
- `5c` 不得并入 `5a`、`5b` 或其他 phase。
- 跨文档规则只在 `joint` 执行。

## ELN Scope Handling

- `elnScope = "single-batch"`
  - ELN 视为已天然对齐当前批次
  - 仍需保留 `3.5` 记录，但筛选方式为显式 no-op / passthrough
- `elnScope = "multi-batch"`
  - 必须先完成 `3.5` 筛选
  - 未完成筛选不得进入 ELN 规则与跨文档规则

## resolvedBatchNo Injection

- 前置条件:
  - 当前为 `joint`
  - `elnScope = "multi-batch"`
  - Phase 3.5 筛选成功
  - `filteredSampleCount > 0`
- 满足前置条件后，LLM 必须将 COA 的 `batchNo` 写入 ELN `docExtract.sampleInfo.resolvedBatchNo`，再传给 Phase 4b 规则引擎。
- 若 Phase 3.5 失败，不得注入 `resolvedBatchNo`。

## Output Constraints

- `joint` 结果总数固定为 69:
  - COA 32
  - ELN 32
  - 跨文档 5
- 输出命名固定为:
  - `outputs/{batchNo}-joint-results.json`
  - `outputs/{batchNo}-joint-audit-report.md`
- 报告中的整改建议与修正记录必须显式带来源标签，例如 `COA - B002`、`ELN - S001`、`跨文档 - X003`。

## References

- `../schemas/report-schema.md`
- `../templates/phase-outputs.md`
- `../templates/report-template.md`
