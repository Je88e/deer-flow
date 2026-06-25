import { describe, expect, it } from "vitest"

import {
  evaluateS002,
  evaluateS003,
} from "../semantic-signature-rules.ts"

function sign(user: string, account: string, timestamp = "2026-04-04T10:00:00"): {
  action: "sign"
  user: string
  account: string
  timestamp: string
} {
  return { action: "sign", user, account, timestamp }
}

describe("semantic signature rule contracts", () => {
  it("S002 在没有 sign 审计轨迹时 FAIL", () => {
    const result = evaluateS002([], null)

    expect(result.status).toBe("FAIL")
  })

  it("S002 在 completed workflow 步骤数大于 sign 记录数时 FAIL", () => {
    const result = evaluateS002(
      [
        sign("王斌", "wangbin"),
        sign("韩梅", "hanmei"),
      ],
      {
        steps: [
          { role: "tester", status: "completed" },
          { role: "reviewer", status: "completed" },
          { role: "approver", status: "completed" },
        ],
      }
    )

    expect(result.status).toBe("FAIL")
  })

  it("S002 在 sign 留痕完整且不少于 completed workflow 步骤数时 PASS", () => {
    const result = evaluateS002(
      [
        sign("王斌", "wangbin"),
        sign("韩梅", "hanmei"),
        sign("韩梅", "hanmei", "2026-04-04T16:00:00"),
      ],
      {
        steps: [
          { role: "tester", status: "completed" },
          { role: "reviewer", status: "completed" },
          { role: "approver", status: "completed" },
        ],
      }
    )

    expect(result.status).toBe("PASS")
  })

  it("S003 在 sign 记录保持 user/account 一一映射时 PASS", () => {
    const result = evaluateS003([
      sign("王斌", "wangbin"),
      sign("韩梅", "hanmei"),
      sign("韩梅", "hanmei", "2026-04-04T16:00:00"),
    ])

    expect(result.status).toBe("PASS")
  })

  it("S003 在同一 account 对应多个 user 时 FAIL", () => {
    const result = evaluateS003([
      sign("王斌", "shared"),
      sign("韩梅", "shared", "2026-04-04T16:00:00"),
    ])

    expect(result.status).toBe("FAIL")
  })

  it("S003 在同一 user 对应多个 account 时 FAIL", () => {
    const result = evaluateS003([
      sign("王斌", "wangbin"),
      sign("王斌", "wangbin-review", "2026-04-04T16:00:00"),
    ])

    expect(result.status).toBe("FAIL")
  })
})
