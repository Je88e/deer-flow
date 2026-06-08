#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { runAllRules, runSingleRule } from "./rules.js"
import { withLogging } from "./logger.js"

const server = new McpServer({
  name: "scout-rule-engine",
  version: "0.2.0",
})

function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] }
}

server.tool(
  "run_all_rules",
  "Execute all 20 deterministic compliance rules applicable to the document type",
  {
    docExtract: z.string().describe("docExtract JSON string — Phase 2 extracted document data"),
    limsData: z.string().describe("limsData JSON string — Phase 3 LIMS data"),
    docType: z.enum(["ELN", "COA"]).describe("Document type"),
  },
  withLogging("run_all_rules", async ({ docExtract, limsData, docType }) => {
    const i1 = JSON.parse(docExtract)
    const i2 = JSON.parse(limsData)
    const results = runAllRules(i1, i2, docType)
    return textResult(JSON.stringify(results, null, 2))
  })
)

server.tool(
  "run_single_rule",
  "Execute a single deterministic compliance rule by ID",
  {
    ruleId: z.string().describe("Rule ID (e.g. B001, N001)"),
    docExtract: z.string().describe("docExtract JSON string"),
    limsData: z.string().describe("limsData JSON string"),
    docType: z.enum(["ELN", "COA"]).describe("Document type"),
  },
  withLogging("run_single_rule", async ({ ruleId, docExtract, limsData, docType }) => {
    const i1 = JSON.parse(docExtract)
    const i2 = JSON.parse(limsData)
    const result = runSingleRule(ruleId, i1, i2, docType)
    return textResult(JSON.stringify(result, null, 2))
  })
)

const transport = new StdioServerTransport()
await server.connect(transport)
