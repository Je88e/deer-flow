import {
  roundHalfToEven,
  rsd,
  checkRange,
  countSignificantDigits,
  countDecimalPlaces,
  countIntegerDigits,
  detectionLimitWithinSpec,
  getRequiredSignatureRoles,
  isDetectionLimitItem,
  isImageSignature,
  isMissingSignature,
} from "./algorithms.js"

export interface RuleResult {
  ruleId: string
  ruleName: string
  status: "PASS" | "FAIL" | "SKIP"
  severity: "severe" | "warning" | "info"
  details: string
  evidence?: { expected?: string; actual?: string }
  remediation: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = any

interface RuleDef {
  name: string
  severity: "severe" | "warning" | "info"
  applicable: ("ELN" | "COA")[]
  execute: (docExtract: Obj, limsData: Obj, docType: "ELN" | "COA") => RuleResult
}

function pass(ruleId: string, name: string, severity: RuleResult["severity"], details: string): RuleResult {
  return { ruleId, ruleName: name, status: "PASS", severity, details, remediation: "" }
}

function fail(
  ruleId: string, name: string, severity: RuleResult["severity"],
  details: string, expected: string, actual: string, remediation: string
): RuleResult {
  return { ruleId, ruleName: name, status: "FAIL", severity, details, evidence: { expected, actual }, remediation }
}

function skip(ruleId: string, name: string, severity: RuleResult["severity"], reason: string): RuleResult {
  return { ruleId, ruleName: name, status: "SKIP", severity, details: reason, remediation: "" }
}

// --- 20 Deterministic Rules ---

const B001: RuleDef = {
  name: "样品批号准确",
  severity: "severe",
  applicable: ["ELN", "COA"],
  execute(docExtract) {
    const batchNo: string = docExtract?.sampleInfo?.batchNo ?? ""
    const resolved: string = docExtract?.sampleInfo?.resolvedBatchNo ?? ""
    const effectiveBatchNo = batchNo || resolved
    if (!effectiveBatchNo)
      return fail("B001", "样品批号准确", "severe",
        "样品批号为空且无解析批号",
        "非空批号", "空",
        "补全规范样品编号，或在 joint 审核中通过 Phase 3.5 解析批号")
    if (!/^[A-Za-z0-9]+$/.test(effectiveBatchNo))
      return fail("B001", "样品批号准确", "severe",
        `批号格式不合规: ${effectiveBatchNo}`,
        "字母+数字", effectiveBatchNo,
        "补全规范样品编号")
    const source = batchNo ? "直接" : "Phase 3.5 解析"
    return pass("B001", "样品批号准确", "severe",
      `批号 ${effectiveBatchNo} 格式正确 (${source}来源)`)
  },
}

const B002: RuleDef = {
  name: "产品信息完整",
  severity: "severe",
  applicable: ["ELN", "COA"],
  execute(docExtract, limsData) {
    const si = docExtract?.sampleInfo
    const rf = limsData?.requestForm
    if (!si || !rf) return skip("B002", "产品信息完整", "severe", "缺少请验单数据")
    const fields = ["productName", "specification", "quantity"] as const
    for (const f of fields) {
      if (!si[f]) return fail("B002", "产品信息完整", "severe", `字段 ${f} 缺失`, `${f} 必填`, "空", "补全缺失信息")
      if (rf[f] && si[f] !== rf[f])
        return fail("B002", "产品信息完整", "severe", `${f} 不一致`, rf[f], si[f], "核实并修正")
    }
    return pass("B002", "产品信息完整", "severe", "产品信息与请验单一致")
  },
}

const B003: RuleDef = {
  name: "检测项目完整",
  severity: "severe",
  applicable: ["ELN", "COA"],
  execute(docExtract, limsData) {
    const rf = limsData?.requestForm
    if (!rf?.requiredTestItems) return skip("B003", "检测项目完整", "severe", "缺少请验单检测项目数据")
    const actual = new Set((docExtract?.testItems ?? []).map((t: Obj) => t.itemName))
    const required = rf.requiredTestItems.map((t: Obj) => t.itemName) as string[]
    const missing = required.filter((r) => !actual.has(r))
    if (missing.length > 0)
      return fail("B003", "检测项目完整", "severe", `缺少检测项: ${missing.join(", ")}`, required.join(", "), [...actual].join(", "), "补充漏检项目")
    return pass("B003", "检测项目完整", "severe", `全部 ${required.length} 项检测项目完整`)
  },
}

const B004: RuleDef = {
  name: "日期逻辑正确",
  severity: "severe",
  applicable: ["ELN", "COA"],
  execute(docExtract) {
    const d = docExtract?.dates
    if (!d) return skip("B004", "日期逻辑正确", "severe", "缺少日期数据")
    const dates = [d.testDate, d.reviewDate, d.approveDate, d.reportDate].filter(Boolean)
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] < dates[i - 1])
        return fail("B004", "日期逻辑正确", "severe", `${dates[i - 1]} 应 ≤ ${dates[i]}`, "检测≤复核≤审核≤报告", `${dates.join(" < ")}`, "修正日期顺序")
    }
    return pass("B004", "日期逻辑正确", "severe", "日期顺序正确")
  },
}

