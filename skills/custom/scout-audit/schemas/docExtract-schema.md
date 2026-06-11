# DocExtract Schema — PDF 提取结构化数据

> 从 PDF (Markdown) 中提取的结构化 JSON。由 LLM Phase 2 生成。
> **同步警告:** 此接口与 `prompts/extract.md` 中的 JSON 模板对应。修改字段时必须同步更新两处。

## 结构定义

```typescript
interface DocExtract {
  docType: "COA" | "ELN"

  reportInfo: {
    reportNo: string           // 报告编号 (COA: "报告单编号/Report No."; ELN: "ELN编号")  → B005
                                // 注意: "记录编号/Record No." 是表单模板编号，不是 reportNo
    reportDate: string         // 报告日期  → B004
  }

  sampleInfo: {
    batchNo: string            // 样品批号  → B001
    resolvedBatchNo?: string   // Phase 3.5 解析的批号 (joint mode ELN 用)。多批次 ELN 不含批号时，Phase 3.5 筛选成功后注入 COA 的 batchNo
    productName: string        // 品名      → B002
    specification: string      // 规格      → B002
    quantity?: string          // 样品量 — 统一存储文档中出现的任何样品量信息原文 (批量/检品数量/代表量/剂型) → B002
    manufacturer?: string      // 生产单位  → B002 (COA可选)
    sampleIds?: string[]       // ELN 中所有取样点编号列表（联合审核 Phase 3.5 筛选用）
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
    signatureMethod?: "image"   // PDF→Markdown 转换后姓名丢失但日期存在时推定为 image；姓名+日期均空时不得设置
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
    sampleId?: string          // 该检测项对应的取样点编号（ELN 联合审核用）
    sampleSource?: string      // 样品来源（如 "202车间冻干粉针第三工场"）
    rawObservation?: string    // ELN表格中的原始观察值（如目视比色"标准管深"）。仅当存在双重结果列且值不同于result时填写
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

  elnScope?: "single-batch" | "multi-batch"  // NEW: ELN 数据范围，Phase 2 检测。仅 ELN 文档
}
```

## 字段→规则映射

| 字段路径 | 对应规则 | 提取优先级 |
|---------|---------|-----------|
| `sampleInfo.batchNo` | B001 | 必须 |
| `sampleInfo.resolvedBatchNo` | B001 (joint mode ELN) | Phase 3.5 后注入 |
| `sampleInfo.*` | B002 | 必须 |
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
| `sampleInfo.sampleIds` | Phase 3.5 筛选 | ELN 必须 |
| `testItems[*].sampleId` | Phase 3.5 筛选 | ELN 必须 |
| `testItems[*].sampleSource` | Phase 3.5 筛选 | ELN 可选 |
| `elnScope` | Phase 3.5 筛选 | ELN 必须 |

## 提取注意事项

1. **数值提取**: `"98.52%"` → `resultNumeric: 98.52, unit: "%"`
2. **范围提取**: `"90.0%~110.0%"` → `specLower: 90.0, specUpper: 110.0, specOperator: "≥/≤"`
3. **上限提取**: `"≤5.0%"` → `specUpper: 5.0, specOperator: "≤"`
4. **检测限**: `"<0.025%"` → `resultNumeric: 0.025, unit: "%", isDetectionLimit: true` — 限值作为resultNumeric，标记isDetectionLimit
5. **签名推断**: PDF→Markdown 转换后，若日期有值但姓名空缺，推定为图片签名(手写/印章)被转换丢失，设 `signatureMethod: "image"`；姓名+日期均空时视为缺失签名，不得设 `signatureMethod: "image"`
6. **平行样**: 同一 itemName 出现多次时标记 isParallel=true, 用 parallelGroup 关联
7. **有效数字**: 从标准规定推断 (如"90.0%" → 1位小数 → significantDigits: 3)
8. **日期格式**: 统一转为 ISO 8601 (YYYY-MM-DD)，截断时间戳、补零、替换分隔符、处理中文日期
9. **缺失签名**: `name/date` 均为空或仅凭空白占位时，视为缺失签名，不得伪造为 `signatureMethod: "image"`
10. **样品量**: 文档中出现的"批量""检品数量""代表量"等样品量信息，统一写入 `sampleInfo.quantity` 字段
11. **ELN 取样点**: 若 ELN 检测结果表格含"取样点编号"列，提取所有编号到 `sampleInfo.sampleIds[]`，每个 testItem 关联 `sampleId` 和 `sampleSource`
12. **elnScope 检测**: ELN 文档必须检测数据范围 — 含多批次数据时设 `"multi-batch"`，否则 `"single-batch"`。若 ELN 不含批号字段无法判断批次归属，默认 `"multi-batch"`
13. **resolvedBatchNo**: joint 模式专用。多批次 ELN 本身不含批号字段时 (batchNo=null)，若 Phase 3.5 筛选成功后注入 COA 的 batchNo，供 B001 规则引擎检查。Phase 2 提取时设为 null
14. **ELN 双重结果列**: 若 ELN 表格同时含原始观察值列和报出结果列（值不同），`result` 取报出结果/结论值，`rawObservation` 取原始观察值。仅当确实存在双重列且值不同时才填写 `rawObservation`。
15. **COA 表格拆分**: PDF 转换后 COA 检测项可能被压缩到同一单元格内（以 `<br>` 堆叠），需按语义拆分为独立 testItem；同一数据重复多列时需去重
16. **中文操作符**: "应不高于"→≤, "应大于"→>, "应不低于"→≥, "X～Y"→≥/≤
17. **HTML 表格**: ELN 可能使用 HTML `<table>` 标签，需正确解析 colspan/rowspan
18. **样品量统一**: 文档中"批量""检品数量""代表量"等量信息统一填入 `quantity` 字段，不需区分类型

## 字段 Nullable 条件

| 字段 | COA nullable? | ELN nullable? | 条件说明 |
|------|:---:|:---:|------|
| `batchNo` | ❌ | ✅ | 公用系统检验（注射用水等）ELN 可能不含批号 |
| `reportNo` | ❌ | ❌ | 必须存在，COA 取"报告单编号"，ELN 取"ELN编号" |
| `recordNo` | ✅ | ✅ | 可选辅助字段 |
| `quantity` | ✅ | ✅ | 若文档无任何量信息字段 |
| `specification` | ❌ | ❌ | 即使值为 "N/A"，也应原文提取 |
| `instruments` | ✅ | ❌ | COA 通常不含仪器信息 |
| `environment` | ✅ | ❌ | COA 通常不含环境条件 |
| `standardRef` | ❌ | ❌ | 必须存在，从"检验依据/标准依据"提取 |
