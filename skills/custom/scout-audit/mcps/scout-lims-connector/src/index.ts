#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import {
  getMockRequestForm,
  getMockReportUnique,
  getMockQualification,
  getMockInstrument,
  getMockSystemSuitability,
  getMockStandard,
  getMockAuditTrail,
  getMockOriginalDataIndex,
  getMockApprovalWorkflow,
  getMockTestItemOptions,
  getMockAllLimsData,
} from "./mock-data.js"
import { withLogging } from "./logger.js"

const server = new McpServer({
  name: "scout-lims-connector",
  version: "0.2.0",
})

function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] }
}

// --- Individual tools (with logging) ---

server.tool(
  "fetch_request_form",
  "Fetch the request form (请验单) for a given batch number, containing product info, required test items, and approval workflow",
  { batchNo: z.string().describe("Batch number (批号)") },
  withLogging("fetch_request_form", async ({ batchNo }) => {
    const result = getMockRequestForm(batchNo)
    if (!result) {
      return textResult(JSON.stringify({ error: "Batch not found", batchNo }))
    }
    return textResult(JSON.stringify(result, null, 2))
  })
)

server.tool(
  "check_report_unique",
  "Check if a report number is unique in the LIMS system",
  { reportNo: z.string().describe("Report number (报告编号)") },
  withLogging("check_report_unique", async ({ reportNo }) => {
    const result = getMockReportUnique(reportNo)
    return textResult(JSON.stringify(result, null, 2))
  })
)

server.tool(
  "fetch_qualifications",
  "Fetch personnel qualifications for a given person and date",
  {
    personName: z.string().describe("Person name (姓名)"),
    asOfDate: z.string().describe("Date to check qualification status (YYYY-MM-DD)"),
  },
  withLogging("fetch_qualifications", async ({ personName, asOfDate }) => {
    const result = getMockQualification(personName, asOfDate)
    if (!result) {
      return textResult(JSON.stringify({ error: "Person not found", personName }))
    }
    return textResult(JSON.stringify(result, null, 2))
  })
)

server.tool(
  "fetch_instrument",
  "Fetch instrument details including calibration status and usage log",
  { instrumentNo: z.string().describe("Instrument number (仪器编号)") },
  withLogging("fetch_instrument", async ({ instrumentNo }) => {
    const result = getMockInstrument(instrumentNo)
    if (!result) {
      return textResult(JSON.stringify({ error: "Instrument not found", instrumentNo }))
    }
    return textResult(JSON.stringify(result, null, 2))
  })
)

server.tool(
  "fetch_system_suitability",
  "Fetch system suitability test results for chromatography tests",
  { batchNo: z.string().describe("Batch number (批号)") },
  withLogging("fetch_system_suitability", async ({ batchNo }) => {
    const result = getMockSystemSuitability(batchNo)
    if (!result) {
      return textResult(JSON.stringify({ error: "No system suitability data for batch", batchNo }))
    }
    return textResult(JSON.stringify(result, null, 2))
  })
)

server.tool(
  "fetch_standard",
  "Fetch standard/reference document status",
  { standardRef: z.string().describe("Standard reference code (标准编号)") },
  withLogging("fetch_standard", async ({ standardRef }) => {
    const result = getMockStandard(standardRef)
    if (!result) {
      return textResult(JSON.stringify({ error: "Standard not found", standardRef }))
    }
    return textResult(JSON.stringify(result, null, 2))
  })
)

server.tool(
  "fetch_audit_trail",
  "Fetch audit trail records for a batch",
  { batchNo: z.string().describe("Batch number (批号)") },
  withLogging("fetch_audit_trail", async ({ batchNo }) => {
    const result = getMockAuditTrail(batchNo)
    return textResult(JSON.stringify(result, null, 2))
  })
)

server.tool(
  "fetch_original_data_index",
  "Fetch original data index including instrument logs, chromatograms, and page counts",
  { batchNo: z.string().describe("Batch number (批号)") },
  withLogging("fetch_original_data_index", async ({ batchNo }) => {
    const result = getMockOriginalDataIndex(batchNo)
    if (!result) {
      return textResult(JSON.stringify({ error: "No original data index for batch", batchNo }))
    }
    return textResult(JSON.stringify(result, null, 2))
  })
)

server.tool(
  "fetch_approval_workflow",
  "Fetch approval workflow status for a report",
  { reportNo: z.string().describe("Report number (报告编号)") },
  withLogging("fetch_approval_workflow", async ({ reportNo }) => {
    const result = getMockApprovalWorkflow(reportNo)
    if (!result) {
      return textResult(JSON.stringify({ error: "No workflow found for report", reportNo }))
    }
    return textResult(JSON.stringify(result, null, 2))
  })
)

server.tool(
  "fetch_test_item_options",
  "Fetch allowed result options for a qualitative test item",
  {
    productName: z.string().describe("Product name (品名)"),
    testItemName: z.string().describe("Test item name (检测项目名)"),
  },
  withLogging("fetch_test_item_options", async ({ productName, testItemName }) => {
    const result = getMockTestItemOptions(productName, testItemName)
    if (!result) {
      return textResult(JSON.stringify({ error: "No options found", productName, testItemName }))
    }
    return textResult(JSON.stringify(result, null, 2))
  })
)

// --- Aggregated tool: single call replaces 10+ individual calls ---

server.tool(
  "fetch_all_lims_data",
  "Aggregate ALL LIMS data in a single call. Takes docExtract summary fields and returns consolidated limsData object. Replaces 10+ individual fetch calls to optimize context window usage.",
  {
    batchNo: z.string().describe("Batch number (批号)"),
    reportNo: z.string().describe("Report number (报告编号)"),
    standardRef: z.string().describe("Standard reference code (标准编号)"),
    personnelNames: z.array(z.string()).describe("Personnel names from docExtract"),
    instrumentNos: z.array(z.string()).describe("Instrument numbers from docExtract"),
    asOfDate: z.string().describe("Test date for qualification check (YYYY-MM-DD)"),
    docType: z.enum(["ELN", "COA"]).describe("Document type"),
    qualitativeItems: z.array(z.object({
      productName: z.string(),
      testItemName: z.string(),
    })).describe("Qualitative test items needing option lookup"),
  },
  withLogging("fetch_all_lims_data", async (params) => {
    const result = getMockAllLimsData(
      params.batchNo,
      params.reportNo,
      params.standardRef,
      params.personnelNames,
      params.instrumentNos,
      params.asOfDate,
      params.docType,
      params.qualitativeItems
    )
    return textResult(JSON.stringify(result, null, 2))
  })
)

const transport = new StdioServerTransport()
await server.connect(transport)
