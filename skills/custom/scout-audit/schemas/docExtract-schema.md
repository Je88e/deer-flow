# DocExtract Schema — PDF 提取结构化数据

> **Ownership:** 本文件是 `docExtract` 结构、字段定义与字段级 canonical 约束的权威来源；`SKILL.md` 只引用，不重复字段级规则。
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

## Canonical Field Rules

- `docExtract.sampleInfo.quantity` 是样品量的唯一 canonical 字段。
- 原文中的“批量”“检品数量”“代表量”等量信息，都必须统一归一到 `sampleInfo.quantity`。
- 进入结构化产物后，不得再以 `batchSize` 或其他旧字段名作为:
  - canonical key
  - FAIL 详情字段
  - 证据中的期望字段名

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
