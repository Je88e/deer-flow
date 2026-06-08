export type RegressionStatus = "PASS" | "FAIL" | "SKIP"
export type RegressionSeverity = "severe" | "warning" | "info"

export interface RegressionRuleResult {
  ruleId: string
  ruleName: string
  status: RegressionStatus
  severity: RegressionSeverity
  details: string
  evidence?: {
    expected?: string
    actual?: string
    location?: string
  }
  remediation: string
}

export interface RegressionCorrection {
  ruleId: string
  originalStatus: RegressionStatus
  correctedTo: RegressionStatus
  reason: string
}

export interface RegressionScenario {
  id: string
  description: string
  docType: "COA" | "ELN"
  sourceFilePath: string
  markdownText: string
  docExtract: Record<string, unknown>
  semanticResults: RegressionRuleResult[]
  corrections: RegressionCorrection[]
}

function semanticPass(
  ruleId: string,
  ruleName: string,
  severity: RegressionSeverity,
  details: string
): RegressionRuleResult {
  return { ruleId, ruleName, status: "PASS", severity, details, remediation: "" }
}

function semanticSkip(
  ruleId: string,
  ruleName: string,
  severity: RegressionSeverity,
  details: string
): RegressionRuleResult {
  return { ruleId, ruleName, status: "SKIP", severity, details, remediation: "" }
}

function semanticFail(
  ruleId: string,
  ruleName: string,
  severity: RegressionSeverity,
  details: string,
  expected: string,
  actual: string,
  remediation: string,
  location?: string
): RegressionRuleResult {
  return {
    ruleId,
    ruleName,
    status: "FAIL",
    severity,
    details,
    evidence: { expected, actual, ...(location ? { location } : {}) },
    remediation,
  }
}

