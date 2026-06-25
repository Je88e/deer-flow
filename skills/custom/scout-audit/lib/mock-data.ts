// Mock LIMS data derived from real COA/ELN PDFs
// Batches: B202604034 (批31772, 20%), B202604035 (批32037, 10%), B2025051101 (注射用水, 重金属, 6份), B2025051102 (注射用水, 重金属, 11份)

export interface RequestFormDTO {
  productName: string
  specification: string
  quantity: string
  standardRef: string
  registeredSampleIds?: string[]  // Phase 3.5: 该批次注册的取样点编号集合
  requiredTestItems: Array<{
    itemName: string
    testType: "quantitative" | "qualitative"
    specLower?: number
    specUpper?: number
    specOperator?: string
    allowedResults?: string[]
    significantDigits?: number
    unit: string
    rsdLimit?: number
    envRequirements?: { tempMin: number; tempMax: number; humidityMin: number; humidityMax: number }
  }>
  approvalWorkflow: Array<{ step: number; role: string; required: boolean }>
}

export interface ReportUniqueDTO {
  unique: boolean
  duplicates: Array<{ reportNo: string; batchNo: string; createDate: string }>
}

export interface QualificationDTO {
  personId: string
  name: string
  qualified: boolean
  qualifications: Array<{
    type: string
    authorizedTests: string[]
    issueDate: string
    expiryDate: string
    status: "active" | "expired" | "revoked"
  }>
}

export interface InstrumentDTO {
  instrumentNo: string
  name: string
  model: string
  calibrationDate: string
  calibrationExpiry: string
  calibrationStatus: "valid" | "expired" | "due_soon"
  useLog: Array<{ date: string; operator: string; purpose: string }>
}

export interface SystemSuitDTO {
  testItem: string
  theoreticalPlates: number
  tailingFactor: number
  resolution: number
  standardRequirements: { minTheoreticalPlates: number; maxTailingFactor: number; minResolution: number }
  passed: boolean
  testDate: string
}

export interface StandardDTO {
  refCode: string
  currentVersion: string
  effectiveDate: string
  isActive: boolean
  supersededBy?: string
}

export interface AuditTrailDTO {
  action: "create" | "modify" | "sign" | "delete" | "view"
  user: string
  account: string
  timestamp: string
  field?: string
  reason?: string
  beforeValue?: string
  afterValue?: string
}

export interface OriginalDataDTO {
  expectedPages: number
  foundPages: number
  instrumentLogs: Array<{ logId: string; instrumentNo: string; date: string; type: string }>
  chromatograms: Array<{ chromId: string; instrumentNo: string; date: string; sampleId: string }>
  sequences: Array<{ seqId: string; instrumentNo: string; date: string; injectionCount: number }>
}

export interface WorkflowDTO {
  currentStep: number
  totalSteps: number
  steps: Array<{
    step: number
    role: "tester" | "reviewer" | "approver" | "release"
    status: "pending" | "completed" | "skipped"
    operator?: string
    completedDate?: string
    signatureValid?: boolean
  }>
}

export interface TestItemOptionsDTO {
  testItemName: string
  allowedResults: string[]
  resultFormat?: string
}

// --- Mock Database ---

