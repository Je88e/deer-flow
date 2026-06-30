# scout-audit 移除 session-log.jsonl 交付物 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 scout-audit 交付合同中移除 `session-log.jsonl` 及一切仅服务于它的脚本/文档，使合同收敛为两件套（`results.json` + 审核报告），观测退化为 ambient Langfuse。

**Architecture:** 这是一次**删除型重构 + 合同简化**，无新功能代码。唯一被修改的 `.ts` 是 `run-minimal-regression.ts`（移除 session-log 生成/校验调用）；其余为 markdown 合同/文档编辑与文件删除。`results.json` schema 不变（已验证自洽）。验证模型为**回归门 + 静态 grep**，非 feature TDD —— 因既有测试门只覆盖 `lib/`，无法捕获 prose 编辑（见全局约束）。

**Tech Stack:** TypeScript（tsx 脚本）、vitest、CJK Markdown 合同文档。

**Spec:** `docs/superpowers/specs/2026-06-29-scout-audit-drop-session-log-design.md`

## Global Constraints

- 工作目录：所有命令从技能目录运行 `cd /home/jesse/project/deer-flow/skills/custom/scout-audit`（bash 重置 cwd；见 memory `deerflow-stdio-mcp-cwd`）。
- **CJK Markdown 编辑注意（本技能已验证的坑）：** 对中文 markdown 的精确字符串替换，用 Edit 工具时必须**逐字复制目标文件中的原文**（含全角标点、空格）。若 CJK 匹配失败，改用 Python marker+assert 脚本（先 `Read` 取原文，再 `sed`/Python 精确替换），不要反复重试 Edit。
- **不改 `results.json` schema、不改 preflight 准入、不改 `lib/`/`prompts/`/`rules/`/`schemas/{docExtract,limsData,report,gate-failure}-schema.md`。**
- 不引入 Langfuse 引用/gate；`results.json` 不新增任何字段。
- 提交信息用 conventional commits，前缀 `refactor(scout-audit):` 或 `docs(scout-audit):`（匹配仓库既有惯例 `db244db0`）。仅在用户授权提交时执行 commit 步骤。
- 命令预期：`npx vitest run` → 19/19 全绿；`npx tsx scripts/run-minimal-regression.ts` → exit 0。

---

## File Structure

| 文件 | 操作 | 责任 |
|------|------|------|
| `scripts/run-minimal-regression.ts` | 修改 | 回归驱动脚本；移除 session-log 生成/校验/常量/死代码 |
| `scripts/generate-session-log.ts` | 删除 | 仅服务 session-log，无其他 importer |
| `scripts/validate-session-log.ts` | 删除 | 仅被 run-minimal-regression.ts + 被删的 generate-session-log.ts 引用 |
| `templates/session-log-schema.md` | 删除 | session-log 行结构权威定义 |
| `contracts/delivery.md` | 修改 | 交付合同：固定顺序/命名/门/硬停/降级/引用 |
| `SKILL.md` | 修改 | 入口级合同：Do Not Use / Admission / Hard Stops / Authority Map |
| `scripts/README.md` | 修改 | 脚本 CLI 接口参考 |
| `docs/sync-matrix.md` | 修改 | 契约同步矩阵 |
| `docs/operator-guardrails.md` | 修改 | 执行者治理自检 |
| `templates/phase-outputs.md` | 修改 | 进度叙述模板（仅 Phase 7 两块） |
| `docs/reports/regression-outputs/outputs/*-session-log.jsonl` | 删除 | 孤儿产物（4 个 git 跟踪） |
| `skills/custom/scout-audit/outputs/*-session-log.jsonl` | 删除 | 孤儿产物（未跟踪） |

**任务依赖顺序（关键）：** Task 1（改回归脚本，解除对被删脚本的引用）必须**先于** Task 2（删脚本），否则中间态回归会引用已删文件而失败。

---

### Task 1: 从 run-minimal-regression.ts 移除 session-log 生成

**Files:**
- Modify: `scripts/run-minimal-regression.ts`

**Interfaces:**
- Consumes: 无（自包含脚本）
- Produces: 回归脚本不再产出/校验 session-log；仍产出 `{reportNo}-results.json` + `{reportNo}-audit-report.md`，exit 0

- [ ] **Step 1: 基线确认（编辑前）**

