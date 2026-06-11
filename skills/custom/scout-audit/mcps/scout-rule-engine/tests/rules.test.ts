import { describe, expect, it } from "vitest"

import { runSingleRule } from "../src/rules.ts"

function createDocExtract(overrides: Record<string, unknown> = {}) {
  return {
    docType: "COA",
    sampleInfo: {
      batchNo: "A408H0001",
      productName: "人血白蛋白",
      specification: "20%",
      quantity: "1000 支",
    },
    signatures: [
      { role: "tester", name: "Alice", date: "2026-04-15" },
      { role: "reviewer", name: "Bob", date: "2026-04-16" },
      { role: "approver", name: "Carol", date: "2026-04-17" },
    ],
    testItems: [
      {
        itemName: "残余乙醇",
        testType: "quantitative",
        result: "0.020%",
        resultNumeric: 0.02,
        specUpper: 0.025,
        specOperator: "≤",
        significantDigits: 3,
        unit: "%",
        conclusion: "符合规定",
      },
    ],
    ...overrides,
  }
}

function createWorkflowStep(
  role: string,
  status: "completed" | "pending" | "skipped",
  overrides: Record<string, unknown> = {}
) {
  return {
    role,
    status,
    completedAt: status === "completed" ? `2026-04-1${role.length}T10:00:00Z` : null,
    signatureValid: true,
    ...overrides,
  }
}

function createLimsData(overrides: Record<string, unknown> = {}) {
  return {
    requestForm: {
      requiredTestItems: [
        {
          itemName: "残余乙醇",
          significantDigits: 3,
          unit: "%",
        },
      ],
    },
    workflow: {
      currentStep: "completed",
      steps: [
        createWorkflowStep("tester", "completed"),
        createWorkflowStep("reviewer", "completed"),
        createWorkflowStep("approver", "completed"),
      ],
    },
    ...overrides,
  }
}

describe("scout-rule-engine regression coverage", () => {
  it("S001 在三角色完整签名时 PASS", () => {
    const result = runSingleRule("S001", createDocExtract(), createLimsData(), "COA")

    expect(result.status).toBe("PASS")
  })

  it("S001 在 reviewer/approver 为空签名时 FAIL", () => {
    const docExtract = createDocExtract({
      signatures: [
        { role: "tester", name: "Alice", date: "2026-04-15" },
        { role: "reviewer", name: "", date: "" },
        { role: "approver", name: "", date: "" },
      ],
    })

    const result = runSingleRule("S001", docExtract, createLimsData(), "COA")

    expect(result.status).toBe("FAIL")
  })

  it("S001 在 image 签名场景不误判缺签", () => {
    const docExtract = createDocExtract({
      signatures: [
        { role: "tester", name: "Alice", date: "2026-04-15" },
        { role: "reviewer", name: null, date: "2026-04-16", signatureMethod: "image" },
        { role: "approver", name: null, date: "2026-04-17", signatureMethod: "image" },
      ],
    })

    const result = runSingleRule("S001", docExtract, createLimsData(), "COA")

    expect(result.status).toBe("PASS")
  })

  it("S004 在 workflow 为 null 时 SKIP", () => {
    const result = runSingleRule(
      "S004",
      createDocExtract(),
      createLimsData({ workflow: null }),
      "COA"
    )

    expect(result.status).toBe("SKIP")
  })

  it("S004 在 approver 未 completed 时 FAIL", () => {
    const result = runSingleRule(
      "S004",
      createDocExtract(),
      createLimsData({
        workflow: {
          currentStep: "approver",
          steps: [
            createWorkflowStep("tester", "completed"),
            createWorkflowStep("reviewer", "completed"),
            createWorkflowStep("approver", "pending"),
          ],
        },
      }),
      "COA"
    )

    expect(result.status).toBe("FAIL")
  })

  it("detection limit 在 N001/R002/R004 下按契约豁免", () => {
    const docExtract = createDocExtract({
      testItems: [
        {
          itemName: "残余乙醇",
          testType: "quantitative",
          result: "<0.025%",
          resultNumeric: 0.025,
          specUpper: 0.025,
          specOperator: "<",
          significantDigits: 2,
          unit: "%",
          isDetectionLimit: true,
          conclusion: "符合规定",
        },
      ],
    })

    const limsData = createLimsData({
      requestForm: {
        requiredTestItems: [
          {
            itemName: "残余乙醇",
            significantDigits: 2,
            unit: "%",
          },
        ],
      },
    })

    expect(runSingleRule("N001", docExtract, limsData, "COA").status).toBe("PASS")
    expect(runSingleRule("R002", docExtract, limsData, "COA").status).toBe("PASS")
    expect(runSingleRule("R004", docExtract, limsData, "COA").status).toBe("PASS")
  })

  it("B001 在 batchNo 为空但 resolvedBatchNo 有效时 PASS", () => {
    const docExtract = createDocExtract({
      sampleInfo: {
        batchNo: "",
        resolvedBatchNo: "B2025051101",
        productName: "注射用水",
        specification: "液体",
        quantity: "6份",
      },
    })

    const result = runSingleRule("B001", docExtract, createLimsData(), "ELN")

    expect(result.status).toBe("PASS")
    expect(result.details).toContain("Phase 3.5 解析")
  })

  it("B001 在 batchNo 和 resolvedBatchNo 均为空时 FAIL", () => {
    const docExtract = createDocExtract({
      sampleInfo: {
        batchNo: "",
        resolvedBatchNo: "",
        productName: "注射用水",
        specification: "液体",
        quantity: "6份",
      },
    })

    const result = runSingleRule("B001", docExtract, createLimsData(), "ELN")

    expect(result.status).toBe("FAIL")
  })

  it("L001 在 detection limit 合格且结论为符合规定时 PASS", () => {
    const docExtract = createDocExtract({
      testItems: [
        {
          itemName: "残余乙醇",
          testType: "quantitative",
          result: "<0.025%",
          resultNumeric: 0.025,
          specUpper: 0.025,
          specOperator: "<",
          significantDigits: 2,
          unit: "%",
          isDetectionLimit: true,
          conclusion: "符合规定",
        },
      ],
    })

    const result = runSingleRule("L001", docExtract, createLimsData(), "COA")

    expect(result.status).toBe("PASS")
  })
})
