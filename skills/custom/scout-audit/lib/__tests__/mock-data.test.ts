import { describe, expect, it } from "vitest"

import {
  getMockAllLimsData,
  getMockApprovalWorkflow,
} from "../mock-data.ts"

const VALID_ROLES = new Set(["tester", "reviewer", "approver", "release"])
const VALID_STATUSES = new Set(["pending", "completed", "skipped"])

describe("scout-audit lims mock boundary fixtures", () => {
  it("getMockApprovalWorkflow 对新增缺 approver 样本返回预期结构", () => {
    const workflow = getMockApprovalWorkflow("S004-missing-approver-step")

    expect(workflow).not.toBeNull()
    expect(workflow?.steps.map((step) => step.role)).toEqual(["tester", "reviewer"])
    expect(workflow?.steps.some((step) => step.role === "approver")).toBe(false)
  })

  it("缺失 workflow 时稳定返回 null", () => {
    expect(getMockApprovalWorkflow("missing-report-no")).toBeNull()
  })

  it("新增 workflow 样本满足 schema 契约", () => {
    const sampleIds = [
      "S001-empty-reviewer-approver",
      "S001-image-signature",
      "detection-limit-coa",
      "eln-with-complete-workflow",
    ]

    for (const sampleId of sampleIds) {
      const workflow = getMockApprovalWorkflow(sampleId)

      expect(workflow, sampleId).not.toBeNull()
      expect(workflow?.steps.length, sampleId).toBeGreaterThan(0)
      expect(workflow?.totalSteps, sampleId).toBeGreaterThanOrEqual(workflow?.steps.length ?? 0)

      workflow?.steps.forEach((step) => {
        expect(VALID_ROLES.has(step.role), `${sampleId}:${step.role}`).toBe(true)
        expect(VALID_STATUSES.has(step.status), `${sampleId}:${step.status}`).toBe(true)
      })
    }
  })

  it("detection-limit 样本通过聚合接口返回严格上限规范与 workflow", () => {
    const limsData = getMockAllLimsData(
      "DL202604001",
      "detection-limit-coa",
      "HLGF/2-ZLBZ-ZJP-01",
      [],
      [],
      "2026-04-15",
      "COA",
      []
    )

    const requestForm = limsData.requestForm as { requiredTestItems?: Array<{ itemName: string; specOperator?: string; specUpper?: number }> } | null
    const workflow = limsData.workflow as { steps?: Array<{ role: string }> } | null
    const auditTrail = limsData.auditTrail as Array<{ action: string; user: string; account: string }> | null

    expect(requestForm?.requiredTestItems?.[0]?.itemName).toBe("残余乙醇含量")
    expect(requestForm?.requiredTestItems?.[0]?.specOperator).toBe("<")
    expect(requestForm?.requiredTestItems?.[0]?.specUpper).toBe(0.025)
    expect(workflow?.steps?.map((step) => step.role)).toEqual(["tester", "reviewer", "approver"])
    expect(auditTrail?.filter((entry) => entry.action === "sign")).toHaveLength(3)
    expect(auditTrail?.every((entry) => entry.user && entry.account)).toBe(true)
  })
})
