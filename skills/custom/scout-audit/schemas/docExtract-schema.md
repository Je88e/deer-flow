# DocExtract Schema — PDF 提取结构化数据

> 从 PDF (Markdown) 中提取的结构化 JSON。由 LLM Phase 2 生成。
> **同步警告:** 此接口与 `prompts/extract.md` 中的 JSON 模板对应。修改字段时必须同步更新两处。

## 结构定义

```typescript
interface DocExtract {
  docType: "COA" | "ELN"

  reportInfo: {
    reportNo: string           // 报告编号  → B005
    reportDate: string         // 报告日期  → B004
  }

  sampleInfo: {
    batchNo: string            // 样品批号  → B001
    productName: string        // 品名      → B002
    specification: string      // 规格      → B002
    batchSize: string          // 批量      → B002
    representativeQuantity?: string // 代表量 → COA信息保留，避免与 batchSize 混淆
    manufacturer?: string      // 生产单位  → B002 (COA可选)
  }

  dates: {
    testDate: string           // 检测日期  → B004
    reviewDate: string         // 复核日期  → B004
    approveDate: string        // 审核日期  → B004
    reportDate: string         // 报告日期  → B004
  }

  signatures: [{               // 签名信息  → S001, S003
    role: "tester" | "reviewer" | "approver" | "release"
    name?: string
    date?: string
    signatureMethod?: "image"   // 仅在确认存在手写/印章图片签名证据时使用
  }]

  testItems: [{
    itemName: string           // 检测项目名 → B003, N001
    testType: "quantitative" | "qualitative" | "descriptive"
    specification: string      // 标准规定文本
    specLower?: number         // 标准下限   → N001
    specUpper?: number         // 标准上限   → N001
    specOperator?: string      // "≥"/"≤"/">"/"<" → N001
    result: string             // 实测值
    resultNumeric?: number     // 实测值(数值) → N001, R001-R004
    isDetectionLimit?: boolean // 检测限结果 (如"<0.025%") → N001自动PASS, R001-R004豁免
    unit?: string              // 单位       → R003
    significantDigits?: number // 有效数字位数 → R001
    conclusion: string         // 单项结论   → L001
    isParallel?: boolean       // 是否平行样
    parallelGroup?: string     // 平行样组标识 → P001
    sampleLabel?: string       // 样品标签(平行样1/2)
  }]

  instruments: [{              // 仪器信息   → E002, E003
    instrumentNo: string
    name?: string
    calibrationExpiry?: string
  }]

  environment?: {              // 环境条件   → E004
    temperature: number
    humidity: number
  }

  personnel: [{                // 人员信息   → E001
    name: string
    role: string
  }]

  modifications?: [{           // 修改记录   → D001
    modifier: string
    date: string
    reason?: string
    field?: string
  }]

  standardRef?: string         // 执行标准   → L004
  totalPages?: number          // 总页数     → D003
}
```

## 字段→规则映射

| 字段路径 | 对应规则 | 提取优先级 |
|---------|---------|-----------|
| `sampleInfo.batchNo` | B001 | 必须 |
| `sampleInfo.*` | B002 | 必须 |
| `sampleInfo.representativeQuantity` | COA 信息保留 | COA建议 |
| `testItems[*].itemName` | B003 | 必须 |
| `dates.*` | B004 | 必须 |
| `reportInfo.reportNo` | B005 | COA必须 |
| `testItems[*].resultNumeric` + `specLower/specUpper` | N001 | 定量必须 |
| `testItems[*].result` + `testType:"qualitative"` | N002 | 定性必须 |
| `testItems[*].significantDigits` | R001 | 定量必须 |
| `testItems[*].resultNumeric` | R002 | 定量必须 |
| `testItems[*].unit` | R003 | 定量必须 |
| `testItems[parallelGroup]` | P001-P003 | 平行样必须 |
| `instruments[*]` | E002, E003 | ELN必须 |
| `environment` | E004 | ELN必须 |
| `personnel[*]` | E001 | ELN必须 |
| `signatures[*]` | S001, S003 | 必须 |
| `modifications[*]` | D001 | ELN必须 |
| `standardRef` | L004 | 必须 |

## 提取注意事项

1. **数值提取**: `"98.52%"` → `resultNumeric: 98.52, unit: "%"`
2. **范围提取**: `"90.0%~110.0%"` → `specLower: 90.0, specUpper: 110.0, specOperator: "≥/≤"`
3. **上限提取**: `"≤5.0%"` → `specUpper: 5.0, specOperator: "≤"`
4. **检测限**: `"<0.025%"` → `resultNumeric: 0.025, unit: "%", isDetectionLimit: true` — 限值作为resultNumeric，标记isDetectionLimit
5. **签名图像**: 只有确认存在手写/印章图片签名证据时，才允许 `signatureMethod: "image"`
6. **平行样**: 同一 itemName 出现多次时标记 isParallel=true, 用 parallelGroup 关联
7. **有效数字**: 从标准规定推断 (如"90.0%" → 1位小数 → significantDigits: 3)
8. **日期格式**: 统一转为 ISO 8601 (YYYY-MM-DD)
9. **缺失签名**: `name/date` 均为空或仅凭空白占位时，视为缺失签名，不得伪造为 `signatureMethod: "image"`
10. **代表量**: COA 中的"代表量"写入 `sampleInfo.representativeQuantity`，不要覆盖 `batchSize`
