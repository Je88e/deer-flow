# Delivery Contract

## Fixed Order

交付顺序固定，不得重排：

1. 写入 `results.json`
2. 校验 `results.json`
3. 生成审核报告

脚本命令、输入输出与常见失败模式见 `../scripts/README.md`。

## Artifact Naming

- `single`
  - `outputs/{reportNo}-results.json`
  - `outputs/{reportNo}-audit-report.md`
- `joint`
  - `outputs/{batchNo}-joint-results.json`
  - `outputs/{batchNo}-joint-audit-report.md`

## Validation Gates

- `results.json` 写入后，必须先通过结构校验，才能继续生成报告。

## Hard Stops

停止条件以 `../SKILL.md` §Hard Stops 为唯一清单，本节不重复。

## Manual Fallback Policy

- 只有报告脚本失败时，才允许按同一模板手动补写报告。
- 即使发生手动补写，也不得跳过最终的结构校验和交付校验。

## Overwrite Confirmation

覆盖确认是 preflight gate 步骤，规则以 `./preflight.md` §Overwrite Confirmation 为准；未获确认即停止（见 `../SKILL.md` §Hard Stops）。

## References

- `../scripts/README.md`
- `../schemas/report-schema.md`
- `../templates/report-template.md`
- `./preflight.md`