const B005: RuleDef = {
  name: "报告编号唯一",
  severity: "severe",
  applicable: ["COA"],
  execute(_docExtract, limsData) {
    const ru = limsData?.reportUnique
    if (!ru) return skip("B005", "报告编号唯一", "severe", "缺少报告唯一性数据")
    if (!ru.unique)
      return fail("B005", "报告编号唯一", "severe", "报告编号重复", "唯一", `重复: ${ru.duplicates?.map((d: Obj) => d.reportNo).join(", ") ?? "?"}`, "重新编号并归档")
    return pass("B005", "报告编号唯一", "severe", "报告编号唯一")
  },
}

const N001: RuleDef = {
  name: "结果在标准限度内",
  severity: "severe",
  applicable: ["ELN", "COA"],
  execute(docExtract, limsData) {
    const items = (docExtract?.testItems ?? []).filter((t: Obj) => t.testType === "quantitative" && t.resultNumeric !== undefined && t.resultNumeric !== null)
    if (items.length === 0) return skip("N001", "结果在标准限度内", "severe", "无定量检测项")
    const failures: string[] = []
    for (const item of items) {
      const ok = isDetectionLimitItem(item)
        ? detectionLimitWithinSpec(item)
        : checkRange(item.resultNumeric, item.specLower, item.specUpper, item.specOperator)
      if (!ok) failures.push(`${item.itemName}: ${item.resultNumeric} 不在 ${item.specLower ?? ""}${item.specOperator ?? ""}${item.specUpper ?? ""} 范围内`)
    }
    if (failures.length > 0)
      return fail("N001", "结果在标准限度内", "severe", failures.join("; "), "结果在标准范围内", failures.join("; "), "复测/确认超标原因")
    return pass("N001", "结果在标准限度内", "severe", `${items.length} 项定量结果均在标准范围内`)
  },
}

const R001: RuleDef = {
  name: "有效数字位数正确",
  severity: "warning",
  applicable: ["ELN", "COA"],
  execute(docExtract, limsData) {
    const items = (docExtract?.testItems ?? []).filter((t: Obj) => t.testType === "quantitative")
    const reqItems = limsData?.requestForm?.requiredTestItems
    if (!reqItems) return skip("R001", "有效数字位数正确", "warning", "缺少请验单数据")
    const failures: string[] = []
    for (const item of items) {
      if (isDetectionLimitItem(item)) continue
      const req = reqItems.find((r: Obj) => r.itemName === item.itemName)
      if (!req?.significantDigits || !item.significantDigits) continue
      if (item.significantDigits !== req.significantDigits)
        failures.push(`${item.itemName}: 实际 ${item.significantDigits} 位, 标准 ${req.significantDigits} 位`)
    }
    if (failures.length > 0)
      return fail("R001", "有效数字位数正确", "warning", failures.join("; "), "与标准一致", failures.join("; "), "按标准修约")
    return pass("R001", "有效数字位数正确", "warning", "有效数字位数正确")
  },
}