export const regressionScenarios: RegressionScenario[] = [
  {
    id: "A408H0001",
    description: "历史 COA 基准样例，覆盖空签名、未完成 workflow、L001 修正和 warning/location 渲染。",
    docType: "COA",
    sourceFilePath: "docs/reports/A408H0001.pdf",
    markdownText: [
      "| 大连雅立峰生物制药有限公司 | 第 1 页，共 1 页 |",
      "| 报告书编号 | A408H0001 |",
      "| 检品名称 | 流感病毒裂解疫苗（幼儿装） | 批号 | 240514002 |",
      "| 规格 | 0.25ml/瓶 | 取样数量 | 10支 | 代表量 | 20支 |",
      "| 报告日期 | 2024-05-14 |",
      "| 检验依据 | 《流感病毒裂解疫苗质量标准》STP/ZL028-12 |",
      "| 无菌检查 | 应符合规定 | 符合规定 |",
      "| 蛋白质含量 | 应不高于300μg/ml | 255μg/ml |",
      "| 蛋白质含量与血凝素含量比值 | 不得超过3.3倍 | 3.0倍 |",
      "结论：本品依据《流感病毒裂解疫苗质量标准》STP/ZL028-12，检验以上项目，结果符合规定。",
      "| 报告人 | System Administrator | 复核人 |  | 批准人 |  |",
      "| 报告日期 | 2024-05-14 | 复核日期 |  | 批准日期 |  |",
    ].join("\n"),
    docExtract: {
      docType: "COA",
      reportInfo: {
        reportNo: "A408H0001",
        reportDate: "2024-05-14",
      },
      sampleInfo: {
        batchNo: "240514002",
        productName: "流感病毒裂解疫苗（幼儿装）",
        specification: "0.25ml/瓶",
        batchSize: "",
        representativeQuantity: "20支",
        manufacturer: "大连雅立峰生物制药有限公司",
      },
      dates: {
        testDate: "2024-05-14",
        reviewDate: "",
        approveDate: "",
        reportDate: "2024-05-14",
      },
      signatures: [
        { role: "tester", name: "System Administrator", date: "2024-05-14" },
        { role: "reviewer", name: "", date: "" },
        { role: "approver", name: "", date: "" },
      ],
      testItems: [
        {
          itemName: "无菌检查",
          testType: "qualitative",
          specification: "应符合规定",
          result: "符合规定",
          conclusion: "符合规定",
        },
        {
          itemName: "蛋白质含量",
          testType: "quantitative",
          specification: "应不高于300μg/ml",
          specUpper: 300,
          specOperator: "≤",
          result: "255μg/ml",
          resultNumeric: 255,
          unit: "μg/ml",
          significantDigits: 3,
          conclusion: "",
        },
        {
          itemName: "蛋白质含量与血凝素含量比值",
          testType: "quantitative",
          specification: "不得超过3.3倍",
          specUpper: 3.3,
          specOperator: "≤",
          result: "3.0倍",
          resultNumeric: 3.0,
          unit: "倍",
          significantDigits: 2,
          conclusion: "",
        },
      ],
      instruments: [],
      personnel: [
        { name: "System Administrator", role: "tester" },
      ],
      modifications: [],
      standardRef: "STP/ZL028-12",
      totalPages: 1,
    },
    semanticResults: [
      semanticPass("N002", "结果在可选结果内", "severe", "无菌检查结果“符合规定”在允许枚举值内"),
      semanticSkip("E001", "人员资质校验", "severe", "不适用于 COA"),
      semanticSkip("E002", "仪器编号匹配", "severe", "不适用于 COA"),
      semanticPass("S002", "电子签名合规", "severe", "sign 审计轨迹字段完整，且 completed workflow 步骤均有对应留痕"),
      semanticPass("S003", "禁止代签", "severe", "当前批次 sign 记录中的 user/account 映射保持一一稳定"),
      semanticSkip("D001", "修改规范", "severe", "不适用于 COA"),
      semanticFail(
        "D002",
        "原始数据可追溯",
        "severe",
        "原始数据索引缺少图谱和序列关联信息，无法支撑结果回溯",
        "应提供原始数据索引并关联图谱/序列/日志",
        "originalDataIndex 中 chromatograms 和 sequences 为空",
        "补齐原始数据索引并建立结果到原始记录的映射",
        "originalDataIndex"
      ),
      semanticPass("D003", "无缺失页面", "severe", "记录页数与索引页数一致"),
      semanticPass("L002", "跨页数据一致", "warning", "单页 COA，无跨页不一致风险"),
      semanticSkip("L003", "计算公式正确", "severe", "不适用于 COA"),
      semanticFail(
        "C001",
        "结论规范",
        "warning",
        "结论段落使用“结果符合规定”，但未按模板明确写成“符合XXX标准规定”",
        "结论应明确引用标准并使用规范措辞",
        "结论段落仅写“结果符合规定”",
        "按模板补全标准引用和规范措辞",
        "结论段落"
      ),
      semanticPass("C002", "无歧义表述", "info", "未发现“大概”“基本合格”等模糊措辞"),
    ],
    corrections: [
      {
        ruleId: "L001",
        originalStatus: "FAIL",
        correctedTo: "PASS",
        reason: "COA 使用总结论，且总结论与全部定量项目结果一致，按既有豁免规则保留为 PASS。",
      },
    ],
  },
  {
    id: "detection-limit-coa",
    description: "检测限 COA 样例，验证 N001/R002/R004 不再依赖 Phase 5 修正。",
    docType: "COA",
    sourceFilePath: "fixtures/detection-limit-coa.md",
    markdownText: [
      "# Detection Limit COA",
      "",
      "- 报告编号: detection-limit-coa",
      "- 批号: DL202604001",
      "- 品名: 人血白蛋白原液",
      "- 规格: 20%",
      "- 标准: HLGF/2-ZLBZ-ZJP-01",
      "- 检测项目: 残余乙醇含量",
      "- 标准规定: <0.025%",
      "- 结果: <0.025%",
      "- 结论: 符合规定",
    ].join("\n"),
    docExtract: {
      docType: "COA",
      reportInfo: {
        reportNo: "detection-limit-coa",
        reportDate: "2026-04-15",
      },
      sampleInfo: {
        batchNo: "DL202604001",
        productName: "人血白蛋白原液",
        specification: "20%",
        batchSize: "12ml",
      },
      dates: {
        testDate: "2026-04-15",
        reviewDate: "2026-04-15",
        approveDate: "2026-04-15",
        reportDate: "2026-04-15",
      },
      signatures: [
        { role: "tester", name: "韩梅", date: "2026-04-15" },
        { role: "reviewer", name: "王斌", date: "2026-04-15" },
        { role: "approver", name: "王斌", date: "2026-04-15" },
      ],
      testItems: [
        {
          itemName: "残余乙醇含量",
          testType: "quantitative",
          specification: "<0.025%",
          specUpper: 0.025,
          specOperator: "<",
          result: "<0.025%",
          resultNumeric: 0.025,
          unit: "%",
          significantDigits: 2,
          isDetectionLimit: true,
          conclusion: "符合规定",
        },
      ],
      instruments: [],
      personnel: [
        { name: "韩梅", role: "tester" },
        { name: "王斌", role: "reviewer" },
      ],
      modifications: [],
      standardRef: "HLGF/2-ZLBZ-ZJP-01",
      totalPages: 1,
    },
    semanticResults: [
      semanticSkip("N002", "结果在可选结果内", "severe", "无定性检测项目"),
      semanticSkip("E001", "人员资质校验", "severe", "不适用于 COA"),
      semanticSkip("E002", "仪器编号匹配", "severe", "不适用于 COA"),
      semanticPass("S002", "电子签名合规", "severe", "sign 审计轨迹字段完整，且 completed workflow 步骤均有对应留痕"),
      semanticPass("S003", "禁止代签", "severe", "当前批次 sign 记录中的 user/account 映射保持一一稳定"),
      semanticSkip("D001", "修改规范", "severe", "不适用于 COA"),
      semanticPass("D002", "原始数据可追溯", "severe", "原始数据索引可回溯到批次和日期"),
      semanticPass("D003", "无缺失页面", "severe", "页数与原始数据索引一致"),
      semanticPass("L002", "跨页数据一致", "warning", "单页样例，无跨页不一致风险"),
      semanticSkip("L003", "计算公式正确", "severe", "不适用于 COA"),
      semanticPass("C001", "结论规范", "warning", "结论格式符合模板要求"),
      semanticPass("C002", "无歧义表述", "info", "结论措辞清晰明确"),
    ],
    corrections: [],
  },
  {
    id: "eln-with-complete-workflow",
    description: "ELN 完整 workflow 样例，覆盖 ELN 专用 deterministic 规则与全链路输出。",
    docType: "ELN",
    sourceFilePath: "fixtures/eln-with-complete-workflow.md",
    markdownText: [
      "# ELN Minimal Regression",
      "",
      "- 报告编号: eln-with-complete-workflow",
      "- 批号: B202604034",
      "- 品名: 人血白蛋白原液",
      "- 规格: 20%",
      "- 检测日期: 2026-04-04",
      "- 标准: HLGF/2-ZLBZ-ZJP-01",
      "- 检测项目: 蛋白质含量 / pH值 / 残余乙醇含量",
      "- 审核流程: tester -> reviewer -> approver 全部 completed",
    ].join("\n"),
    docExtract: {
      docType: "ELN",
      reportInfo: {
        reportNo: "eln-with-complete-workflow",
        reportDate: "2026-04-04",
      },
      sampleInfo: {
        batchNo: "B202604034",
        productName: "人血白蛋白原液",
        specification: "20%",
        batchSize: "12ml",
      },
      dates: {
        testDate: "2026-04-04",
        reviewDate: "2026-04-04",
        approveDate: "2026-04-04",
        reportDate: "2026-04-04",
      },
      signatures: [
        { role: "tester", name: "王斌", date: "2026-04-04" },
        { role: "reviewer", name: "韩梅", date: "2026-04-04" },
        { role: "approver", name: "韩梅", date: "2026-04-04" },
      ],
      testItems: [
        {
          itemName: "蛋白质含量",
          testType: "quantitative",
          specification: ">200.0 g/L",
          specLower: 200,
          specOperator: ">",
          result: "210.0 g/L",
          resultNumeric: 210,
          unit: "g/L",
          significantDigits: 4,
          conclusion: "符合规定",
        },
        {
          itemName: "pH值",
          testType: "quantitative",
          specification: "6.40~7.40",
          specLower: 6.4,
          specUpper: 7.4,
          specOperator: "≥/≤",
          result: "6.80",
          resultNumeric: 6.8,
          unit: "",
          significantDigits: 3,
          conclusion: "符合规定",
        },
        {
          itemName: "残余乙醇含量",
          testType: "quantitative",
          specification: "≤0.025%",
          specUpper: 0.025,
          specOperator: "≤",
          result: "<0.025%",
          resultNumeric: 0.025,
          unit: "%",
          significantDigits: 2,
          isDetectionLimit: true,
          conclusion: "符合规定",
        },
      ],
      instruments: [
        { instrumentNo: "1000000602", name: "UV-Vis 分光光度计", calibrationExpiry: "2027-03-31" },
        { instrumentNo: "1000002651", name: "pH 计", calibrationExpiry: "2027-03-31" },
        { instrumentNo: "1000002762", name: "干燥箱", calibrationExpiry: "2027-03-31" },
      ],
      environment: {
        temperature: 23,
        humidity: 45,
      },
      personnel: [
        { name: "王斌", role: "tester" },
        { name: "韩梅", role: "reviewer" },
        { name: "韩梅", role: "approver" },
      ],
      modifications: [],
      standardRef: "HLGF/2-ZLBZ-ZJP-01",
      totalPages: 8,
    },
    semanticResults: [
      semanticSkip("N002", "结果在可选结果内", "severe", "无定性检测项目"),
      semanticPass("E001", "人员资质校验", "severe", "检测人与审核人资质均在有效期内"),
      semanticPass("E002", "仪器编号匹配", "severe", "仪器使用记录与 ELN 中仪器编号一致"),
      semanticPass("S002", "电子签名合规", "severe", "sign 审计轨迹字段完整，且 completed workflow 步骤均有对应留痕"),
      semanticPass("S003", "禁止代签", "severe", "当前批次 sign 记录中的 user/account 映射保持一一稳定"),
      semanticPass("D001", "修改规范", "severe", "未发现未说明原因的修改记录"),
      semanticPass("D002", "原始数据可追溯", "severe", "原始数据索引可回溯到日志、图谱和序列"),
      semanticPass("D003", "无缺失页面", "severe", "页数与原始数据索引一致"),
      semanticPass("L002", "跨页数据一致", "warning", "跨页样品信息前后一致"),
      semanticPass("L003", "计算公式正确", "severe", "公式和换算逻辑一致"),
      semanticSkip("C001", "结论规范", "warning", "不适用于 ELN"),
      semanticPass("C002", "无歧义表述", "info", "ELN 表述清晰，无模糊措辞"),
    ],
    corrections: [],
  },
]