Run:
```bash
cd /home/jesse/project/deer-flow/skills/custom/scout-audit
npx vitest run && npx tsx scripts/run-minimal-regression.ts --output-dir /tmp/scout-baseline-before
```
Expected: vitest 19/19 PASS；regression exit 0；`/tmp/scout-baseline-before/` 产出 3 件（含 `*-session-log.jsonl`）。记录此为"改前"基线。

- [ ] **Step 2: 移除 session-log 脚本常量与 relativeOutputFiles 函数**

删除这一行（约 L37）：
```ts
const VALIDATE_SESSION_LOG_SCRIPT = resolve(SCRIPT_DIR, "validate-session-log.ts")
```

删除整个 `relativeOutputFiles` 函数（约 L246-252）。它的唯一调用方在 session-log 构造块内，Step 3 会一并删除该调用，故本函数整体失效、必须移除（否则留下死代码）。

- [ ] **Step 3: 移除 main() 内 session-log 构造与调用**

在 per-scenario 循环内（约 L405-562），逐一删除。**保留**：`resultsPath`/`reportPath`/`resultsJson` 构造、`writeFileSync(resultsPath, ...)`（约 L432）、`runCliScript(GENERATE_REPORT_SCRIPT, [resultsPath, reportPath])`（约 L433）。

1. 删除 `const sessionLogPath = resolve(outputDir, \`${reportNo}-session-log.jsonl\`)`（约 L407）。
2. 删除 `const outputFiles = relativeOutputFiles(reportNo)`（约 L408）及其解构 `const [relativeResultsPath, relativeReportPath, relativeSessionLogPath] = outputFiles`（约 L409）。二者的唯一消费方都在 session-log 构造块内，随之失效，整行删除（不要保留截短的解构，那会留下未使用变量）。
3. 删除整段 `const phaseBaseMs = Date.now()` 起到 `runCliScript(VALIDATE_SESSION_LOG_SCRIPT, [sessionLogPath, resultsPath])` 止（约 L435-552），即 `phaseBaseMs`、`phase4Summary`、`sessionRows` 数组、`writeFileSync(sessionLogPath, ...)`、`runCliScript(VALIDATE_SESSION_LOG_SCRIPT, ...)` 全部移除。

- [ ] **Step 4: 移除 printHelp 与 manifest 中的 session-log 项**

printHelp（约 L54-70）的 generates 列表删除这一行：
```
"- {reportNo}-session-log.jsonl",
```

manifest push（约 L554-562）删除 `sessionLogPath,` 这一行。

- [ ] **Step 5: 移除因 sessionRows 删除而失效的死代码**

删除以下已无调用方的 helper（删除前各 grep 确认仅 sessionRows 引用）：
- `countLimsSources`（约 L235-240）
- `phaseTimestamp`（约 L242-244）
- `inferFileType`（约 L254-258）

确认命令（应均只剩定义处或无输出）：
```bash
grep -n "countLimsSources\|phaseTimestamp\|inferFileType" scripts/run-minimal-regression.ts
```
Expected: 删除后无残留（或仅注释）。

- [ ] **Step 6: 运行回归验证**

Run:
```bash
npx tsx scripts/run-minimal-regression.ts --output-dir /tmp/scout-after-task1
```
Expected: exit 0；`/tmp/scout-after-task1/` **只**产出 `*-results.json` 与 `*-audit-report.md`，**无** `*-session-log.jsonl`。

验证无 session-log 文件：
```bash
ls /tmp/scout-after-task1/ | grep session-log || echo "OK: no session-log files"
```
Expected: `OK: no session-log files`

- [ ] **Step 7: vitest 仍全绿**

Run:
```bash
npx vitest run
```
Expected: 19/19 PASS（lib 未改动）。

- [ ] **Step 8: 提交**

```bash
git add scripts/run-minimal-regression.ts
git commit -m "refactor(scout-audit): drop session-log generation from regression script"
```

---

### Task 2: 删除 session-log 脚本与 schema 文档

**Files:**
- Delete: `scripts/generate-session-log.ts`
- Delete: `scripts/validate-session-log.ts`
- Delete: `templates/session-log-schema.md`

**Interfaces:**
- Consumes: Task 1 已解除 run-minimal-regression.ts 对这两个脚本的引用
- Produces: 三个文件消失；无残留 importer

- [ ] **Step 1: 删除前确认无活跃 .ts importer**

Run:
```bash
grep -rn "generate-session-log\|validate-session-log" scripts/ --include="*.ts"
```
Expected: 无输出（Task 1 已移除 run-minimal-regression.ts:37 的引用；generate-session-log.ts 自身的内部引用随文件删除消失）。