const REQUEST_FORMS: Record<string, RequestFormDTO> = {
  B202604034: {
    productName: "人血白蛋白原液",
    specification: "20%",
    quantity: "12ml",
    standardRef: "HLGF/2-ZLBZ-ZJP-01",
    requiredTestItems: [
      {
        itemName: "蛋白质含量",
        testType: "quantitative",
        specLower: 200.0,
        specOperator: ">",
        significantDigits: 4,
        unit: "g/L",
        rsdLimit: 1.0,
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
      {
        itemName: "pH值",
        testType: "quantitative",
        specLower: 6.40,
        specUpper: 7.40,
        specOperator: "≥/≤",
        significantDigits: 3,
        unit: "",
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
      {
        itemName: "残余乙醇含量",
        testType: "quantitative",
        specUpper: 0.025,
        specOperator: "≤",
        significantDigits: 2,
        unit: "%",
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
    ],
    approvalWorkflow: [
      { step: 1, role: "tester", required: true },
      { step: 2, role: "reviewer", required: true },
      { step: 3, role: "approver", required: true },
    ],
  },
  B202604035: {
    productName: "人血白蛋白原液",
    specification: "10%",
    quantity: "12ml",
    standardRef: "HLGF/2-ZLBZ-ZJP-01",
    requiredTestItems: [
      {
        itemName: "蛋白质含量",
        testType: "quantitative",
        specLower: 100.0,
        specOperator: ">",
        significantDigits: 4,
        unit: "g/L",
        rsdLimit: 1.0,
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
      {
        itemName: "pH值",
        testType: "quantitative",
        specLower: 6.40,
        specUpper: 7.40,
        specOperator: "≥/≤",
        significantDigits: 3,
        unit: "",
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
      {
        itemName: "残余乙醇含量",
        testType: "quantitative",
        specUpper: 0.025,
        specOperator: "≤",
        significantDigits: 2,
        unit: "%",
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
    ],
    approvalWorkflow: [
      { step: 1, role: "tester", required: true },
      { step: 2, role: "reviewer", required: true },
      { step: 3, role: "approver", required: true },
    ],
  },
  "240514002": {
    productName: "流感病毒裂解疫苗（幼儿装）",
    specification: "0.25ml/瓶",
    quantity: "20支",
    standardRef: "STP/ZL028-12",
    requiredTestItems: [
      {
        itemName: "无菌检查",
        testType: "qualitative",
        allowedResults: ["符合规定", "不符合规定"],
        unit: "",
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
      {
        itemName: "蛋白质含量",
        testType: "quantitative",
        specUpper: 300,
        specOperator: "≤",
        significantDigits: 3,
        unit: "μg/ml",
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
      {
        itemName: "蛋白质含量与血凝素含量比值",
        testType: "quantitative",
        specUpper: 3.3,
        specOperator: "≤",
        significantDigits: 2,
        unit: "倍",
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
    ],
    approvalWorkflow: [
      { step: 1, role: "tester", required: true },
      { step: 2, role: "reviewer", required: true },
      { step: 3, role: "approver", required: true },
    ],
  },
  DL202604001: {
    productName: "人血白蛋白原液",
    specification: "20%",
    quantity: "12ml",
    standardRef: "HLGF/2-ZLBZ-ZJP-01",
    requiredTestItems: [
      {
        itemName: "残余乙醇含量",
        testType: "quantitative",
        specUpper: 0.025,
        specOperator: "<",
        significantDigits: 2,
        unit: "%",
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
    ],
    approvalWorkflow: [
      { step: 1, role: "tester", required: true },
      { step: 2, role: "reviewer", required: true },
      { step: 3, role: "approver", required: true },
    ],
  },
  B2025051101: {
    productName: "注射用水",
    specification: "液体",
    quantity: "6份",
    standardRef: "QA-SMP-F052-10",
    registeredSampleIds: [
      "250511-20201",
      "250511-20210",
      "250511-20214",
      "250511-20551",
      "250511-20559",
      "250511-20560",
    ],
    requiredTestItems: [
      {
        itemName: "重金属",
        testType: "qualitative",
        specUpper: 0.0001,
        specOperator: "≤",
        allowedResults: ["符合规定", "不符合规定"],
        unit: "%",
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
    ],
    approvalWorkflow: [
      { step: 1, role: "tester", required: true },
      { step: 2, role: "reviewer", required: true },
      { step: 3, role: "approver", required: true },
    ],
  },
  B2025051102: {
    productName: "注射用水",
    specification: "液体",
    quantity: "11份",
    standardRef: "QA-SMP-F052-10",
    registeredSampleIds: [
      "250511-21845",
      "250511-21849",
      "250511-21860",
      "250511-21861",
      "250511-508012",
      "250511-508032",
      "250511-508033",
      "250511-508036",
      "250511-802101",
      "250511-802102",
      "250511-802103",
    ],
    requiredTestItems: [
      {
        itemName: "重金属",
        testType: "qualitative",
        specUpper: 0.0001,
        specOperator: "≤",
        allowedResults: ["符合规定", "不符合规定"],
        unit: "%",
        envRequirements: { tempMin: 18, tempMax: 28, humidityMin: 20, humidityMax: 60 },
      },
    ],
    approvalWorkflow: [
      { step: 1, role: "tester", required: true },
      { step: 2, role: "reviewer", required: true },
      { step: 3, role: "approver", required: true },
    ],
  },
}

const REPORT_UNIQUE: Record<string, ReportUniqueDTO> = {
  "HLGF-I-26040404": { unique: true, duplicates: [] },
  "HLGF-I-26040602": { unique: true, duplicates: [] },
  "A408H0001": { unique: true, duplicates: [] },
  "A408H0002": { unique: true, duplicates: [] },
  "A408H0003": { unique: true, duplicates: [] },
  "S001-empty-reviewer-approver": { unique: true, duplicates: [] },
  "S001-image-signature": { unique: true, duplicates: [] },
  "S004-missing-approver-step": { unique: true, duplicates: [] },
  "detection-limit-coa": { unique: true, duplicates: [] },
  "eln-with-complete-workflow": { unique: true, duplicates: [] },
  "HLGF-I-25051101": { unique: true, duplicates: [] },
  "HLGF-I-25051102": { unique: true, duplicates: [] },
  "ELN20190064": { unique: true, duplicates: [] },
}

const QUALIFICATIONS: Record<string, QualificationDTO> = {
  "王斌": {
    personId: "P001",
    name: "王斌",
    qualified: true,
    qualifications: [
      {
        type: "蛋白质含量检测",
        authorizedTests: ["蛋白质含量"],
        issueDate: "2025-01-15",
        expiryDate: "2027-01-15",
        status: "active",
      },
      {
        type: "pH值检测",
        authorizedTests: ["pH值"],
        issueDate: "2025-03-01",
        expiryDate: "2027-03-01",
        status: "active",
      },
      {
        type: "重金属检测",
        authorizedTests: ["重金属"],
        issueDate: "2025-01-10",
        expiryDate: "2027-01-10",
        status: "active",
      },
    ],
  },
  "韩梅": {
    personId: "P002",
    name: "韩梅",
    qualified: true,
    qualifications: [
      {
        type: "蛋白质含量检测",
        authorizedTests: ["蛋白质含量"],
        issueDate: "2025-02-10",
        expiryDate: "2027-02-10",
        status: "active",
      },
      {
        type: "乙醇含量检测",
        authorizedTests: ["残余乙醇含量"],
        issueDate: "2025-04-01",
        expiryDate: "2027-04-01",
        status: "active",
      },
      {
        type: "pH值检测",
        authorizedTests: ["pH值"],
        issueDate: "2025-03-01",
        expiryDate: "2027-03-01",
        status: "active",
      },
    ],
  },
  "System Administrator": {
    personId: "P003",
    name: "System Administrator",
    qualified: true,
    qualifications: [
      {
        type: "无菌检查",
        authorizedTests: ["无菌检查"],
        issueDate: "2024-01-01",
        expiryDate: "2026-12-31",
        status: "active",
      },
      {
        type: "蛋白质含量检测",
        authorizedTests: ["蛋白质含量", "蛋白质含量与血凝素含量比值"],
        issueDate: "2024-01-01",
        expiryDate: "2026-12-31",
        status: "active",
      },
    ],
  },
  "万国琼": {
    personId: "P004",
    name: "万国琼",
    qualified: true,
    qualifications: [
      {
        type: "无菌检查",
        authorizedTests: ["无菌检查"],
        issueDate: "2024-01-01",
        expiryDate: "2026-12-31",
        status: "active",
      },
      {
        type: "蛋白质含量检测",
        authorizedTests: ["蛋白质含量", "蛋白质含量与血凝素含量比值"],
        issueDate: "2024-01-01",
        expiryDate: "2026-12-31",
        status: "active",
      },
    ],
  },
}

const INSTRUMENTS: Record<string, InstrumentDTO> = {
  "1000000602": {
    instrumentNo: "1000000602",
    name: "紫外可见分光光度计",
    model: "UV-1900",
    calibrationDate: "2026-03-15",
    calibrationExpiry: "2027-03-15",
    calibrationStatus: "valid",
    useLog: [
      { date: "2026-04-04", operator: "王斌", purpose: "蛋白质含量测定" },
      { date: "2026-04-04", operator: "韩梅", purpose: "残余乙醇含量测定" },
      { date: "2026-04-06", operator: "王斌", purpose: "蛋白质含量测定" },
    ],
  },
  "1000002651": {
    instrumentNo: "1000002651",
    name: "pH计",
    model: "PB-10",
    calibrationDate: "2026-01-20",
    calibrationExpiry: "2027-01-20",
    calibrationStatus: "valid",
    useLog: [
      { date: "2026-04-04", operator: "王斌", purpose: "pH值测定" },
      { date: "2026-04-06", operator: "王斌", purpose: "pH值测定" },
    ],
  },
  "1000002762": {
    instrumentNo: "1000002762",
    name: "电热鼓风干燥箱",
    model: "101型",
    calibrationDate: "2025-05-10",
    calibrationExpiry: "2027-05-10",
    calibrationStatus: "valid",
    useLog: [
      { date: "2026-04-04", operator: "韩梅", purpose: "残余乙醇含量测定" },
    ],
  },
}

const SYSTEM_SUITABILITY: Record<string, SystemSuitDTO> = {
  B202604034: {
    testItem: "蛋白质含量",
    theoreticalPlates: 15000,
    tailingFactor: 0.98,
    resolution: 2.5,
    standardRequirements: { minTheoreticalPlates: 5000, maxTailingFactor: 1.5, minResolution: 1.5 },
    passed: true,
    testDate: "2026-04-04",
  },
  B202604035: {
    testItem: "蛋白质含量",
    theoreticalPlates: 15200,
    tailingFactor: 0.97,
    resolution: 2.6,
    standardRequirements: { minTheoreticalPlates: 5000, maxTailingFactor: 1.5, minResolution: 1.5 },
    passed: true,
    testDate: "2026-04-06",
  },
}

const STANDARDS: Record<string, StandardDTO> = {
  "HLGF/2-ZLBZ-ZJP-01": {
    refCode: "HLGF/2-ZLBZ-ZJP-01",
    currentVersion: "2022-03",
    effectiveDate: "2022-03-01",
    isActive: true,
  },
  "STP/ZL028-12": {
    refCode: "STP/ZL028-12",
    currentVersion: "2024-05",
    effectiveDate: "2024-05-01",
    isActive: true,
  },
  "QA-SMP-F052-10": {
    refCode: "QA-SMP-F052-10",
    currentVersion: "2024-01",
    effectiveDate: "2024-01-01",
    isActive: true,
  },
  "QC-SOP-F052-16": {
    refCode: "QC-SOP-F052-16",
    currentVersion: "2024-06",
    effectiveDate: "2024-06-01",
    isActive: true,
  },
  "QC-R-F052-00": {
    refCode: "QC-R-F052-00",
    currentVersion: "2024-06",
    effectiveDate: "2024-06-01",
    isActive: true,
  },
}

const AUDIT_TRAILS: Record<string, AuditTrailDTO[]> = {
  B202604034: [
    { action: "create", user: "王斌", account: "wangbin", timestamp: "2026-04-04T09:00:00" },
    { action: "sign", user: "王斌", account: "wangbin", timestamp: "2026-04-04T10:00:00" },
    { action: "sign", user: "韩梅", account: "hanmei", timestamp: "2026-04-04T14:00:00" },
    { action: "sign", user: "韩梅", account: "hanmei", timestamp: "2026-04-04T16:00:00" },
    { action: "view", user: "System Administrator", account: "admin", timestamp: "2026-04-22T14:43:42" },
  ],
  B202604035: [
    { action: "create", user: "王斌", account: "wangbin", timestamp: "2026-04-06T09:00:00" },
    { action: "sign", user: "王斌", account: "wangbin", timestamp: "2026-04-06T10:00:00" },
    { action: "sign", user: "韩梅", account: "hanmei", timestamp: "2026-04-06T14:00:00" },
    { action: "sign", user: "韩梅", account: "hanmei", timestamp: "2026-04-06T16:00:00" },
  ],
  "240514002": [
    { action: "create", user: "System Administrator", account: "admin", timestamp: "2024-05-14T09:00:00" },
    { action: "modify", user: "System Administrator", account: "admin", timestamp: "2024-05-14T09:10:00", field: "results" },
    { action: "sign", user: "System Administrator", account: "admin", timestamp: "2024-05-14T10:00:00" },
    { action: "view", user: "System Administrator", account: "admin", timestamp: "2024-05-31T17:00:00" },
  ],
  DL202604001: [
    { action: "create", user: "韩梅", account: "hanmei", timestamp: "2026-04-15T09:00:00" },
    { action: "sign", user: "韩梅", account: "hanmei", timestamp: "2026-04-15T10:00:00" },
    { action: "sign", user: "王斌", account: "wangbin", timestamp: "2026-04-15T14:00:00" },
    { action: "sign", user: "王斌", account: "wangbin", timestamp: "2026-04-15T16:00:00" },
  ],
  B2025051101: [
    { action: "create", user: "王斌", account: "wangbin", timestamp: "2025-05-11T09:00:00" },
    { action: "sign", user: "王斌", account: "wangbin", timestamp: "2025-05-15T13:51:29" },
    { action: "sign", user: "韩梅", account: "hanmei", timestamp: "2025-05-15T14:30:00" },
    { action: "sign", user: "韩梅", account: "hanmei", timestamp: "2025-05-15T15:00:00" },
  ],
  B2025051102: [
    { action: "create", user: "王斌", account: "wangbin", timestamp: "2025-05-11T09:00:00" },
    { action: "sign", user: "王斌", account: "wangbin", timestamp: "2025-05-15T13:51:29" },
    { action: "sign", user: "韩梅", account: "hanmei", timestamp: "2025-05-15T14:30:00" },
    { action: "sign", user: "韩梅", account: "hanmei", timestamp: "2025-05-15T15:00:00" },
    { action: "view", user: "System Administrator", account: "admin", timestamp: "2025-05-15T14:43:42" },
  ],
}

const ORIGINAL_DATA: Record<string, OriginalDataDTO> = {
  B202604034: {
    expectedPages: 8,
    foundPages: 8,
    instrumentLogs: [
      { logId: "LOG-001", instrumentNo: "1000000602", date: "2026-04-04", type: "spectrophotometer" },
      { logId: "LOG-002", instrumentNo: "1000002651", date: "2026-04-04", type: "ph_meter" },
      { logId: "LOG-003", instrumentNo: "1000002762", date: "2026-04-04", type: "drying_oven" },
    ],
    chromatograms: [
      { chromId: "CHR-001", instrumentNo: "1000000602", date: "2026-04-04", sampleId: "B202604034-01" },
    ],
    sequences: [
      { seqId: "SEQ-001", instrumentNo: "1000000602", date: "2026-04-04", injectionCount: 5 },
    ],
  },
  B202604035: {
    expectedPages: 8,
    foundPages: 8,
    instrumentLogs: [
      { logId: "LOG-004", instrumentNo: "1000000602", date: "2026-04-06", type: "spectrophotometer" },
      { logId: "LOG-005", instrumentNo: "1000002651", date: "2026-04-06", type: "ph_meter" },
    ],
    chromatograms: [
      { chromId: "CHR-002", instrumentNo: "1000000602", date: "2026-04-06", sampleId: "B202604035-01" },
    ],
    sequences: [
      { seqId: "SEQ-002", instrumentNo: "1000000602", date: "2026-04-06", injectionCount: 5 },
    ],
  },
  "240514002": {
    expectedPages: 1,
    foundPages: 1,
    instrumentLogs: [],
    chromatograms: [],
    sequences: [],
  },
  B2025051101: {
    expectedPages: 2,
    foundPages: 2,
    instrumentLogs: [
      { logId: "LOG-006", instrumentNo: "VISUAL-001", date: "2025-05-15", type: "visual_comparison" },
    ],
    chromatograms: [],
    sequences: [
      { seqId: "SEQ-003", instrumentNo: "VISUAL-001", date: "2025-05-15", injectionCount: 1 },
    ],
  },
  B2025051102: {
    expectedPages: 2,
    foundPages: 2,
    instrumentLogs: [
      { logId: "LOG-007", instrumentNo: "VISUAL-001", date: "2025-05-15", type: "visual_comparison" },
    ],
    chromatograms: [],
    sequences: [
      { seqId: "SEQ-004", instrumentNo: "VISUAL-001", date: "2025-05-15", injectionCount: 1 },
    ],
  },
}

const WORKFLOWS: Record<string, WorkflowDTO> = {
  "HLGF-I-26040404": {
    currentStep: 3,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "王斌", completedDate: "2026-04-04", signatureValid: true },
      { step: 2, role: "reviewer", status: "completed", operator: "韩梅", completedDate: "2026-04-04", signatureValid: true },
      { step: 3, role: "approver", status: "completed", operator: "韩梅", completedDate: "2026-04-04", signatureValid: true },
    ],
  },
  "HLGF-I-26040602": {
    currentStep: 3,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "王斌", completedDate: "2026-04-06", signatureValid: true },
      { step: 2, role: "reviewer", status: "completed", operator: "韩梅", completedDate: "2026-04-06", signatureValid: true },
      { step: 3, role: "approver", status: "completed", operator: "韩梅", completedDate: "2026-04-06", signatureValid: true },
    ],
  },
  A408H0001: {
    currentStep: 1,
    totalSteps: 3,
    steps: [
      {
        step: 1,
        role: "tester",
        status: "completed",
        operator: "System Administrator",
        completedDate: "2024-05-14",
        signatureValid: true,
      },
      { step: 2, role: "reviewer", status: "pending" },
      { step: 3, role: "approver", status: "pending" },
    ],
  },
  A408H0002: {
    currentStep: 1,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "万国琼", completedDate: "2024-05-14", signatureValid: true },
      { step: 2, role: "reviewer", status: "pending" },
      { step: 3, role: "approver", status: "pending" },
    ],
  },
  A408H0003: {
    currentStep: 1,
    totalSteps: 3,
    steps: [
      {
        step: 1,
        role: "tester",
        status: "completed",
        operator: "System Administrator",
        completedDate: "2024-05-14",
        signatureValid: true,
      },
      { step: 2, role: "reviewer", status: "pending" },
      { step: 3, role: "approver", status: "pending" },
    ],
  },
  "S001-empty-reviewer-approver": {
    currentStep: 2,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "System Administrator", completedDate: "2024-05-14", signatureValid: true },
      { step: 2, role: "reviewer", status: "pending" },
      { step: 3, role: "approver", status: "pending" },
    ],
  },
  "S001-image-signature": {
    currentStep: 3,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "王斌", completedDate: "2026-04-15", signatureValid: true },
      { step: 2, role: "reviewer", status: "completed", operator: "韩梅", completedDate: "2026-04-15", signatureValid: true },
      { step: 3, role: "approver", status: "completed", operator: "韩梅", completedDate: "2026-04-15", signatureValid: true },
    ],
  },
  "S004-missing-approver-step": {
    currentStep: 2,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "System Administrator", completedDate: "2024-05-14", signatureValid: true },
      { step: 2, role: "reviewer", status: "completed", operator: "万国琼", completedDate: "2024-05-14", signatureValid: true },
    ],
  },
  "detection-limit-coa": {
    currentStep: 3,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "韩梅", completedDate: "2026-04-15", signatureValid: true },
      { step: 2, role: "reviewer", status: "completed", operator: "王斌", completedDate: "2026-04-15", signatureValid: true },
      { step: 3, role: "approver", status: "completed", operator: "王斌", completedDate: "2026-04-15", signatureValid: true },
    ],
  },
  "eln-with-complete-workflow": {
    currentStep: 3,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "王斌", completedDate: "2026-04-04", signatureValid: true },
      { step: 2, role: "reviewer", status: "completed", operator: "韩梅", completedDate: "2026-04-04", signatureValid: true },
      { step: 3, role: "approver", status: "completed", operator: "韩梅", completedDate: "2026-04-04", signatureValid: true },
    ],
  },
  "HLGF-I-25051101": {
    currentStep: 3,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "王斌", completedDate: "2025-05-15", signatureValid: true },
      { step: 2, role: "reviewer", status: "completed", operator: "韩梅", completedDate: "2025-05-15", signatureValid: true },
      { step: 3, role: "approver", status: "completed", operator: "韩梅", completedDate: "2025-05-15", signatureValid: true },
    ],
  },
  "HLGF-I-25051102": {
    currentStep: 3,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "王斌", completedDate: "2025-05-15", signatureValid: true },
      { step: 2, role: "reviewer", status: "completed", operator: "韩梅", completedDate: "2025-05-15", signatureValid: true },
      { step: 3, role: "approver", status: "completed", operator: "韩梅", completedDate: "2025-05-15", signatureValid: true },
    ],
  },
  "ELN20190064": {
    currentStep: 3,
    totalSteps: 3,
    steps: [
      { step: 1, role: "tester", status: "completed", operator: "王斌", completedDate: "2025-05-15", signatureValid: true },
      { step: 2, role: "reviewer", status: "completed", operator: "韩梅", completedDate: "2025-05-15", signatureValid: true },
      { step: 3, role: "approver", status: "completed", operator: "韩梅", completedDate: "2025-05-15", signatureValid: true },
    ],
  },
}

