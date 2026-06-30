# Gate Failure Schema

> **Ownership:** 本文件是 preflight gate 失败摘要的唯一结构定义；`SKILL.md` 与 `contracts/preflight.md` 只引用，不重复字段级 schema。

## JSON Shape

```json
{
  "failedStep": "",
  "reason": "",
  "recoverable": false,
  "suggestedAction": ""
}
```

## Field Definitions

| 字段 | 类型 | 含义 |
|------|------|------|
| `failedStep` | `string` | 失败发生的 gate 步骤，例如 `eligibility`、`capability`、`mode-detection`、`overwrite-confirmation` |
| `reason` | `string` | 失败原因，必须直接说明阻断条件 |
| `recoverable` | `boolean` | 是否可通过补充输入、恢复依赖或确认覆盖后继续 |
| `suggestedAction` | `string` | 建议的恢复动作，必须可执行 |

## Usage Notes

- 仅用于 gate 失败时的 stop-signal contract。
- 不替代 `results.json`、审核报告。
- 返回失败摘要时，必须明确说明未进入 Phase 0。
