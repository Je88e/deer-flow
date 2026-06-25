#!/usr/bin/env node
// run-rules.ts — Execute the deterministic compliance rules (Phase 4)
// Usage: npx tsx scripts/run-rules.ts <docExtract.json> <limsData.json> [output.json]
//           [--doc-type ELN|COA] [--rule <id>]
//
// Reads Phase 2 docExtract + Phase 3 limsData, runs the deterministic rule
// engine, and writes the 20 RuleResult[] (or a single rule result with --rule)
// as JSON to output.json, or stdout if omitted.
// Exit 0 on success; non-zero (with stderr message) on usage / IO / parse error.

import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { runAllRules, runSingleRule, type RuleResult } from "../lib/rules.js"

type DocType = "ELN" | "COA"

function fail(message: string): never {
  process.stderr.write(`[run-rules] ${message}\n`)
  process.exit(1)
}

function readJson(path: string, label: string): Record<string, unknown> {
  if (!existsSync(path)) fail(`${label} not found: ${path}`)
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
  } catch (err) {
    fail(`${label} is not valid JSON (${path}): ${err instanceof Error ? err.message : String(err)}`)
  }
}

function parseArgs(argv: string[]): {
  docExtractPath: string
  limsDataPath: string
  outputPath: string | null
  docType: DocType | null
  ruleId: string | null
} {
  const positional: string[] = []
  let outputPath: string | null = null
  let docType: DocType | null = null
  let ruleId: string | null = null

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "-o" || arg === "--output") {
      outputPath = argv[++i] ?? fail("--output requires a value")
      continue
    }
    if (arg === "--doc-type") {
      const value = argv[++i] ?? fail("--doc-type requires a value")
      if (value !== "ELN" && value !== "COA") fail(`--doc-type must be ELN or COA, got: ${value}`)
      docType = value
      continue
    }
    if (arg === "--rule") {
      ruleId = argv[++i] ?? fail("--rule requires a value")
      continue
    }
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(
        [
          "Usage: run-rules.ts <docExtract.json> <limsData.json> [output.json]",
          "           [--doc-type ELN|COA] [--rule <id>]",
          "",
          "Phase 4 deterministic rule engine. Writes 20 RuleResult[] (or a single",
          "rule result with --rule) as JSON to output.json, or stdout if omitted.",
          "docType defaults to docExtract.docType.",
        ].join("\n") + "\n"
      )
      process.exit(0)
    }
    positional.push(arg)
  }

  const [docExtractPath, limsDataPath, outputPositional] = positional
  if (!docExtractPath || !limsDataPath) {
    fail("usage: run-rules.ts <docExtract.json> <limsData.json> [output.json]")
  }
  if (outputPositional && outputPath) fail("specify output only once (positional or --output)")
  const resolvedOutput = outputPositional ?? outputPath
  return {
    docExtractPath: resolve(docExtractPath),
    limsDataPath: resolve(limsDataPath),
    outputPath: resolvedOutput ? resolve(resolvedOutput) : null,
    docType,
    ruleId,
  }
}

function main(): void {
  const { docExtractPath, limsDataPath, outputPath, docType: cliDocType, ruleId } = parseArgs(process.argv.slice(2))

  const docExtract = readJson(docExtractPath, "docExtract")
  const limsData = readJson(limsDataPath, "limsData")

  const inferredDocType = docExtract.docType
  const docType: DocType =
    cliDocType ?? (inferredDocType === "ELN" || inferredDocType === "COA" ? inferredDocType : null)
  if (!docType) fail("docType missing: pass --doc-type or set docExtract.docType to ELN|COA")

  const results: RuleResult | RuleResult[] = ruleId
    ? runSingleRule(ruleId, docExtract, limsData, docType)
    : runAllRules(docExtract, limsData, docType)

  const json = `${JSON.stringify(results, null, 2)}\n`
  if (outputPath) {
    writeFileSync(outputPath, json, "utf-8")
  } else {
    process.stdout.write(json)
  }
}

main()