const R002: RuleDef = {
  name: "修约方式正确",
  severity: "warning",
  applicable: ["ELN", "COA"],
  execute(docExtract) {
    const items = (docExtract?.testItems ?? []).filter((t: Obj) => t.testType === "quantitative" && t.resultNumeric !== undefined && t.resultNumeric !== null)
    if (items.length === 0) return skip("R002", "修约方式正确", "warning", "无定量检测项")
    const failures: string[] = []
    for (const item of items) {
      if (isDetectionLimitItem(item)) continue
      if (!item.significantDigits) continue
      const digits = item.significantDigits - countIntegerDigits(item.resultNumeric)
      const decimalPlaces = Math.max(0, digits)
      const rounded = roundHalfToEven(item.resultNumeric, decimalPlaces)
      if (Math.abs(rounded - item.resultNumeric) > 1e-8)
        failures.push(`${item.itemName}: ${item.resultNumeric} 未按四舍六入五成双修约为 ${rounded}`)
    }
    if (failures.length > 0)
      return fail("R002", "修约方式正确", "warning", failures.join("; "), "四舍六入五成双修约", failures.join("; "), "重新修约")
    return pass("R002", "修约方式正确", "warning", "修约方式正确")
  },
}

const R003: RuleDef = {
  name: "单位统一规范",
  severity: "warning",
  applicable: ["ELN", "COA"],
  execute(docExtract, limsData) {
    const items = (docExtract?.testItems ?? []).filter((t: Obj) => t.testType === "quantitative")
    const reqItems = limsData?.requestForm?.requiredTestItems
    if (!reqItems) return skip("R003", "单位统一规范", "warning", "缺少请验单数据")
    const failures: string[] = []
    for (const item of items) {
      const req = reqItems.find((r: Obj) => r.itemName === item.itemName)
      if (!req?.unit) continue
      if (item.unit && item.unit !== req.unit)
        failures.push(`${item.itemName}: 实际 "${item.unit}", 标准 "${req.unit}"`)
    }
    if (failures.length > 0)
      return fail("R003", "单位统一规范", "warning", failures.join("; "), "与标准一致", failures.join("; "), "统一单位")
    return pass("R003", "单位统一规范", "warning", "单位统一规范")
  },
}

const R004: RuleDef = {
  name: "数值无多余小数",
  severity: "info",
  applicable: ["ELN", "COA"],
  execute(docExtract) {
    const items = (docExtract?.testItems ?? []).filter((t: Obj) => t.testType === "quantitative" && t.resultNumeric !== undefined && t.resultNumeric !== null)
    const failures: string[] = []
    for (const item of items) {
      if (isDetectionLimitItem(item)) continue
      if (!item.significantDigits) continue
      const intDigits = countIntegerDigits(item.resultNumeric)
      const maxDecimals = Math.max(0, item.significantDigits - intDigits)
      const actualDecimals = countDecimalPlaces(String(item.resultNumeric))
      if (actualDecimals > maxDecimals)
        failures.push(`${item.itemName}: ${item.resultNumeric} 有 ${actualDecimals} 位小数, 允许 ${maxDecimals} 位`)
    }
    if (failures.length > 0)
      return fail("R004", "数值无多余小数", "info", failures.join("; "), `≤${failures.length > 0 ? "标准位数" : "?"}`, failures.join("; "), "删除多余小数")
    return pass("R004", "数值无多余小数", "info", "无数值多余小数")
  },
}