- [ ] **Step 2: 删除三个文件**

```bash
git rm scripts/generate-session-log.ts scripts/validate-session-log.ts templates/session-log-schema.md
```

- [ ] **Step 3: 回归仍 exit 0（证明无残留导入）**

Run:
```bash
npx tsx scripts/run-minimal-regression.ts --output-dir /tmp/scout-after-task2
```
Expected: exit 0；产出两件套，无报错。

- [ ] **Step 4: 提交**

```bash
git commit -m "refactor(scout-audit): delete session-log scripts and schema doc"
```

---

### Task 3: 重写 contracts/delivery.md 为两件套合同

**Files:**
- Modify: `contracts/delivery.md`（整文件替换）

**Interfaces:**
- Produces: 新固定顺序 3 步、两件套命名、收敛的硬停

- [ ] **Step 1: 用以下完整内容替换整个 `contracts/delivery.md`**

```markdown
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
```

- [ ] **Step 2: 验证文件内无 session-log 残留**

Run:
```bash
grep -ni "session-log\|session_log\|sessionLog\|三件套" contracts/delivery.md || echo "OK: clean"
```
Expected: `OK: clean`

- [ ] **Step 3: 提交**

```bash
git add contracts/delivery.md
git commit -m "docs(scout-audit): simplify delivery contract to two-piece set"
```

---

### Task 4: 清理 SKILL.md 中的 session-log 提及

**Files:**
- Modify: `SKILL.md`

**Interfaces:**
- Produces: 入口级合同无 session-log 提及

- [ ] **Step 1: 逐处编辑（先 Read 确认原文，逐字替换）**

1. `## Do Not Use` 下（约 L30）：
   - 旧：`- 输入其实是已生成的 `results.json`、审核报告或 `session-log.jsonl`。`
   - 新：`- 输入其实是已生成的 `results.json` 或审核报告。`

2. `## Admission Rules` 第一条（约 L36）：
   - 旧：`- Preflight gate 必须先于 Phase 0；gate 不计入正式 phase，也不写入 `session-log.jsonl`。`
   - 新：`- Preflight gate 必须先于 Phase 0；gate 不计入正式 phase。`

3. `## Hard Stops`（约 L88）：
   - 旧：`- 交付顺序固定为 `results.json` -> 审核报告 -> `session-log` 校验。`
   - 新：`- 交付顺序固定为 `results.json` -> 审核报告。`

4. `## Authority Map` 的 Templates 行（约 L103）：
   - 旧：`- Templates: `templates/phase-outputs.md`, `templates/session-log-schema.md`, `templates/report-template.md``
   - 新：`- Templates: `templates/phase-outputs.md`, `templates/report-template.md``

- [ ] **Step 2: grep 确认无遗漏**

Run:
```bash
grep -ni "session-log\|session_log\|sessionLog" SKILL.md || echo "OK: clean"
```
Expected: `OK: clean`（若仍有命中，按同一语义删除该处提及后重跑）

- [ ] **Step 3: 提交**

```bash
git add SKILL.md
git commit -m "docs(scout-audit): drop session-log references from entry contract"
```

---

### Task 5: 清理 scripts/README.md

**Files:**
- Modify: `scripts/README.md`

- [ ] **Step 1: 删除 Covered Commands 中两行（约 L9-10）**

删除：
```
- `generate-session-log.ts`
- `validate-session-log.ts`
```

- [ ] **Step 2: 删除两个脚本整节**

删除 `## `generate-session-log.ts`` 节（约 L56-76）与 `## `validate-session-log.ts`` 节（约 L78-99），含其用途/命令/Input/Output/Exit code/Common failures 全部子项。

- [ ] **Step 3: 修 Usage Rule**

`## Usage Rule`（约 L161-165）中删除这一行：
```
- 先写 `results.json`，再生成报告，最后校验 `session-log.jsonl`。
```
替换为：
```
- 先写并校验 `results.json`，再生成审核报告。
```

- [ ] **Step 4: grep 确认无残留**

Run:
```bash
grep -ni "session-log\|session_log\|sessionLog\|generate-session-log\|validate-session-log" scripts/README.md || echo "OK: clean"
```
Expected: `OK: clean`

- [ ] **Step 5: 提交**

```bash
git add scripts/README.md
git commit -m "docs(scout-audit): remove session-log script sections from README"
```

