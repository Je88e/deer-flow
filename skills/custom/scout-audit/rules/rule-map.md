# Rule Map — 32条规则完整映射

## 规则执行分类

> **等级映射:** 严重 = `severe`, 中等 = `warning`, 一般 = `info` (与 report-schema.md 对应)

### 确定性规则 (20条) — scout-rule-engine MCP 执行

| RuleID | 规则名称 | 输入 | 判定逻辑 | 适用 | 等级 (severity) |
|--------|---------|------|---------|------|------|
| B001 | 样品批号准确 | docExtract.batchNo | 非空 + 正则 `[A-Za-z0-9]+` | ELN/COA | 严重 |
| B002 | 产品信息完整 | docExtract.sampleInfo + limsData.requestForm | 逐一比对必填字段 | ELN/COA | 严重 |
| B003 | 检测项目完整 | docExtract.testItems[].itemName vs limsData.requestForm.requiredTestItems | 子集匹配，无漏项 | ELN/COA | 严重 |
| B004 | 日期逻辑正确 | docExtract.dates | testDate ≤ reviewDate ≤ approveDate ≤ reportDate | ELN/COA | 严重 |
| B005 | 报告编号唯一 | limsData.reportUnique | unique === true + 格式正则 | COA | 严重 |
| N001 | 结果在标准限度内 | docExtract.testItems[quantitative] + limsData.requestForm | resultNumeric op specLower/specUpper | ELN/COA | 严重 |
| R001 | 有效数字位数正确 | docExtract.testItems + limsData.requestForm | 对比 significantDigits | ELN/COA | 中等 |
| R002 | 修约方式正确 | docExtract.testItems | 验证 resultNumeric 符合四舍六入五成双 | ELN/COA | 中等 |
| R003 | 单位统一规范 | docExtract.testItems.unit vs limsData.requestForm.unit | 字符串严格匹配 | ELN/COA | 中等 |
| R004 | 数值无多余小数 | docExtract.testItems | 小数位数 ≤ significantDigits-整数位 | ELN/COA | 一般 |
| P001 | 平行样相对偏差合格 | docExtract.testItems[parallelGroup] | RSD ≤ rsdLimit (默认: 含量2.0%, 水分0.5%) | ELN | 严重 |
| P002 | 重复性RSD合格 | docExtract.testItems[parallelGroup, n≥6] | RSD ≤ 2.0% | ELN | 严重 |
| P003 | 加标回收率合格 | docExtract.testItems[recovery] | 80% ≤ recovery ≤ 120% | ELN | 严重 |
| E003 | 仪器在校准期内 | limsData.instrument | calibrationStatus === "valid" | ELN | 严重 |
| E004 | 环境条件合格 | docExtract.environment + limsData.requestForm.envRequirements | temp/湿度在范围内 | ELN | 中等 |
| E005 | 系统适用性合格 | limsData.systemSuit | passed === true | ELN | 严重 |
| S001 | 签名完整 | docExtract.signatures | 按下文 S001 判定表检查角色、姓名/日期完整性与 image 豁免 | ELN/COA | 严重 |
| S004 | 审核流程完整 | limsData.workflow | 按下文 S004 判定表检查 workflow 完整度、一致性与签名有效性 | COA | 严重 |
| L001 | 结果与结论一致 | docExtract.testItems | 合格值→"符合", 不合格→"不符合" | ELN/COA | 严重 |
| L004 | 标准编号正确 | limsData.standard | isActive === true | ELN | 严重 |

### AI语义规则 (12条) — LLM 判断

