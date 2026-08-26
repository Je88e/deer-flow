# Preflight Contract

定义进入 Phase 0 之前必须完成的准入检查。Gate 不是正式 phase，但它决定审核是否允许开始。

## Eligibility

- 输入必须是 COA / ELN 原始文档，或其可信的 Markdown / 纯文本转写。
- 已生成的 `results.json` / 审核报告不得作为输入再次审核；非 COA/ELN 场景（SOP、方案、偏差报告、普通总结）直接停止。
- 审核锚点必须可建立：`single` 需可用的 `reportNo`；`joint` 需可用的 `batchNo`，且为同批次 `1 COA + 1..N ELN`。

## Capability

- LIMS 数据获取可用：Phase 3 经 `scripts/fetch-lims.ts` 聚合 limsData（逻辑操作 `fetch_all_lims_data`，数据源 `lib/mock-data.ts`）。
- 确定性规则引擎可用：Phase 4 经 `scripts/run-rules.ts` 执行 20 条确定性规则（逻辑操作 `run_all_rules`，实现 `lib/rules.ts`）。
- 对 `.pdf` 输入，至少存在一种可用的 Markdown 获取路径；仅在必要时才回退到 `pdf` skill。
- 关键依赖不可用且无法给出结构化降级结果 → gate 失败。

## Mode Detection

- `single`：1 个 COA 或 ELN 文档，输出锚点 `reportNo`。
- `joint`：1 份 COA + 1..N 份同批次 ELN，输出锚点 `batchNo`；ELN 在提取阶段必须判定 `elnScope = "single-batch" | "multi-batch"`。

## Failure Policy

- 任一 gate 失败即停止，不进入 Phase 0；不允许先“试试看”再补救。
- 停止时返回结构化失败摘要，结构定义见 `../schemas/gate-failure-schema.md`。

## Overwrite Confirmation

- 若预期输出文件已存在，必须先停下征求用户确认。
- 未获得覆盖确认前，不允许继续写入任何两件套产物。

## References

- `../schemas/gate-failure-schema.md`
- `../docs/operator-guardrails.md`
