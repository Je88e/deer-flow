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
    "reportNo": "报告编号",
    "reportDate": "YYYY-MM-DD"
  },
  "sampleInfo": {
    "batchNo": "样品批号",
    "productName": "品名",
    "specification": "规格",
    "batchSize": "批量",
    "representativeQuantity": "代表量 或 null",
    "manufacturer": "生产单位 或 null"
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
      "unit": "单位 或 null",
      "significantDigits": 有效数字位数 或 null,
      "conclusion": "单项结论",
      "isParallel": false,
      "parallelGroup": null,
      "sampleLabel": null
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
  "totalPages": 页数 或 null
}

提取规则:
1. 数值提取: "98.52%" → resultNumeric: 98.52, unit: "%"
2. 范围提取: "90.0%~110.0%" → specLower: 90.0, specUpper: 110.0, specOperator: "≥/≤"
3. 上限提取: "≤5.0%" → specUpper: 5.0, specOperator: "≤"
4. 检测限提取: "<0.025%" → resultNumeric: 0.025, unit: "%", isDetectionLimit: true（用限值作为resultNumeric）
5. 平行样: 同一检测项目出现多个结果时, 标记 isParallel: true, 用 parallelGroup 关联
6. 有效数字: 从标准规定推断 (如 "90.0%" → 1位小数 → significantDigits: 3)
7. 日期格式: 统一转为 YYYY-MM-DD
8. testType: 含数值→quantitative, 含选项列表→qualitative, 描述性→descriptive
9. 签名处理: 只有看到手写签名/印章/图片签名证据时, 才允许设置 signatureMethod: "image"
10. 如果姓名和日期都为空, 视为缺失签名, 不得输出 signatureMethod: "image"
11. 如果 OCR 未提取到姓名, 但能确认存在图片签名证据, 可输出 name: null 且 signatureMethod: "image"
12. COA 中的"代表量"填入 representativeQuantity, 不要挤占 batchSize

仅输出 JSON, 不要输出其他内容。

文档内容:
{markdown}
```

## 注意事项
- 数值中可能含千分位逗号，需移除
- 中文日期 "2026年4月15日" → "2026-04-15"
- 检测项目表格可能跨页，注意收集完整
- COA 通常不包含 instruments/environment，ELN 包含
- `batchSize` 表示批量，`representativeQuantity` 表示 COA 代表量，两者不能混用