| RuleID | 规则名称 | 输入 | 判断方式 | 适用 | 等级 (severity) |
|--------|---------|------|---------|------|------|
| N002 | 结果在可选结果内 | docExtract.testItems[qualitative] + limsData.testItemOptions | 比对 allowedResults | ELN/COA | 严重 |
| E001 | 人员资质校验 | docExtract.personnel + limsData.qualifications | 日期在授权期内 + 授权项目匹配 | ELN | 严重 |
| E002 | 仪器编号匹配 | docExtract.instruments + limsData.instrument.useLog | 使用记录中操作人与检测人一致 | ELN | 严重 |
| S002 | 电子签名合规 | limsData.auditTrail + limsData.workflow | sign 留痕完整，且 completed workflow 步骤均有对应 sign 记录 | ELN/COA | 严重 |
| S003 | 禁止代签 | limsData.auditTrail | sign 记录中的 user/account 映射在同批次内一一稳定 | ELN/COA | 严重 |
| D001 | 修改规范 | docExtract.modifications + limsData.auditTrail | 修改人签名+日期+原因齐全 | ELN | 严重 |
| D002 | 原始数据可追溯 | limsData.originalDataIndex | 数据与仪器日志/图谱/序列对应 | ELN/COA | 严重 |
| D003 | 无缺失页面 | docExtract.totalPages + limsData.originalDataIndex | foundPages === expectedPages | ELN/COA | 严重 |
| L002 | 跨页数据一致 | Phase 0 Markdown 原文 | 首页/续页样品信息一致 | ELN/COA | 中等 |
| L003 | 计算公式正确 | Phase 0 Markdown 原文 + docExtract.testItems | 含量/回收率/折算公式验证 | ELN | 严重 |
| C001 | 结论规范 | Phase 0 Markdown 原文 | 结论格式: "符合XXX标准规定" | COA | 中等 |
| C002 | 无歧义表述 | Phase 0 Markdown 原文 | 禁止"大概""基本合格""差不多" | ELN/COA | 一般 |

### 仅适用 ELN 的规则

E001, E002, E003, E004, E005, P001-P003, D001, L003

### 仅适用 COA 的规则

B005, S004, C001

## 规则引擎核心算法

### 四舍六入五成双 (Round Half To Even)

```
function roundHalfToEven(value, digits):
  d = 10^digits
  scaled = value * d
  floored = floor(scaled)
  decimal = scaled - floored

  if decimal < 0.5: return floored / d
  if decimal > 0.5: return (floored + 1) / d
  // decimal == 0.5: 取偶数
  return (floored % 2 == 0 ? floored : floored + 1) / d
```

### RSD (相对标准偏差)

```
function rsd(values):
  mean = avg(values)
  std = sqrt(sum((v - mean)^2) / (n - 1))
  return (std / mean) * 100
```

### 数值范围判定 (N001)

```
function checkRange(result, specLower, specUpper, operator):
  switch operator:
    case "≥/≤": return result >= specLower && result <= specUpper
    case ">/<": return result > specLower && result < specUpper
    case "≥":   return result >= specLower
    case "≤":   return result <= specUpper
    case ">":   return result > specLower
    case "<":   return result < specUpper
```

### S001 签名完整性判定

| 条件 | 结果 | 说明 |
|------|------|------|
| 缺少 `tester` / `reviewer` / `approver` 任一角色 | FAIL | `evidence.actual` 写缺失角色列表 |
| 角色存在，但 `name` 或 `date` 缺失，且 `signatureMethod !== "image"` | FAIL | 空字符串视为缺失；`evidence.actual` 写空签名角色列表 |
| 角色存在，`signatureMethod === "image"`，且存在图片/印章签名证据 | PASS 或 PASS with note | 允许 OCR 未提取到姓名，但必须注明是 image 签名豁免 |
| 三角色均存在，且非 image 签名的 `name/date` 完整 | PASS | 视为签名完整 |

判定约束:
- `signatureMethod: "image"` 仅表示“看见签名图像但 OCR 未完整提取”，不是“字段为空时的默认兜底值”
- `name/date` 为空字符串、全空白字符串、`null` 都按缺失处理
- `release` 可提取但不参与 `S001` 必要角色判定

### S004 workflow 判定

| 条件 | 结果 | 说明 |
|------|------|------|
| `limsData.workflow` 缺失或为 `null` | SKIP | `S004` 只认 `limsData.workflow` |
| workflow 存在但缺少 required steps (`tester/reviewer/approver`) | FAIL | 缺任一步骤即失败 |
| step 存在但 `status !== "completed"` | FAIL | `pending` / `skipped` / 其他非 completed 均失败 |
| `currentStep`、步骤完成度、顺序任一不一致 | FAIL | 包括后续步骤完成但前序未完成等冲突 |
| 任一步骤 `signatureValid === false` | FAIL | 签名无效即失败 |
| 全部 required steps 存在、均 `completed`、顺序一致、签名有效 | PASS | 视为流程完整 |

判定约束:
- `S004` 仅使用 `limsData.workflow`，不读取 `requestForm.approvalWorkflow`
- required steps 固定为 `tester -> reviewer -> approver`
- evidence 应优先写出缺失步骤、未完成步骤或不一致字段

### S002 电子签名合规定

