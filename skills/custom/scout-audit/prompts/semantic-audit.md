# Phase 5 Prompt — AI 语义审核

## 输入
- docExtract (DocExtract JSON)
- limsData (LIMS 数据)
- docType (ELN 或 COA)
- deterministicResults (确定性规则执行结果)
- markdownText (Phase 0 转换后的原始 Markdown 全文，供 L002/L003/C001/C002 使用)

## 需要执行的规则

根据 docType 筛选适用规则:

### ELN 适用的 AI 规则
- E001: 人员资质校验
- E002: 仪器编号匹配
- S002: 电子签名合规
- S003: 禁止代签
- D001: 修改规范
- D002: 原始数据可追溯
- D003: 无缺失页面
- L002: 跨页数据一致
- L003: 计算公式正确
- C002: 无歧义表述
- N002: 结果在可选结果内

### COA 适用的 AI 规则
- S002: 电子签名合规
- S003: 禁止代签
- D002: 原始数据可追溯
- D003: 无缺失页面
- L002: 跨页数据一致
- C001: 结论规范
- C002: 无歧义表述
- N002: 结果在可选结果内

## Prompt

```
你是实验室合规审核AI。根据以下数据执行语义类审核规则。

## 输入数据

### docExtract (PDF提取数据):
{docExtract_json}

### limsData (LIMS外部数据):
{limsData_json}

### markdownText (Phase 0 原始 Markdown，L002/L003/C001/C002 使用):
{markdownText}

### 文档类型: {docType}

## 需要执行的规则

{applicable_rules}

## 执行要求

对每条规则:
1. 检查所有相关数据
2. 判定 PASS / FAIL
3. 如果 FAIL，说明具体问题和证据
4. 给出整改建议

### 各规则判定指引

E001 人员资质:
- 检查 docExtract.personnel 中每个人在 limsData.qualifications 中是否存在
- 检查 status === "active"
- 检查该人员 authorizedTests 包含其执行的检测项目

E002 仪器编号匹配:
- 检查 docExtract.instruments 中仪器在 limsData.instrument.useLog 中
- useLog.operator 与 docExtract.personnel 中的检测人一致

S002 电子签名合规:
- 仅检查 `limsData.auditTrail` 中 `action=sign` 的记录
- 每条 sign 记录必须同时包含 `user`、`account`、`timestamp`
- 如 `limsData.workflow` 存在，`status=completed` 的步骤数不能大于 sign 记录数
- 不要因为账号名像通用账号就直接判 FAIL；没有黑名单规则

S003 禁止代签:
- 仅检查 `limsData.auditTrail` 中 `action=sign` 的记录
- 同一批次内，每个 `account` 只能稳定对应一个 `user`
- 同一批次内，每个 `user` 也只能稳定对应一个 `account`
- 不要求 `user === account`；只要求映射一一稳定

D001 修改规范:
- limsData.auditTrail 中 action=modify 的记录
- 必须有 reason 字段
- 修改人签名+日期齐全

D002 原始数据可追溯:
- limsData.originalDataIndex 中 instrumentLogs/chromatograms/sequences 非空
- 与 docExtract 中的检测项目和仪器对应

D003 无缺失页面:
- limsData.originalDataIndex.foundPages === expectedPages
- 如果 docExtract.totalPages 存在，也作为参考

L002 跨页数据一致:
- 检查 markdownText 中首页和续页的样品信息（批号、品名、规格）是否一致
- 注意表格可能跨页，页眉页脚中的信息应一致

L003 计算公式正确:
- 从 markdownText 中识别计算过程
- 验证含量计算: (实测峰面积/标准峰面积) × 标准浓度 × 稀释倍数
- 验证回收率: (加标测定值 - 本底值) / 加标量 × 100%
- 验证折算公式是否符合标准

C001 结论规范:
- 从 markdownText 中定位结论段落
- 可接受的结论格式:
  - "符合[标准名称]标准规定"
  - "按…[标准名称]…进行检测，结果符合规定" (标准引用+合规声明)
- 不可接受: 仅写"合格"而无标准引用
- 禁止 "基本符合"、"大概符合" 等模糊表述

C002 无歧义表述:
- 搜索 markdownText 中的模糊词: "大概"、"基本"、"差不多"、"可能"、"约"、"左右"
- 排除标准规定中的合理用词（如 "约100mL"）

N002 结果在可选结果内:
- 对 testType=qualitative 的检测项
- 检查 result 是否在 limsData.testItemOptions.allowedResults 中
- 允许部分匹配（如 "白色粉末" 匹配 "白色至类白色粉末"）

## 输出格式

对每条规则输出:
```json
{
  "ruleId": "E001",
  "ruleName": "人员资质校验",
  "status": "PASS|FAIL",
  "severity": "severe|warning|info",
  "details": "具体描述",
  "evidence": {
    "expected": "期望值或期望状态",
    "actual": "实际值或实际状态",
    "location": "字段路径, 如 testItems[0].result 或 markdownText 第3段"
  },
  "remediation": "整改建议"
}
```

**Evidence 填写要求:**
- PASS: `evidence` 可省略或为空对象 `{}`
- FAIL: `evidence` MUST 包含 `expected` 和 `actual`；若能定位到字段路径或 Markdown 段落，建议填写 `location`
- SKIP: `evidence` 为空对象 `{}`
- `location` 是推荐字段，不要臆造；有明确定位时才填写

仅输出 JSON 数组，不要输出其他内容。
```

## 注意事项
- 如果 LIMS 数据缺失导致无法判断，标记 status="SKIP"，details 说明原因
- severity 按规则定义表确定，不要自行判断
- N002 的部分匹配需要 AI 判断语义相似度
- L003 需要识别公式类型并验证计算过程
