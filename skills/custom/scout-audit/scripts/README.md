# Script Interface Reference

> 本文件承接 `scout-audit` 交付脚本的调用方式、输入输出、退出码语义与常见失败模式。`SKILL.md` 与 `contracts/delivery.md` 只保留高层顺序，不重复 CLI 细节。

## Covered Commands

- `validate-results.ts`
- `generate-report.ts`
- `generate-session-log.ts`
- `validate-session-log.ts`
- `run-minimal-regression.ts`

## `validate-results.ts`

用途: 校验 `results.json` / `joint-results.json` 的结构、计数、规则覆盖与证据完整性。

```bash
npx tsx skills/custom/scout-audit/scripts/validate-results.ts <results.json>
```

- Input
  - `single`: `outputs/{reportNo}-results.json`
  - `joint`: `outputs/{batchNo}-joint-results.json`
- Output
  - 终端校验结果
- Exit code
  - `0`: 结构通过
  - 非 `0`: 必须停止并修复
- Common failures
  - 规则计数不符
  - `ruleId` 覆盖不完整
  - FAIL 证据字段缺失

## `generate-report.ts`

用途: 按 `templates/report-template.md` 生成审核报告。

```bash
npx tsx skills/custom/scout-audit/scripts/generate-report.ts <results.json> <audit-report.md>
```

- Input
  - 校验通过的 `results.json`
  - 目标报告路径
- Output
  - `single`: `outputs/{reportNo}-audit-report.md`
  - `joint`: `outputs/{batchNo}-joint-audit-report.md`
- Exit code
  - `0`: 报告生成成功
  - 非 `0`: 可按同一模板手动补写，但后续校验仍必须继续
- Common failures
  - `results.json` 路径错误
  - 模板占位符未覆盖
  - joint 模式变量映射不完整

## `generate-session-log.ts`

用途: 从 `results.json` 生成 `session-log.jsonl` 骨架，供后续补全真实证据。

```bash
npx tsx skills/custom/scout-audit/scripts/generate-session-log.ts <results.json> [session-log.jsonl]
```

- Input
  - `results.json`
  - 可选目标路径
- Output
  - `single`: 8 行骨架
  - `joint`: 15 行骨架
- Exit code
  - `0`: 骨架生成成功
  - 非 `0`: 必须停止并修复
- Common failures
  - 输入 results 路径错误
  - 结果文件缺少 `auditMode`
  - 生成后仍把骨架当最终交付证据

## `validate-session-log.ts`

用途: 校验 `session-log.jsonl` 的行结构、phase 顺序、字段完整性以及与 `results.json` 的一致性。

```bash
npx tsx skills/custom/scout-audit/scripts/validate-session-log.ts <session-log.jsonl> <results.json>
```

- Input
  - `single`: `outputs/{reportNo}-session-log.jsonl` + `outputs/{reportNo}-results.json`
  - `joint`: `outputs/{batchNo}-joint-session-log.jsonl` + `outputs/{batchNo}-joint-results.json`
- Output
  - 终端校验结果
- Exit code
  - `0`: 结构通过
  - 非 `0`: 交付失败，必须停止
- Common failures
  - single 不是 8 行 / joint 不是 15 行
  - 缺少 Phase 7 `exitCode` / `result`
  - 保留 `Generated from results.json`、`replace with ...`、`FILL_ME`
  - `durationMs <= 0`
  - joint 缺失独立 `3.5` 记录

## `run-minimal-regression.ts`

用途: 在 contract / schema / template / 脚本接口变更后，检查交付链是否发生 contract drift。

```bash
npx tsx skills/custom/scout-audit/scripts/run-minimal-regression.ts
```

- Input
  - 无额外 CLI 参数
- Output
  - 最小回归结果
- Exit code
  - `0`: 回归通过
  - 非 `0`: 本次交付失败
- Common failures
  - contract drift
  - 模板、schema、脚本接口未同步
  - 回归夹具与当前 contract 不一致

## `fetch-lims.ts`

用途: Phase 3 LIMS 数据聚合。从 Phase 2 的 `docExtract` 推导查询键（`batchNo`/`reportNo`/`standardRef`/人员/仪器/定性项/日期），调用聚合数据源，输出 `limsData` JSON。对应逻辑操作 `fetch_all_lims_data`，数据源为 `lib/mock-data.ts`。

```bash
npx tsx skills/custom/scout-audit/scripts/fetch-lims.ts <docExtract.json> [output.json]
```

- Input
  - `docExtract.json`（Phase 2 产物）
- Output
  - `limsData` JSON（默认 stdout；给 `output.json` 则写文件）
- Exit code
  - `0`: 成功
  - 非 `0`: 必须停止并修复（文件缺失、JSON 非法、缺 `reportNo`/`batchNo` 等）
- Common failures
  - `docExtract.reportInfo.reportNo` 或 `sampleInfo.batchNo` 缺失
  - 无 `testDate`/`reportDate` 可用于资质校验日期

## `run-rules.ts`

用途: Phase 4 确定性规则引擎。读取 Phase 2 `docExtract` + Phase 3 `limsData`，执行 20 条确定性规则，输出 `RuleResult[]`。对应逻辑操作 `run_all_rules`，实现为 `lib/rules.ts`。

```bash
npx tsx skills/custom/scout-audit/scripts/run-rules.ts <docExtract.json> <limsData.json> [output.json] [--doc-type ELN|COA] [--rule <id>]
```

- Input
  - `docExtract.json`、`limsData.json`
  - `--doc-type` 可选（默认取 `docExtract.docType`）
  - `--rule <id>` 可选，仅执行单条规则
- Output
  - 20 条 `RuleResult`（或 `--rule` 时的单条）JSON（默认 stdout；给 `output.json` 则写文件）
- Exit code
  - `0`: 成功
  - 非 `0`: 必须停止并修复
- Common failures
  - `docType` 无法确定
  - 输入 JSON 非法或文件缺失

## Usage Rule

- 任一脚本非零退出都必须停止。
- 先写 `results.json`，再生成报告，最后校验 `session-log.jsonl`。
- 一旦本次修改触及仓库契约，就必须运行最小回归。