// Lookup functions

export function getMockRequestForm(batchNo: string): RequestFormDTO | null {
  return REQUEST_FORMS[batchNo] ?? null
}

export function getMockReportUnique(reportNo: string): ReportUniqueDTO {
  return REPORT_UNIQUE[reportNo] ?? { unique: true, duplicates: [] }
}

export function getMockQualification(personName: string, _asOfDate: string): QualificationDTO | null {
  return QUALIFICATIONS[personName] ?? null
}

export function getMockInstrument(instrumentNo: string): InstrumentDTO | null {
  return INSTRUMENTS[instrumentNo] ?? null
}

export function getMockSystemSuitability(batchNo: string): SystemSuitDTO | null {
  return SYSTEM_SUITABILITY[batchNo] ?? null
}

export function getMockStandard(standardRef: string): StandardDTO | null {
  return STANDARDS[standardRef] ?? null
}

export function getMockAuditTrail(batchNo: string): AuditTrailDTO[] {
  return AUDIT_TRAILS[batchNo] ?? []
}

export function getMockOriginalDataIndex(batchNo: string): OriginalDataDTO | null {
  return ORIGINAL_DATA[batchNo] ?? null
}

export function getMockApprovalWorkflow(reportNo: string): WorkflowDTO | null {
  return WORKFLOWS[reportNo] ?? null
}