const P001: RuleDef = {
  name: "平行样相对偏差合格",
  severity: "severe",
  applicable: ["ELN"],
  execute(docExtract, limsData) {
    const items = docExtract?.testItems ?? []
    const reqItems = limsData?.requestForm?.requiredTestItems
    const groups: Record<string, Obj[]> = {}
    for (const item of items) {
      if (item.isParallel && item.parallelGroup) {
        if (!groups[item.parallelGroup]) groups[item.parallelGroup] = []
        groups[item.parallelGroup].push(item)
      }
    }
    const groupList = Object.entries(groups)
    if (groupList.length === 0) return skip("P001", "平行样相对偏差合格", "severe", "无平行样数据")
    const failures: string[] = []
    for (const [groupId, groupItems] of groupList) {
      const values = groupItems.map((i: Obj) => i.resultNumeric).filter((v: unknown): v is number => v !== undefined && v !== null)
      if (values.length < 2) continue
      const calcRsd = rsd(values)
      const itemName = groupItems[0]?.itemName ?? groupId
      const req = reqItems?.find((r: Obj) => r.itemName === itemName)
      const limit = req?.rsdLimit ?? 2.0
      if (calcRsd > limit)
        failures.push(`${itemName}: RSD=${calcRsd.toFixed(2)}% > ${limit}%`)
    }
    if (failures.length > 0)
      return fail("P001", "平行样相对偏差合格", "severe", failures.join("; "), "RSD ≤ 限值", failures.join("; "), "重新实验")
    return pass("P001", "平行样相对偏差合格", "severe", `${groupList.length} 组平行样RSD合格`)
  },
}

const P002: RuleDef = {
  name: "重复性RSD合格",
  severity: "severe",
  applicable: ["ELN"],
  execute(docExtract) {
    const items = docExtract?.testItems ?? []
    const groups: Record<string, number[]> = {}
    for (const item of items) {
      if (item.isParallel && item.parallelGroup && item.resultNumeric !== undefined && item.resultNumeric !== null) {
        if (!groups[item.parallelGroup]) groups[item.parallelGroup] = []
        groups[item.parallelGroup].push(item.resultNumeric)
      }
    }
    const failures: string[] = []
    for (const [groupId, values] of Object.entries(groups)) {
      if (values.length >= 6) {
        const calcRsd = rsd(values)
        if (calcRsd > 2.0) failures.push(`组${groupId}: RSD=${calcRsd.toFixed(2)}% > 2.0%`)
      }
    }
    if (failures.length > 0)
      return fail("P002", "重复性RSD合格", "severe", failures.join("; "), "RSD ≤ 2.0%", failures.join("; "), "排查仪器/进样")
    const nGroups = Object.values(groups).filter((v) => v.length >= 6).length
    if (nGroups === 0) return skip("P002", "重复性RSD合格", "severe", "无6次以上重复数据")
    return pass("P002", "重复性RSD合格", "severe", "重复性RSD合格")
  },
}

const P003: RuleDef = {
  name: "加标回收率合格",
  severity: "severe",
  applicable: ["ELN"],
  execute(docExtract) {
    const items = (docExtract?.testItems ?? []).filter((t: Obj) =>
      t.itemName?.includes("回收率") || t.itemName?.includes("加标")
    )
    if (items.length === 0) return skip("P003", "加标回收率合格", "severe", "无加标回收率数据")
    const failures: string[] = []
    for (const item of items) {
      if (item.resultNumeric !== undefined && item.resultNumeric !== null) {
        if (item.resultNumeric < 80 || item.resultNumeric > 120)
          failures.push(`${item.itemName}: ${item.resultNumeric}% 不在 80%~120%`)
      }
    }
    if (failures.length > 0)
      return fail("P003", "加标回收率合格", "severe", failures.join("; "), "80%~120%", failures.join("; "), "重新前处理")
    return pass("P003", "加标回收率合格", "severe", "加标回收率合格")
  },
}

