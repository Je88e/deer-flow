export interface AuditTrailEntryLike {
  action?: unknown
  user?: unknown
  account?: unknown
  timestamp?: unknown
}

export interface WorkflowLike {
  steps?: Array<{
    status?: unknown
  }>
}

export interface SignatureSemanticRuleResult {
  ruleId: "S002" | "S003"
  ruleName: string
  status: "PASS" | "FAIL"
  severity: "severe"
  details: string
  evidence?: {
    expected?: string
    actual?: string
    location?: string
  }
  remediation: string
}

function fail(
  ruleId: "S002" | "S003",
  ruleName: string,
  details: string,
  expected: string,
  actual: string,
  remediation: string,
  location?: string
): SignatureSemanticRuleResult {
  return {
    ruleId,
    ruleName,
    status: "FAIL",
    severity: "severe",
    details,
    evidence: { expected, actual, ...(location ? { location } : {}) },
    remediation,
  }
}

function pass(
  ruleId: "S002" | "S003",
  ruleName: string,
  details: string
): SignatureSemanticRuleResult {
  return {
    ruleId,
    ruleName,
    status: "PASS",
    severity: "severe",
    details,
    remediation: "",
  }
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function signEntries(auditTrail: AuditTrailEntryLike[] | null | undefined): AuditTrailEntryLike[] {
  return Array.isArray(auditTrail)
    ? auditTrail.filter((entry) => entry?.action === "sign")
    : []
}

function completedWorkflowSteps(workflow: WorkflowLike | null | undefined): number {
  return Array.isArray(workflow?.steps)
    ? workflow.steps.filter((step) => step?.status === "completed").length
    : 0
}

export function evaluateS002(
  auditTrail: AuditTrailEntryLike[] | null | undefined,
  workflow: WorkflowLike | null | undefined
): SignatureSemanticRuleResult {
  const signs = signEntries(auditTrail)
  if (signs.length === 0) {
    return fail(
      "S002",
      "电子签名合规",
      "未发现 sign 审计轨迹，无法证明电子签名留痕完整",
      "至少存在 1 条 action=sign 且包含 user/account/timestamp 的记录",
      "auditTrail 中无 sign 记录",
      "补充带 user/account/timestamp 的 sign 审计轨迹",
      "auditTrail"
    )
  }

  const incompleteIndexes = signs.flatMap((entry, index) => {
    const missingFields = [
      normalizeText(entry.user) === "" ? "user" : "",
      normalizeText(entry.account) === "" ? "account" : "",
      normalizeText(entry.timestamp) === "" ? "timestamp" : "",
    ].filter(Boolean)

    return missingFields.length > 0 ? [`sign[${index}]: ${missingFields.join("/")}`] : []
  })

  if (incompleteIndexes.length > 0) {
    return fail(
      "S002",
      "电子签名合规",
      "存在字段不完整的 sign 审计轨迹",
      "每条 sign 记录都应包含 user/account/timestamp",
      incompleteIndexes.join("; "),
      "补全缺失的签名账号、签署人和时间戳",
      "auditTrail"
    )
  }

  const completedSteps = completedWorkflowSteps(workflow)
  if (completedSteps > 0 && completedSteps > signs.length) {
    return fail(
      "S002",
      "电子签名合规",
      "completed workflow 步骤数大于 sign 审计轨迹数",
      "每个 completed workflow 步骤都应有对应 sign 记录",
      `completedSteps=${completedSteps}, signRecords=${signs.length}`,
      "补齐缺失的 sign 审计轨迹，或修正 workflow 完成状态",
      "workflow"
    )
  }

  return pass(
    "S002",
    "电子签名合规",
    `发现 ${signs.length} 条完整 sign 留痕，满足最小电子签名审计要求`
  )
}

export function evaluateS003(
  auditTrail: AuditTrailEntryLike[] | null | undefined
): SignatureSemanticRuleResult {
  const signs = signEntries(auditTrail)
  if (signs.length === 0) {
    return fail(
      "S003",
      "禁止代签",
      "未发现 sign 审计轨迹，无法验证 user/account 映射稳定性",
      "至少存在 1 条 action=sign 且可建立 user/account 映射的记录",
      "auditTrail 中无 sign 记录",
      "补充 sign 审计轨迹后再验证 user/account 映射",
      "auditTrail"
    )
  }

  const userByAccount = new Map<string, Set<string>>()
  const accountByUser = new Map<string, Set<string>>()

  for (const entry of signs) {
    const user = normalizeText(entry.user)
    const account = normalizeText(entry.account)

    if (user === "" || account === "") {
      return fail(
        "S003",
        "禁止代签",
        "存在无法建立映射的 sign 审计轨迹",
        "每条 sign 记录都应包含非空 user/account",
        `user=${user || "<empty>"}, account=${account || "<empty>"}`,
        "补全 sign 记录中的 user/account 字段",
        "auditTrail"
      )
    }

    if (!userByAccount.has(account)) userByAccount.set(account, new Set<string>())
    if (!accountByUser.has(user)) accountByUser.set(user, new Set<string>())
    userByAccount.get(account)?.add(user)
    accountByUser.get(user)?.add(account)
  }

  const multiUserAccount = [...userByAccount.entries()].find(([, users]) => users.size > 1)
  if (multiUserAccount) {
    return fail(
      "S003",
      "禁止代签",
      "同一账号对应多个签署人，user/account 映射不稳定",
      "每个 account 在同一批次内只对应一个 user",
      `${multiUserAccount[0]} -> ${[...multiUserAccount[1]].join(", ")}`,
      "拆分共享账号并改为个人实名账号签署",
      "auditTrail"
    )
  }

  const multiAccountUser = [...accountByUser.entries()].find(([, accounts]) => accounts.size > 1)
  if (multiAccountUser) {
    return fail(
      "S003",
      "禁止代签",
      "同一签署人对应多个账号，user/account 映射不稳定",
      "每个 user 在同一批次内只对应一个 account",
      `${multiAccountUser[0]} -> ${[...multiAccountUser[1]].join(", ")}`,
      "核对签署账号并保持单人单账号映射",
      "auditTrail"
    )
  }

  return pass(
    "S003",
    "禁止代签",
    `发现 ${signs.length} 条 sign 记录，user/account 映射保持一一稳定`
  )
}