export function getMockTestItemOptions(productName: string, testItemName: string): TestItemOptionsDTO | null {
  if (productName === "人血白蛋白原液" && testItemName === "残余乙醇含量") {
    return {
      testItemName: "残余乙醇含量",
      allowedResults: ["<0.025%", "≥0.025%"],
      resultFormat: "comparison",
    }
  }
  if (productName === "流感病毒裂解疫苗（幼儿装）" && testItemName === "无菌检查") {
    return {
      testItemName: "无菌检查",
      allowedResults: ["符合规定", "不符合规定"],
      resultFormat: "enum",
    }
  }
  if (productName === "注射用水" && testItemName === "重金属") {
    return {
      testItemName: "重金属",
      allowedResults: ["符合规定", "不符合规定"],
      resultFormat: "enum",
    }
  }
  // Default: return null for items that don't have qualitative options
  return null
}

/** Aggregate all LIMS data for a given docExtract — single-call optimization */
export function getMockAllLimsData(
  batchNo: string,
  reportNo: string,
  standardRef: string,
  personnelNames: string[],
  instrumentNos: string[],
  asOfDate: string,
  docType: "ELN" | "COA",
  qualitativeItems: Array<{ productName: string; testItemName: string }>
): Record<string, unknown> {
  const requestForm = getMockRequestForm(batchNo)
  const reportUnique = getMockReportUnique(reportNo)
  const qualifications = personnelNames
    .map((name) => getMockQualification(name, asOfDate))
    .filter((q): q is QualificationDTO => q !== null)
  const instruments = instrumentNos
    .map((no) => getMockInstrument(no))
    .filter((i): i is InstrumentDTO => i !== null)
  const systemSuit = getMockSystemSuitability(batchNo)
  const standard = getMockStandard(standardRef)
  const auditTrail = getMockAuditTrail(batchNo)
  const originalDataIndex = getMockOriginalDataIndex(batchNo)
  const workflow = getMockApprovalWorkflow(reportNo)
  const testItemOptions = qualitativeItems
    .map((qi) => getMockTestItemOptions(qi.productName, qi.testItemName))
    .filter((t): t is TestItemOptionsDTO => t !== null)

  return {
    requestForm,
    reportUnique,
    qualifications,
    instruments,
    systemSuit,
    standard,
    auditTrail,
    originalDataIndex,
    workflow,
    testItemOptions,
  }
}