const E003: RuleDef = {
  name: "仪器在校准期内",
  severity: "severe",
  applicable: ["ELN"],
  execute(_docExtract, limsData) {
    const instruments = limsData?.instruments
    if (!instruments || instruments.length === 0) return skip("E003", "仪器在校准期内", "severe", "无仪器数据")
    const failures: string[] = []
    for (const inst of instruments) {
      if (inst.calibrationStatus !== "valid")
        failures.push(`${inst.name}(${inst.instrumentNo}): ${inst.calibrationStatus}`)
    }
    if (failures.length > 0)
      return fail("E003", "仪器在校准期内", "severe", failures.join("; "), "校准状态 valid", failures.join("; "), "立即校准")
    return pass("E003", "仪器在校准期内", "severe", `${instruments.length} 台仪器均在校准期内`)
  },
}

const E004: RuleDef = {
  name: "环境条件合格",
  severity: "warning",
  applicable: ["ELN"],
  execute(docExtract, limsData) {
    const env = docExtract?.environment
    if (!env) return skip("E004", "环境条件合格", "warning", "无环境条件数据")
    const reqItems = limsData?.requestForm?.requiredTestItems
    if (!reqItems || reqItems.length === 0) return skip("E004", "环境条件合格", "warning", "缺少环境标准数据")
    const envReq = reqItems[0]?.envRequirements
    if (!envReq) return skip("E004", "环境条件合格", "warning", "缺少环境标准数据")
    const failures: string[] = []
    if (env.temperature < envReq.tempMin || env.temperature > envReq.tempMax)
      failures.push(`温度 ${env.temperature}℃ 不在 ${envReq.tempMin}~${envReq.tempMax}℃`)
    if (env.humidity < envReq.humidityMin || env.humidity > envReq.humidityMax)
      failures.push(`湿度 ${env.humidity}% 不在 ${envReq.humidityMin}~${envReq.humidityMax}%`)
    if (failures.length > 0)
      return fail("E004", "环境条件合格", "warning", failures.join("; "), "在标准范围内", failures.join("; "), "记录真实环境/重新实验")
    return pass("E004", "环境条件合格", "warning", `温度 ${env.temperature}℃, 湿度 ${env.humidity}% 合格`)
  },
}

const E005: RuleDef = {
  name: "系统适用性合格",
  severity: "severe",
  applicable: ["ELN"],
  execute(_docExtract, limsData) {
    const ss = limsData?.systemSuit
    if (!ss) return skip("E005", "系统适用性合格", "severe", "无系统适用性数据")
    if (!ss.passed)
      return fail("E005", "系统适用性合格", "severe", "系统适用性测试未通过", "passed=true", "passed=false", "重新平衡系统")
    return pass("E005", "系统适用性合格", "severe", "系统适用性合格")
  },
}

/** Normalize signatures to array format regardless of input shape */
function normalizeSignatures(signatures: Obj): Obj[] {
  if (Array.isArray(signatures)) {
    return signatures.map((signature) => ({
      ...signature,
      role: typeof signature?.role === "string" ? signature.role.toLowerCase() : signature?.role,
    }))
  }
  if (typeof signatures === "object" && signatures !== null) {
    return Object.entries(signatures).map(([role, val]) => {
      if (typeof val === "object" && val !== null) {
        return { role: role.toLowerCase(), ...val }
      }
      return { role: role.toLowerCase(), name: String(val) }
    })
  }
  return []
}


