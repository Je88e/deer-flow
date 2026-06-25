// Core mathematical algorithms for deterministic compliance rules

/** 四舍六入五成双 (Round Half To Even / Banker's Rounding) */
export function roundHalfToEven(value: number, digits: number): number {
  const d = Math.pow(10, digits)
  const scaled = value * d
  const floored = Math.floor(scaled)
  const decimal = scaled - floored

  if (Math.abs(decimal - 0.5) < 1e-10) {
    return (floored % 2 === 0 ? floored : floored + 1) / d
  }
  return Math.round(scaled) / d
}

/** RSD (Relative Standard Deviation) as percentage */
export function rsd(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1)
  return (Math.sqrt(variance) / mean) * 100
}

/** Check if a numeric result is within specification range */
export function checkRange(
  result: number,
  specLower: number | undefined,
  specUpper: number | undefined,
  operator: string | undefined
): boolean {
  switch (operator) {
    case "≥/≤": return result >= specLower! && result <= specUpper!
    case ">/<": return result > specLower! && result < specUpper!
    case "≥": return result >= specLower!
    case "≤": return result <= specUpper!
    case ">": return result > specLower!
    case "<": return result < specUpper!
    default:
      if (specLower !== undefined && specUpper !== undefined) {
        return result >= specLower && result <= specUpper
      }
      if (specLower !== undefined) return result >= specLower
      if (specUpper !== undefined) return result <= specUpper
      return true
  }
}

/** Count significant digits in a number string: "98.52" → 4, "3.0" → 2 */
export function countSignificantDigits(numericStr: string): number {
  let str = numericStr.replace(/^[+-]?0*/, "")
  if (str.startsWith(".")) {
    str = str.replace(/^\.0*/, "")
    return str.replace(".", "").length
  }
  if (str.includes(".")) {
    return str.replace(".", "").length
  }
  return str.replace(/0+$/, "").length || 1
}

/** Count decimal places: "98.52" → 2, "95" → 0 */
export function countDecimalPlaces(numericStr: string): number {
  const parts = numericStr.split(".")
  return parts.length === 2 ? parts[1].length : 0
}

/** Count integer digits */
export function countIntegerDigits(value: number): number {
  return String(Math.abs(Math.trunc(value))).replace(/^0+/, "").length || 1
}

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "")
}

export function isImageSignature(signature: unknown): boolean {
  return Boolean(
    signature &&
    typeof signature === "object" &&
    "signatureMethod" in signature &&
    (signature as { signatureMethod?: unknown }).signatureMethod === "image"
  )
}

export function isMissingSignature(signature: unknown): boolean {
  if (!signature || typeof signature !== "object") return true
  if (isImageSignature(signature)) return false

  const sig = signature as { name?: unknown; date?: unknown }
  return isBlank(sig.name) || isBlank(sig.date)
}

export function getRequiredSignatureRoles(_docType?: "ELN" | "COA"): string[] {
  return ["tester", "reviewer", "approver"]
}

export function isDetectionLimitItem(item: unknown): boolean {
  return Boolean(
    item &&
    typeof item === "object" &&
    "isDetectionLimit" in item &&
    (item as { isDetectionLimit?: unknown }).isDetectionLimit === true
  )
}

export function detectionLimitWithinSpec(item: unknown): boolean {
  if (!item || typeof item !== "object") return false

  const testItem = item as {
    resultNumeric?: unknown
    specLower?: unknown
    specUpper?: unknown
    specOperator?: unknown
  }

  if (typeof testItem.resultNumeric !== "number") return false
  if (typeof testItem.specOperator !== "string") return false

  const operator = testItem.specOperator
  const result = testItem.resultNumeric
  const lower = typeof testItem.specLower === "number" ? testItem.specLower : undefined
  const upper = typeof testItem.specUpper === "number" ? testItem.specUpper : undefined

  switch (operator) {
    case "<":
      return upper !== undefined && result <= upper
    case "≤":
      return upper !== undefined && result <= upper
    case "≥/≤":
      return lower !== undefined && upper !== undefined && result >= lower && result <= upper
    case ">/<":
      return lower !== undefined && upper !== undefined && result > lower && result <= upper
    default:
      return false
  }
}