---

### Task 6: 清理 docs/sync-matrix.md

**Files:**
- Modify: `docs/sync-matrix.md`

- [ ] **Step 1: 清理 report-schema 行的同步伙伴（约 L14）**

该行 `Must stay synchronized with` 含 `scripts/validate-session-log.ts`，删除它。结果该单元格为：
```
`scripts/generate-report.ts`, `templates/report-template.md`, `scripts/run-minimal-regression.ts`
```

- [ ] **Step 2: 删除 session-log-schema 整行（约 L15）**

删除整行：
```
| `templates/session-log-schema.md` | `session-log.jsonl` 行结构、phase 顺序、Phase 7 字段 | `scripts/validate-session-log.ts`, `templates/phase-outputs.md` | 保证日志校验脚本与用户可见 phase 输出指向同一记录粒度 |
```

- [ ] **Step 3: 清理 scripts/README.md 行的同步伙伴（约 L18）**

该行 `Must stay synchronized with` 含 `scripts/generate-session-log.ts`, `scripts/validate-session-log.ts`，删除这两项。结果该单元格为：
```
`contracts/delivery.md`, `scripts/fetch-lims.ts`, `scripts/run-rules.ts`, `scripts/validate-results.ts`, `scripts/generate-report.ts`, `scripts/run-minimal-regression.ts`
```

- [ ] **Step 4: grep 确认无残留**

Run:
```bash
grep -ni "session-log\|session_log\|sessionLog" docs/sync-matrix.md || echo "OK: clean"
```
Expected: `OK: clean`

- [ ] **Step 5: 提交**

```bash
git add docs/sync-matrix.md
git commit -m "docs(scout-audit): drop session-log rows from sync matrix"
```

---

### Task 7: 清理 docs/operator-guardrails.md

**Files:**
- Modify: `docs/operator-guardrails.md`

- [ ] **Step 1: 删除 Rationalization Guardrails 中 session-log 行（约 L16）**

删除：
```
| "session-log 骨架已经能过脚本，先交付再说" | 骨架只是补写起点；占位摘要、占位 response、`FILL_ME`、无效 duration 或默认零值一律不算真实审计证据。 |
```

- [ ] **Step 2: 删除 Red Flags 中所有 session-log 条目（约 L35-36, L40）**

逐条删除（grep 定位后整行删）：
```
- `session-log.jsonl` 未经 `validate-session-log.ts` 校验就宣称完成
- `session-log.jsonl` 中仍保留 `Generated from results.json`、`replace with ...`、`FILL_ME`、`durationMs <= 0` 或明显骨架默认值
- `session-log.jsonl` 未按 phase 完成顺序追加写入，而是在最后批量补写所有记录
```

- [ ] **Step 3: grep 确认无残留**

Run:
```bash
grep -ni "session-log\|session_log\|sessionLog\|骨架" docs/operator-guardrails.md || echo "OK: clean"
```
Expected: `OK: clean`（注：`骨架` 仅出现在被删条目中；若别处有合法 `骨架` 用法则保留，仅删 session-log 相关行）

- [ ] **Step 4: 提交**

```bash
git add docs/operator-guardrails.md
git commit -m "docs(scout-audit): remove session-log guardrails and red flags"
```

---

### Task 8: 清理 templates/phase-outputs.md 的 Phase 7

**Files:**
- Modify: `templates/phase-outputs.md`

- [ ] **Step 1: 编辑 Phase 7（single，约 L117-125）**

把该代码块：
```
审核结果已保存至 outputs/{reportNo}-results.json
审核报告已生成并保存至 outputs/{reportNo}-audit-report.md
会话日志已保存至 outputs/{reportNo}-session-log.jsonl
报告脚本: exitCode={reportExitCode}, warnings={reportWarningCount}
日志校验: result={validationResult}, exitCode={validationExitCode}
```
替换为：
```
审核结果已保存至 outputs/{reportNo}-results.json
审核报告已生成并保存至 outputs/{reportNo}-audit-report.md
```

- [ ] **Step 2: 编辑 Phase 7（joint，约 L248-256）**

