#!/usr/bin/env node
// fetch-lims.ts — Aggregate LIMS data for a docExtract (Phase 3)
// Usage: npx tsx scripts/fetch-lims.ts <docExtract.json> [output.json]
//
// Derives the LIMS lookup keys from Phase 2 docExtract, calls the aggregated
// LIMS data source, and writes the consolidated limsData object as JSON to
// output.json, or stdout if omitted.
// Exit 0 on success; non-zero (with stderr message) on usage / IO / parse error.

import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { getMockAllLimsData } from "../lib/mock-data.js"

type DocType = "ELN" | "COA"
type JsonRecord = Record<string, unknown>

function fail(message: string): never {
  process.stderr.write(`[fetch-lims] ${message}\n`)
  process.exit(1)
}

function readJson(path: string, label: string): unknown {
  if (!existsSync(path)) fail(`${label} not found: ${path}`)
  try {
    return JSON.parse(readFileSync(path, "utf-8"))
  } catch (err) {
    fail(`${label} is not valid JSON (${path}): ${err instanceof Error ? err.message : String(err)}`)
  }
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`)
  return value as JsonRecord
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`)
  return value
}

function readString(obj: JsonRecord, key: string): string {
  const value = obj[key]
  return typeof value === "string" ? value.trim() : ""
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim()
  }
  return ""
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim() !== "")))
}

function parseArgs(argv: string[]): { docExtractPath: string; outputPath: string | null } {
  const positional: string[] = []
  let outputPath: string | null = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "-o" || arg === "--output") {
      outputPath = argv[++i] ?? fail("--output requires a value")
      continue
    }
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(
        [
          "Usage: fetch-lims.ts <docExtract.json> [output.json]",
          "",
          "Phase 3 LIMS aggregation. Derives lookup keys from docExtract and writes",
          "the consolidated limsData object as JSON to output.json, or stdout if omitted.",
        ].join("\n") + "\n"
      )
      process.exit(0)
    }
    positional.push(arg)
  }
  const [docExtractPath, outputPositional] = positional
  if (!docExtractPath) fail("usage: fetch-lims.ts <docExtract.json> [output.json]")
  if (outputPositional && outputPath) fail("specify output only once (positional or --output)")
  const resolvedOutput = outputPositional ?? outputPath
  return { docExtractPath: resolve(docExtractPath), outputPath: resolvedOutput ? resolve(resolvedOutput) : null }
}

function main(): void {
  const { docExtractPath, outputPath } = parseArgs(process.argv.slice(2))
  const docExtract = asRecord(readJson(docExtractPath, "docExtract"), "docExtract")

  const reportInfo = asRecord(docExtract.reportInfo ?? {}, "docExtract.reportInfo")
  const sampleInfo = asRecord(docExtract.sampleInfo ?? {}, "docExtract.sampleInfo")
  const dates = asRecord(docExtract.dates ?? {}, "docExtract.dates")

  const reportNo = readString(reportInfo, "reportNo")
  const batchNo = readString(sampleInfo, "batchNo")
  const productName = readString(sampleInfo, "productName")
  const standardRef = readString(docExtract, "standardRef")
  if (!reportNo) fail("docExtract.reportInfo.reportNo is required for LIMS lookup")
  if (!batchNo) fail("docExtract.sampleInfo.batchNo is required for LIMS lookup")

  const docType = docExtract.docType
  if (docType !== "ELN" && docType !== "COA") fail("docExtract.docType must be ELN or COA")

  const signatures = asArray(docExtract.signatures ?? [], "docExtract.signatures")
  const personnel = asArray(docExtract.personnel ?? [], "docExtract.personnel")
  const instruments = asArray(docExtract.instruments ?? [], "docExtract.instruments")
  const testItems = asArray(docExtract.testItems ?? [], "docExtract.testItems")

  const personnelNames = unique([
    ...personnel.flatMap((item) => {
      const name = readString(asRecord(item, "docExtract.personnel[]"), "name")
      return name ? [name] : []
    }),
    ...signatures.flatMap((item) => {
      const name = readString(asRecord(item, "docExtract.signatures[]"), "name")
      return name ? [name] : []
    }),
  ])

  const instrumentNos = unique(
    instruments.flatMap((item) => {
      const no = readString(asRecord(item, "docExtract.instruments[]"), "instrumentNo")
      return no ? [no] : []
    })
  )

  const qualitativeItems = testItems.flatMap((item) => {
    const row = asRecord(item, "docExtract.testItems[]")
    const itemName = readString(row, "itemName")
    return row.testType === "qualitative" && itemName ? [{ productName, testItemName: itemName }] : []
  })

  const asOfDate = firstNonEmpty(dates.testDate, dates.reportDate, reportInfo.reportDate)
  if (!asOfDate) fail("docExtract must provide testDate or reportDate for LIMS lookup")

  const limsData = getMockAllLimsData(
    batchNo,
    reportNo,
    standardRef,
    personnelNames,
    instrumentNos,
    asOfDate,
    docType as DocType,
    qualitativeItems
  )

  const json = `${JSON.stringify(limsData, null, 2)}\n`
  if (outputPath) {
    writeFileSync(outputPath, json, "utf-8")
  } else {
    process.stdout.write(json)
  }
}

main()
