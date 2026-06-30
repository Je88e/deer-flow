# Delivery Contract

## Fixed Order

交付顺序固定，不得重排:

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
- 若本次变更触及 contract / schema / template / 脚本接口，则最小回归为必跑项。

## Hard Stops

以下任一情况都必须停止:

- 任一脚本非零退出
- 任一结构校验失败
- 缺少覆盖确认
- 两件套产物缺任一件
- `single` / `joint` 的计数或命名不满足 contract

## Manual Fallback Policy

- 只有报告脚本失败时，才允许按同一模板手动补写报告。
- 即使发生手动补写，也不得跳过最终的结构校验和交付校验。

## Overwrite Confirmation

- 若目标输出文件已存在，必须先获得用户覆盖确认。
- 覆盖确认缺失时，不能继续写入，也不能宣称“基本完成”。

## References

- `../scripts/README.md`
- `../schemas/report-schema.md`
- `../templates/report-template.md`
