# LimsData Schema — LIMS 外部数据

> 通过 `scout-lims-connector` MCP 获取的外部数据。由 Phase 3 生成。

## 接口定义

### 1. fetch_request_form(batchNo) → RequestFormDTO

```typescript
interface RequestFormDTO {
  productName: string
  specification: string
  quantity: string
  standardRef: string
  requiredTestItems: [{
    itemName: string
    testType: "quantitative" | "qualitative"
    specLower?: number              // → N001
    specUpper?: number              // → N001
    specOperator?: string           // → N001
    allowedResults?: string[]       // → N002
    significantDigits?: number      // → R001
    unit: string                    // → R003
    rsdLimit?: number               // → P001
    envRequirements?: {             // → E004
      tempMin: number
      tempMax: number
      humidityMin: number
      humidityMax: number
    }
  }]
  approvalWorkflow: [{             // 流程定义（参考用；S004 实际使用 fetch_approval_workflow 返回的 WorkflowDTO）
    step: number
    role: "tester" | "reviewer" | "approver" | "release"
    required: boolean
  }]
}
```
**用途**: B002, B003, N001, N002, R001, R003, P001, E004, S004

---

### 2. check_report_unique(reportNo) → ReportUniqueDTO

```typescript
interface ReportUniqueDTO {
  unique: boolean
  duplicates: [{
    reportNo: string
    batchNo: string
    createDate: string
  }]
}
```
**用途**: B005

---

### 3. fetch_qualifications(personName, asOfDate) → QualificationDTO

```typescript
interface QualificationDTO {
  personId: string
  name: string
  qualified: boolean
  qualifications: [{
    type: string
    authorizedTests: string[]
    issueDate: string
    expiryDate: string
    status: "active" | "expired" | "revoked"
  }]
}
```
**用途**: E001

---

### 4. fetch_instrument(instrumentNo) → InstrumentDTO

```typescript
interface InstrumentDTO {
  instrumentNo: string
  name: string
  model: string
  calibrationDate: string
  calibrationExpiry: string
  calibrationStatus: "valid" | "expired" | "due_soon"
  useLog: [{
    date: string
    operator: string
    purpose: string
  }]
}
```
**用途**: E002, E003

---

### 5. fetch_system_suitability(batchNo) → SystemSuitDTO

```typescript
interface SystemSuitDTO {
  testItem: string
  theoreticalPlates: number
  tailingFactor: number
  resolution: number
  standardRequirements: {
    minTheoreticalPlates: number
    maxTailingFactor: number
    minResolution: number
  }
  passed: boolean
  testDate: string
}
```
**用途**: E005

---

### 6. fetch_standard(standardRef) → StandardDTO

```typescript
interface StandardDTO {
  refCode: string
  currentVersion: string
  effectiveDate: string
  isActive: boolean
  supersededBy?: string
}
```
**用途**: L004

---

### 7. fetch_audit_trail(batchNo) → AuditTrailDTO[]

```typescript
interface AuditTrailDTO {
  action: "create" | "modify" | "sign" | "delete" | "view"
  user: string
  account: string               // → S003: 比对签名人与登录账号
  timestamp: string
  field?: string
  reason?: string               // → D001
  beforeValue?: string
  afterValue?: string
}
```
**用途**: S002, S003, D001

---

### 8. fetch_original_data_index(batchNo) → OriginalDataDTO

```typescript
interface OriginalDataDTO {
  expectedPages: number
  foundPages: number
  instrumentLogs: [{
    logId: string
    instrumentNo: string
    date: string
    type: string
  }]
  chromatograms: [{
    chromId: string
    instrumentNo: string
    date: string
    sampleId: string
  }]
  sequences: [{
    seqId: string
    instrumentNo: string
    date: string
    injectionCount: number
  }]
}
```
**用途**: D002, D003

---

### 9. fetch_approval_workflow(reportNo) → WorkflowDTO

```typescript
interface WorkflowDTO {
  currentStep: number
  totalSteps: number
  steps: [{
    step: number
    role: "tester" | "reviewer" | "approver" | "release"
    status: "pending" | "completed" | "skipped"
    operator?: string
    completedDate?: string
    signatureValid?: boolean
  }]
}
```
**用途**: S004

---

### 10. fetch_test_item_options(productName, testItemName) → TestItemOptionsDTO

```typescript
interface TestItemOptionsDTO {
  testItemName: string
  allowedResults: string[]
  resultFormat?: string
}
```
**用途**: N002

---

## 组合查询策略

Skill Phase 3 中按以下顺序调用，避免不必要请求：

```
Step 1: fetch_request_form(batchNo)
        → 获取 requiredTestItems 和 approvalWorkflow

Step 2: check_report_unique(reportNo)
        → 仅 COA

Step 3: fetch_qualifications(personName, asOfDate)
        → 为 docExtract.personnel[] 中每个人调用

Step 4: fetch_instrument(instrumentNo)
        → 为 docExtract.instruments[] 中每台仪器调用

Step 5: fetch_system_suitability(batchNo)
        → 仅 ELN 色谱检测

Step 6: fetch_standard(standardRef)
        → 用 docExtract.standardRef

Step 7: fetch_audit_trail(batchNo)

Step 8: fetch_original_data_index(batchNo)

Step 9: fetch_approval_workflow(reportNo)
        → 仅 COA

Step 10: fetch_test_item_options(productName, testItemName)
         → 仅 testType="qualitative" 的检测项
         → 可批量: 为每个定性项调用一次
```

Step 1-2, Step 3-4, Step 5-6 可并行。
