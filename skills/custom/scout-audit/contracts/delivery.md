# Delivery Contract

## Fixed Order

交付顺序固定，不得重排:

1. 写入 `results.json`
2. 校验 `results.json`
3. 生成审核报告
4. 生成或补全 `session-log.jsonl`
5. 校验 `session-log.jsonl`
6. 当本次修改触及仓库契约时，运行最小回归

脚本命令、输入输出与常见失败模式见 `../scripts/README.md`。

## Artifact Naming

- `single`
  - `outputs/{reportNo}-results.json`
  - `outputs/{reportNo}-audit-report.md`
  - `outputs/{reportNo}-session-log.jsonl`
- `joint`
  - `outputs/{batchNo}-joint-results.json`
  - `outputs/{batchNo}-joint-audit-report.md`
  - `outputs/{batchNo}-joint-session-log.jsonl`

## Validation Gates

- `results.json` 写入后，必须先通过结构校验，才能继续生成报告。
- 报告生成后，必须补全或生成 `session-log.jsonl`，再执行日志校验。
- 未通过 `validate-session-log.ts` 前，不得宣称交付完成。
- 若本次变更触及 contract / schema / template / 脚本接口，则最小回归为必跑项。

## Hard Stops

以下任一情况都必须停止:

- 任一脚本非零退出
- 任一结构校验失败
- 缺少覆盖确认
- 三件套产物缺任一件
- `single` / `joint` 的计数或命名不满足 contract

## Manual Fallback Policy

- 只有报告脚本失败时，才允许按同一模板手动补写报告。
- 即使发生手动补写，也不得跳过最终的结构校验和交付校验。
- `generate-session-log.ts` 生成的 JSONL 仅是骨架，不是可直接交付证据。

## Overwrite Confirmation

- 若目标输出文件已存在，必须先获得用户覆盖确认。
- 覆盖确认缺失时，不能继续写入，也不能宣称“基本完成”。

## References

- `../scripts/README.md`
- `../schemas/report-schema.md`
- `../templates/report-template.md`
- `../templates/session-log-schema.md`