const S001: RuleDef = {
  name: "签名完整",
  severity: "severe",
  applicable: ["ELN", "COA"],
  execute(docExtract, _limsData, docType) {
    const sigs = normalizeSignatures(docExtract?.signatures ?? [])
    const required = getRequiredSignatureRoles(docType)
    const signatureByRole = new Map<string, Obj>()

    for (const signature of sigs) {
      const role = typeof signature?.role === "string" ? signature.role.toLowerCase() : ""
      if (role && !signatureByRole.has(role)) signatureByRole.set(role, signature)
    }

    const missingRoles = required.filter((role) => !signatureByRole.has(role))
    const emptyRoles = required.filter((role) => {
      const signature = signatureByRole.get(role)
      return signature ? isMissingSignature(signature) : false
    })

    if (missingRoles.length > 0 || emptyRoles.length > 0) {
      const actualParts: string[] = []
      if (missingRoles.length > 0) actualParts.push(`缺失角色: ${missingRoles.join(", ")}`)
      if (emptyRoles.length > 0) actualParts.push(`空签名角色: ${emptyRoles.join(", ")}`)

      return fail(
        "S001",
        "签名完整",
        "severe",
        actualParts.join("; "),
        "tester/reviewer/approver 均存在，且非 image 签名需包含 name/date",
        actualParts.join("; "),
        "补全缺失签名，或仅在确认存在图片签名证据时标记 signatureMethod=image"
      )
    }

    const imageRoles = required.filter((role) => {
      const signature = signatureByRole.get(role)
      return signature ? isImageSignature(signature) : false
    })

    if (imageRoles.length > 0)
      return pass("S001", "签名完整", "severe", `签名完整；image 签名豁免角色: ${imageRoles.join(", ")}`)

    return pass("S001", "签名完整", "severe", `签名完整 (${required.join(", ")})`)
  },
}

const S004: RuleDef = {
  name: "审核流程完整",
  severity: "severe",
  applicable: ["COA"],
  execute(_docExtract, limsData) {
    const wf = limsData?.workflow
    if (!wf) return skip("S004", "审核流程完整", "severe", "无审核流程数据")
    const required = ["tester", "reviewer", "approver"]
    const steps = Array.isArray(wf.steps) ? wf.steps.map((step: Obj, index: number) => ({
      ...step,
      index,
      role: typeof step?.role === "string" ? step.role.toLowerCase() : step?.role,
    })) : []

    const stepByRole = new Map<string, Obj>()
    for (const step of steps) {
      if (typeof step.role === "string" && !stepByRole.has(step.role)) stepByRole.set(step.role, step)
    }

    const missingSteps = required.filter((role) => !stepByRole.has(role))
    if (missingSteps.length > 0)
      return fail("S004", "审核流程完整", "severe", `缺少审核步骤: ${missingSteps.join(", ")}`, required.join(" -> "), `缺少: ${missingSteps.join(", ")}`, "补全缺失审核步骤")

    const orderedSteps = required.map((role) => stepByRole.get(role))
    const orderIndexes = orderedSteps.map((step) => step?.index ?? -1)
    const isOutOfOrder = orderIndexes.some((value, index) => index > 0 && value < orderIndexes[index - 1])
    if (isOutOfOrder)
      return fail("S004", "审核流程完整", "severe", "审核顺序异常", "tester -> reviewer -> approver", steps.map((step: Obj) => step.role).join(" -> "), "按规定顺序完成审核")

    const incompleteSteps = required.filter((role) => stepByRole.get(role)?.status !== "completed")
    if (incompleteSteps.length > 0)
      return fail("S004", "审核流程完整", "severe", `存在未完成步骤: ${incompleteSteps.join(", ")}`, "全部 required steps 状态为 completed", incompleteSteps.map((role) => `${role}:${stepByRole.get(role)?.status ?? "missing"}`).join(", "), "完成全部审核步骤")

    const invalidSignatureSteps = required.filter((role) => stepByRole.get(role)?.signatureValid === false)
    if (invalidSignatureSteps.length > 0)
      return fail("S004", "审核流程完整", "severe", `存在签名无效步骤: ${invalidSignatureSteps.join(", ")}`, "signatureValid !== false", invalidSignatureSteps.join(", "), "修复无效签名后重新审核")

    const currentStep = typeof wf.currentStep === "string" ? wf.currentStep.toLowerCase() : ""
    const allowedCurrentSteps = new Set(["", "completed", "complete", "done", "approver"])
    if (!allowedCurrentSteps.has(currentStep))
      return fail("S004", "审核流程完整", "severe", "currentStep 与完成度不一致", "全部完成后 currentStep 应指向 completed 或最终步骤", currentStep || "空", "修正 workflow 当前步骤状态")

    return pass("S004", "审核流程完整", "severe", "审核流程完整")
  },
}