| 条件 | 结果 | 说明 |
|------|------|------|
| `auditTrail` 中无 `action=sign` 记录 | FAIL | 无法证明存在电子签名留痕 |
| 任一 sign 记录缺少 `user` / `account` / `timestamp` | FAIL | 字段缺失即视为留痕不完整 |
| `workflow` 存在，且 `completed` 步骤数 > sign 记录数 | FAIL | 已完成步骤必须有对应 sign 留痕 |
| sign 记录存在且字段完整，且 sign 数量不少于 completed workflow 步骤数 | PASS | 视为满足最小电子签名留痕要求 |

判定约束:
- `S002` 不使用账号黑名单；不要因为账号名像通用账号就直接 FAIL
- `workflow` 仅用于 completed 步骤数交叉校验，不参与账号归属判断
- evidence 应优先写 sign 缺失字段，或 `completedSteps/signRecords` 的数量差异

### S003 禁止代签判定

| 条件 | 结果 | 说明 |
|------|------|------|
| `auditTrail` 中无 `action=sign` 记录 | FAIL | 无法建立 user/account 映射 |
| 任一 sign 记录缺少 `user` 或 `account` | FAIL | 缺字段时无法验证是否代签 |
| 同一 `account` 对应多个 `user` | FAIL | 共享账号或映射漂移 |
| 同一 `user` 对应多个 `account` | FAIL | 单人多账号签署，映射不稳定 |
| 所有 sign 记录均保持 user/account 一一稳定 | PASS | 视为未发现代签证据 |

判定约束:
- `S003` 不要求 `user === account`
- 仅检查同一批次内 sign 记录的映射稳定性
- evidence 应优先写出冲突映射，如 `shared -> 王斌, 韩梅`

### 有效数字位数检测 (R001)

```
function countSignificantDigits(numericStr):
  // "98.52" → 4位
  // "95" → 2位
  // "0.12" → 2位
  // "3.0" → 2位
  移除前导零和小数点, 计算剩余数字位数
  特殊: 末尾零算有效数字 (如 "3.0" → 2位)
```

## LIMS 依赖分类

MCP 不可用时，以下分类决定哪些规则可以仅凭 docExtract 数据执行。

### 可独立评估 (无需 limsData)

| RuleID | 评估方式 |
|--------|---------|
| B001 | batchNo 非空 + 正则 |
| B004 | docExtract.dates 日期比较 |
| N001 | docExtract.testItems 中 result vs spec (可从 spec 格式推断 significantDigits: "200.0" → 4 位) |
| R001 | 从 spec 格式推断 significantDigits |
| R002 | docExtract.testItems 修约检查 (使用 significantDigits + resultNumeric) |
| R003 | docExtract.testItems 单位字符串比较 |
| R004 | docExtract.testItems 小数位检查 |
| S001 | 签名完整性检查 (缺角色/空签名=FAIL, image 签名走豁免) |
| D003 | docExtract.totalPages 页数检查 |
| L001 | docExtract.testItems 结果与结论一致性 |
| L002 | Phase 0 Markdown 原文 跨页数据一致性 |
| C001 | Phase 0 Markdown 原文 结论格式检查 |
| C002 | Phase 0 Markdown 原文 模糊词扫描 |

### 必须 SKIP (需要 limsData)

| RuleID | 依赖数据 |
|--------|---------|
| B002 | limsData.requestForm |
| B003 | limsData.requestForm.requiredTestItems |
| B005 | limsData.reportUnique |
| N002 | limsData.testItemOptions |
| S002 | limsData.auditTrail |
| S003 | limsData.auditTrail |
| S004 | limsData.workflow |
| D002 | limsData.originalDataIndex |
| L004 | limsData.standard |
| E001-E005 | limsData (qualifications/instrument/systemSuit/env) |
| P001-P003 | 规则本身仅需 docExtract，但 rsdLimit 参考值来自 limsData |
| D001 | limsData.auditTrail |
| L003 | 仅需 Phase 0 Markdown 原文 + docExtract.testItems (可独立评估，但精确公式参数需 limsData) |

### 检测限特殊处理

结果表达为 `<X` (如 `<0.025%`) 时:
- **docExtract:** 设置 `resultNumeric: X` (限值) 并标记 `isDetectionLimit: true`
- **N001:** `isDetectionLimit: true` 且规格允许 `≤X` / `<X` → 自动 PASS
- **R001-R004:** `isDetectionLimit: true` 时豁免有效数字/修约/小数位检查，不能再按普通数值报错
- **实现要求:** 以上行为必须由规则引擎硬编码，不允许仅靠 Prompt/Phase 5 临场修正