把该代码块：
```
联合审核结果已保存至 outputs/{batchNo}-joint-results.json
联合审核报告已保存至 outputs/{batchNo}-joint-audit-report.md
联合会话日志已保存至 outputs/{batchNo}-joint-session-log.jsonl
报告脚本: exitCode={reportExitCode}, warnings={reportWarningCount}
日志校验: result={validationResult}, exitCode={validationExitCode}
```
替换为：
```
联合审核结果已保存至 outputs/{batchNo}-joint-results.json
联合审核报告已保存至 outputs/{batchNo}-joint-audit-report.md
```

- [ ] **Step 3: grep 确认仅历史性命中已清**

Run:
```bash
grep -ni "session-log\|session_log\|sessionLog\|日志校验\|会话日志" templates/phase-outputs.md || echo "OK: clean"
```
Expected: `OK: clean`

- [ ] **Step 4: 提交**

```bash
git add templates/phase-outputs.md
git commit -m "docs(scout-audit): drop session-log lines from phase-outputs Phase 7"
```

---

### Task 9: 清理孤儿 session-log 产物

**Files:**
- Delete: `docs/reports/regression-outputs/outputs/*-session-log.jsonl`
- Delete: `skills/custom/scout-audit/outputs/*-session-log.jsonl`

- [ ] **Step 1: 重跑回归刷新输出目录**

Run:
```bash
npx tsx scripts/run-minimal-regression.ts
```
Expected: exit 0；默认输出到 `docs/reports/regression-outputs/outputs/`，只产 results.json + audit-report.md。

- [ ] **Step 2: 删除被 git 跟踪的旧 session-log 文件**

```bash
cd /home/jesse/project/deer-flow
git ls-files 'docs/reports/regression-outputs/outputs/*-session-log.jsonl' | xargs -r git rm
```
Expected: 移除 4 个 `*-session-log.jsonl`（A408H0001 / detection-limit-coa / eln-with-complete-workflow 等）。

- [ ] **Step 3: 删除未跟踪的 outputs 下 session-log 文件**

```bash
find skills/custom/scout-audit/outputs -name '*-session-log.jsonl' -delete 2>/dev/null || true
```

- [ ] **Step 4: 确认仓库内无 session-log 产物残留**

Run:
```bash
find . -name '*-session-log.jsonl' -not -path '*/node_modules/*' 2>/dev/null | grep -v '/.git/' || echo "OK: no session-log artifacts"
```
Expected: `OK: no session-log artifacts`

- [ ] **Step 5: 提交**

```bash
git add -A docs/reports/regression-outputs/outputs skills/custom/scout-audit/outputs
git commit -m "chore(scout-audit): remove orphaned session-log regression artifacts"
```

---

### Task 10: 最终验收（对照 spec §11）

**Files:** 无修改（纯验证）

- [ ] **Step 1: 活跃合同文件无 session-log 残留**

Run（从技能目录）:
```bash
grep -rni "session-log\|sessionLog" SKILL.md contracts/ scripts/ templates/ docs/sync-matrix.md docs/operator-guardrails.md || echo "OK: clean"
```
Expected: `OK: clean`
- **豁免（历史快照，记录变更前结构，不应改动）：** `docs/2026-06-11-skill-structure-audit.md`、`docs/2026-06-11-boundary-refactor-checklist.md` 不在 grep 范围内；若单独检查它们命中属预期。

- [ ] **Step 2: 被删文件确实不存在**

Run:
```bash
ls scripts/generate-session-log.ts scripts/validate-session-log.ts templates/session-log-schema.md 2>&1 | grep -q "No such" && echo "OK: deleted" || echo "FAIL: still present"
```
Expected: `OK: deleted`

- [ ] **Step 3: vitest 全绿**

Run:
```bash
npx vitest run
```
Expected: 19/19 PASS

- [ ] **Step 4: 回归 exit 0 且两件套**

Run:
```bash
npx tsx scripts/run-minimal-regression.ts --output-dir /tmp/scout-final && ls /tmp/scout-final | sort
```
Expected: exit 0；输出仅 `*-audit-report.md` 与 `*-results.json`，无 `*-session-log.jsonl`。

- [ ] **Step 5: 校验结果一致性未被破坏（corrections↔ruleResults）**

Run（用任一回归产物）:
```bash
npx tsx scripts/validate-results.ts /tmp/scout-final/A408H0001-results.json && echo "OK: results valid"
```
Expected: 校验通过，`OK: results valid`（证明删除 session-log 未留下一致性校验缺口）。

- [ ] **Step 6: 验收总结**

确认 spec §11 全部 checkbox 满足。若全部通过，本次实现完成；无需额外提交（本任务无文件变更）。
