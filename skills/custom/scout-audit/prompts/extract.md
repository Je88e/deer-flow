# Phase 2 Prompt — 信息提取

> **同步警告:** 下方 JSON 结构与 `schemas/docExtract-schema.md` 的 TypeScript 接口对应。修改字段时必须同步更新两处。

## 输入
- Markdown 格式的 PDF 内容
- docType (ELN 或 COA)

## 输出
- DocExtract JSON（参见 schemas/docExtract-schema.md）

## Prompt

```
你是一个结构化数据提取器。从以下 Markdown 文档中提取信息，输出 JSON。

文档类型: {docType}

严格按照以下 JSON 结构输出。字段缺失时填 null。

{
  "docType": "{docType}",
  "reportInfo": {
    "reportNo": "报告编号 (COA取'报告单编号/Report No.', ELN取'ELN编号')",
    "reportDate": "YYYY-MM-DD"
  },
  "sampleInfo": {
    "batchNo": "样品批号",
    "resolvedBatchNo": null,
    "productName": "品名",
    "specification": "规格",
    "quantity": "样品量信息原文 (批量/检品数量/代表量, 取文档中出现的) 或 null",
    "manufacturer": "生产单位 或 null",
    "sampleIds": ["取样点编号1", "取样点编号2"] 或 null
  },
  "dates": {
    "testDate": "YYYY-MM-DD 或 null",
    "reviewDate": "YYYY-MM-DD 或 null",
    "approveDate": "YYYY-MM-DD 或 null",
    "reportDate": "YYYY-MM-DD"
  },
  "signatures": [
    {
      "role": "tester|reviewer|approver|release",
      "name": "姓名 或 null",
      "date": "YYYY-MM-DD 或 null",
      "signatureMethod": "image 或 null"
    }
  ],
  "testItems": [
    {
      "itemName": "检测项目名",
      "testType": "quantitative|qualitative|descriptive",
      "specification": "标准规定原文",
      "specLower": 下限数值 或 null,
      "specUpper": 上限数值 或 null,
      "specOperator": "≥|≤|>|<|≥/≤|>/< 或 null",
      "result": "实测值原文",
      "resultNumeric": 数值 或 null,
      "isDetectionLimit": false,
      "unit": "单位 或 null",
      "significantDigits": 有效数字位数 或 null,
      "conclusion": "单项结论",
      "isParallel": false,
      "parallelGroup": null,
      "sampleLabel": null,
      "sampleId": "取样点编号 或 null",
      "sampleSource": "样品来源 或 null",
      "rawObservation": "原始观察值 或 null"
    }
  ],
  "instruments": [
    { "instrumentNo": "仪器编号", "name": "仪器名称", "calibrationExpiry": "YYYY-MM-DD 或 null" }
  ],
  "environment": {
    "temperature": 温度数值 或 null,
    "humidity": 湿度数值 或 null
  },
  "personnel": [
    { "name": "姓名", "role": "角色" }
  ],
  "modifications": [],
  "standardRef": "执行标准 或 null",
  "totalPages": 页数 或 null,
  "elnScope": "single-batch" | "multi-batch" | null
}

提取规则:
1. 数值提取: "98.52%" → resultNumeric: 98.52, unit: "%"（数值可能含千分位逗号，需先移除）
2. 范围提取: "90.0%~110.0%" → specLower: 90.0, specUpper: 110.0, specOperator: "≥/≤"
3. 上限提取: "≤5.0%" → specUpper: 5.0, specOperator: "≤"
4. 检测限提取: "<0.025%" → resultNumeric: 0.025, unit: "%", isDetectionLimit: true（用限值作为resultNumeric）
5. 平行样: 同一检测项目出现多个结果时, 标记 isParallel: true, 用 parallelGroup 关联
6. 有效数字: 从标准规定推断 (如 "90.0%" → 1位小数 → significantDigits: 3)
7. 日期格式: 统一转为 YYYY-MM-DD（截断时间戳如 "2025/5/15 13:51:29" → "2025-05-15"，补零，替换 `/` 为 `-`，处理中文日期）
8. testType: 含数值→quantitative, 含选项列表→qualitative, 描述性→descriptive
9. 签名处理 — 三种情况:
   a) 姓名和日期都有文本值 → name=提取值, date=提取值, signatureMethod=null
   b) 日期有值但姓名为空 → 此模式高度暗示原始 PDF 中存在图片签名（手写/印章），
      因 PDF→Markdown 转换丢失了图像内容。输出: name=null, date=提取日期, signatureMethod="image"
   c) 姓名和日期均为空 → 视为缺失签名, name=null, date=null, signatureMethod=null
10. 签名推断依据: 在制药 GMP 文档中，如果审核/签发日期已填写但姓名空缺，
    几乎必然是图片签名（手写或印章）被 OCR/转换丢失。不应视为"缺失签名"。
11. 样品量统一: 文档中出现的"批量""检品数量""代表量"等样品量信息，统一填入 sampleInfo.quantity 字段原文，不需区分类型。
12. ELN 取样点提取: 若文档类型为 ELN 且检测结果表格含"取样点编号"列，提取所有取样点编号到 sampleInfo.sampleIds[]，每个 testItem 关联对应的 sampleId 和 sampleSource（样品来源列）
13. elnScope 检测（仅 ELN）:
    - ELN 含多个不同批次或无法判断批次的取样点 → elnScope: "multi-batch"
    - ELN 全部取样点明确属于同一批次 → elnScope: "single-batch"
    - ELN 不含批号字段无法判断批次归属 → 默认 "multi-batch"
14. ELN 双重结果列: 当 ELN 表格同时含原始观察值列（如"检验结果"中的"标准管深"）和报出结果列（如"报出结果"中的"符合规定"）时,
    testItems[].result 取报出结果/结论值, 原始观察值写入 rawObservation 可选字段。
    仅当确实存在双重列且值不同时才填写 rawObservation。
15. COA 表格单元格拆分: 某些 COA 的检测项目被 PDF 转换工具压缩到同一表格单元格中,
    多个检测项的"项目名+标准规定+结果"以 <br> 连续堆叠。必须识别此模式,
    按语义分组将每个检测项拆分为独立的 testItem 对象。典型模式:
    "应大于XXX<br>结果值<br>项目名<br>English Name" → itemName=项目名, specification=应大于XXX, result=结果值
    （检测项表格可能跨页，COA/ELN 均须先收集完整再拆分）
16. COA 重复列去重: PDF 转换后同一表格可能被重复渲染多次（如4列完全相同的数据），
    需识别并去重, 只保留一份检测项数据。
17. 编号区分:
    - COA: "记录编号/Record No." 是文档模板的固定编号(如 HLGF/4-ZK-300-L027-02),
      不随批次变化, 填入 reportInfo.recordNo；"报告单编号/Report No." 才是随批次唯一的报告编号 → 填入 reportNo
    - ELN: "ELN编号" 是独立的电子记录编号 → 填入 reportNo；"记录编号" 是纸质表单模板编号, 填入 recordNo
18. 中文操作符转换:
    - "应不高于 X" / "不得超过 X" / "不得过 X" → specUpper: X, specOperator: "≤"
    - "应大于 X" / "应高于 X" → specLower: X, specOperator: ">"
    - "应不低于 X" / "不得少于 X" → specLower: X, specOperator: "≥"
    - "X～Y" / "X~Y" / "X—Y" → specLower: X, specUpper: Y, specOperator: "≥/≤"
    - "shall be not more than" → specOperator: "≤"
    - "shall be more than" → specOperator: ">"
19. 单位提取: 从标准规定尾部也可提取单位(如 "200.0g/L" → unit: "g/L", specLower: 200.0),
    标准和结果的单位应保持一致。
20. HTML 表格: 源文档中可能包含 HTML <table> 标签而非 Markdown 表格语法。
    必须正确解析 HTML 表格结构, 特别注意 colspan/rowspan 属性对列合并的影响。
21. 定性检验特殊表达:
    - "标准管深" + "√" 表示"样品颜色不超过标准比色管", 是 PASS 的定性结果。
      设: testType="qualitative", result="符合规定", rawObservation="标准管深 √"
    - "标准管浅" + "×" 表示不合格
22. ELN 无批号场景: 注射用水等公用系统检验的 ELN 不包含"检品批号"字段,
    此时 batchNo 应设为 null（不要从取样点编号中猜测）, elnScope 应设为 "multi-batch"。
23. 样品量字段: "批量""检品数量/Number of Samples""代表量"等任何样品量信息，统一填入 sampleInfo.quantity。

仅输出 JSON, 不要输出其他内容。

文档内容:
{markdown}
```