const L001: RuleDef = {
  name: "结果与结论一致",
  severity: "severe",
  applicable: ["ELN", "COA"],
  execute(docExtract) {
    const items = (docExtract?.testItems ?? []).filter((t: Obj) => t.testType === "quantitative" && t.resultNumeric !== undefined && t.resultNumeric !== null)
    if (items.length === 0) return skip("L001", "结果与结论一致", "severe", "无定量检测项")
    const failures: string[] = []
    for (const item of items) {
      const inRange = isDetectionLimitItem(item)
        ? detectionLimitWithinSpec(item)
        : checkRange(item.resultNumeric, item.specLower, item.specUpper, item.specOperator)
      const conclusion: string = item.conclusion ?? ""
      if (inRange && !conclusion.includes("符合"))
        failures.push(`${item.itemName}: 结果合格但结论 "${conclusion}" 未包含"符合"`)
      if (!inRange && !conclusion.includes("不符合") && !conclusion.includes("不符合"))
        failures.push(`${item.itemName}: 结果不合格但结论 "${conclusion}" 未标明"不符合"`)
    }
    if (failures.length > 0)
      return fail("L001", "结果与结论一致", "severe", failures.join("; "), "结果与结论匹配", failures.join("; "), "修正结论")
    return pass("L001", "结果与结论一致", "severe", "结果与结论一致")
  },
}

const L004: RuleDef = {
  name: "标准编号正确",
  severity: "severe",
  applicable: ["ELN"],
  execute(_docExtract, limsData) {
    const std = limsData?.standard
    if (!std) return skip("L004", "标准编号正确", "severe", "无标准数据")
    if (!std.isActive)
      return fail("L004", "标准编号正确", "severe", `标准 ${std.refCode} 非现行`, "isActive=true", "isActive=false", "更新为现行标准")
    return pass("L004", "标准编号正确", "severe", `标准 ${std.refCode} 现行有效`)
  },
}

// --- Rule Map ---

const RULES: Record<string, RuleDef> = {
  B001, B002, B003, B004, B005,
  N001,
  R001, R002, R003, R004,
  P001, P002, P003,
  E003, E004, E005,
  S001, S004,
  L001, L004,
}

export function runAllRules(docExtract: Obj, limsData: Obj, docType: "ELN" | "COA"): RuleResult[] {
  const results: RuleResult[] = []
  for (const [ruleId, rule] of Object.entries(RULES)) {
    if (!rule.applicable.includes(docType)) {
      results.push({ ruleId, ruleName: rule.name, status: "SKIP", severity: rule.severity, details: `不适用于 ${docType}`, remediation: "" })
      continue
    }
    results.push(rule.execute(docExtract, limsData, docType))
  }
  return results
}

export function runSingleRule(ruleId: string, docExtract: Obj, limsData: Obj, docType: "ELN" | "COA"): RuleResult {
  const rule = RULES[ruleId]
  if (!rule) return { ruleId, ruleName: "未知规则", status: "SKIP", severity: "info", details: `规则 ${ruleId} 不存在`, remediation: "" }
  if (!rule.applicable.includes(docType))
    return { ruleId, ruleName: rule.name, status: "SKIP", severity: rule.severity, details: `不适用于 ${docType}`, remediation: "" }
  return rule.execute(docExtract, limsData, docType)
}
