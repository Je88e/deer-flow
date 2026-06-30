# Operator Guardrails

> 本文件承接执行者的治理型自检内容。`SKILL.md` 只保留入口级 contract，不重复维护者借口对照表和误用清单。

## Rationalization Guardrails

| Excuse | Contract Reality |
| ------ | ---------------- |
| "先试试看再补救" | Gate 失败就停止，不能进入 Phase 0。 |
| "3.5 可以并回 2b" | `3.5` 是 `joint` 的固定槽位，`single-batch` 也要保留显式 no-op。 |
| "脚本失败但内容看起来对" | 交付只有在脚本和结构校验都通过后才成立。 |
| "已有报告也可以再审一次" | 已生成产物不是原始审核输入，必须在 preflight 直接拦下。 |
| "缺个 reportNo/batchNo 可以先猜" | 审核锚点缺失时只能停止并返回结构化失败摘要。 |
| "ELN 是 single-batch 所以不需要 3.5" | `single-batch` 也必须保留显式 no-op / passthrough `3.5` 记录。 |
| "`batchSize` 只是旧叫法，先继续用也没关系" | `B002` 的 canonical 字段只有 `quantity`；旧字段名不能再出现在结构化产物或最终 FAIL 文案中。 |
| "joint 报告里同号规则读者自己能分辨" | 联合报告必须给整改项标来源；没有 `COA/ELN/跨文档` 标签就不具备执行性。 |
| "规则引擎不可用但我知道算法" | inline fallback 只能按 `rule-map.md` 既有算法，且必须显式记录降级范围。 |
| "Phase 5 可以修正 Phase 4 的判定" | Phase 5 不得重写确定性判定边界；语义修正有明确范围限制。 |

## Red Flags

- 文档不是 COA/ELN 却继续审核
- `reportNo` / `batchNo` 缺失却自行补猜
- 没做 capability handshake 就直接进入 Phase 0
- 已生成的 `results.json` / 报告 被误当原始输入继续审核
- 把 `3.5` 并回 `2b`、把 `5c` 并回其他 phase，或用“single-batch 不需要单独写”做理由
- Phase 0 对 Markdown / 纯文本伪造 PDF 转换
- single / joint 模式识别错误，或 joint 未以 COA 批次为共享锚点
- `elnScope = "multi-batch"` 却跳过 Phase 3.5 直接继续审计
- 跨文档规则 X001-X005 在 single 模式执行，或 joint 漏跑
- 依赖降级后仍把结果表述为“完整审核通过”
- 报告先于 `results.json` 生成，或跳过 `generate-report.ts`
- 脚本非零退出、结构校验失败或产物不完整，却仍用“差不多完成”对外交付
- `B002` 在文档已存在样品量信息时仍输出 `batchSize 缺失` 一类旧字段 FAIL 文案
- `joint` 报告整改建议仍只写规则号，不写 `COA` / `ELN` / `跨文档` 来源
- 任一脚本、结构校验或覆盖确认未通过，却继续对外输出最终结论
