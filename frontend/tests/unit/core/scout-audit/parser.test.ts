import { describe, expect, test } from "vitest";

import {
  buildAuditViewModel,
  parseSessionLog,
  pickAuditArtifacts,
} from "@/core/scout-audit/parser";

const artifactPaths = [
  "/mnt/user-data/outputs/HLGF-I-26040404-session-log.jsonl",
  "/mnt/user-data/outputs/HLGF-I-26040404-audit-report.md",
  "/mnt/user-data/outputs/HLGF-I-26040404-results.json",
];

const resultsJson = JSON.stringify({
  docType: "COA",
  reportNo: "HLGF-I-26040404",
  batchNo: "B202604034",
  productName: "人血白蛋白原液",
  specification: "20%",
  standardRef: "HLGF/2-ZLBZ-ZJP-01",
  auditDate: "2026-04-28",
  overallResult: "PASS",
  summary: {
    totalRules: 32,
    passCount: 21,
    failCount: 0,
    skipCount: 11,
    applicableCount: 21,
    correctionCount: 3,
    severeFailCount: 0,
  },
  ruleResults: [
    {
      ruleId: "B001",
      ruleName: "样品批号准确",
      status: "PASS",
      severity: "severe",
      details: "批号校验通过",
      remediation: "",
    },
    {
      ruleId: "N001",
      ruleName: "结果在标准限度内",
      status: "PASS",
      severity: "severe",
      details: "结果在范围内",
      remediation: "",
    },
    {
      ruleId: "C001",
      ruleName: "结论规范",
      status: "PASS",
      severity: "warning",
      details: "结论格式规范",
      remediation: "",
    },
  ],
  corrections: [
    {
      ruleId: "C001",
      originalStatus: "FAIL",
      correctedTo: "PASS",
      reason: "COA 使用总结论格式",
    },
  ],
  metadata: {
    generatedBy: "scout-audit v2.0",
    generatedAt: "2026-04-28T00:00:00Z",
    limsAvailable: true,
    ruleEngineAvailable: true,
    reportMethod: "llm",
  },
});

const sessionLogJsonl = [
  JSON.stringify({
    phase: 0,
    name: "pdfConvert",
    timestamp: "2026-04-28T10:00:00+08:00",
    input: { filePath: "/mnt/user-data/uploads/COA.md" },
    output: { lineCount: 45, method: "direct-markdown" },
  }),
  JSON.stringify({
    phase: 1,
    name: "classify",
    timestamp: "2026-04-28T10:00:05+08:00",
    output: { docType: "COA", docTypeChinese: "检验报告/Test Report" },
  }),
  JSON.stringify({
    phase: 7,
    name: "summary",
    timestamp: "2026-04-28T10:01:00+08:00",
    mcpCallCount: 2,
    overallResult: "PASS",
    outputFiles: [
      "outputs/HLGF-I-26040404-results.json",
      "outputs/HLGF-I-26040404-audit-report.md",
      "outputs/HLGF-I-26040404-session-log.jsonl",
    ],
  }),
].join("\n");

describe("pickAuditArtifacts", () => {
  test("selects the complete scout-audit artifact trio by shared basename", () => {
    expect(pickAuditArtifacts(artifactPaths)).toEqual({
      reportBaseName: "HLGF-I-26040404",
      resultsPath: "/mnt/user-data/outputs/HLGF-I-26040404-results.json",
      reportPath: "/mnt/user-data/outputs/HLGF-I-26040404-audit-report.md",
      sessionLogPath:
        "/mnt/user-data/outputs/HLGF-I-26040404-session-log.jsonl",
    });
  });
});

describe("parseSessionLog", () => {
  test("parses jsonl phase entries and sorts them by phase", () => {
    expect(parseSessionLog(sessionLogJsonl)).toEqual([
      {
        input: { filePath: "/mnt/user-data/uploads/COA.md" },
        name: "pdfConvert",
        output: { lineCount: 45, method: "direct-markdown" },
        phase: 0,
        timestamp: "2026-04-28T10:00:00+08:00",
      },
      {
        phase: 1,
        name: "classify",
        output: { docType: "COA", docTypeChinese: "检验报告/Test Report" },
        timestamp: "2026-04-28T10:00:05+08:00",
      },
      {
        phase: 7,
        mcpCallCount: 2,
        name: "summary",
        outputFiles: [
          "outputs/HLGF-I-26040404-results.json",
          "outputs/HLGF-I-26040404-audit-report.md",
          "outputs/HLGF-I-26040404-session-log.jsonl",
        ],
        overallResult: "PASS",
        timestamp: "2026-04-28T10:01:00+08:00",
      },
    ]);
  });

  test("maps legacy action field to name", () => {
    const legacy = [
      JSON.stringify({
        phase: 0,
        action: "PDF to Markdown conversion",
        status: "completed",
      }),
    ].join("\n");

    expect(parseSessionLog(legacy)).toEqual([
      {
        action: "PDF to Markdown conversion",
        name: "PDF to Markdown conversion",
        phase: 0,
        status: "completed",
      },
    ]);
  });
});

describe("buildAuditViewModel", () => {
  test("builds grouped rule sections and summary metrics from scout-audit files", () => {
    const viewModel = buildAuditViewModel({
      artifactPaths,
      resultsContent: resultsJson,
      reportContent: "# Scout 合规审核报告",
      sessionLogContent: sessionLogJsonl,
    });

    expect(viewModel.reportBaseName).toBe("HLGF-I-26040404");
    expect(viewModel.header.reportNo).toBe("HLGF-I-26040404");
    expect(viewModel.summaryCards).toEqual([
      { label: "PASS", tone: "pass", value: 21 },
      { label: "FAIL", tone: "fail", value: 0 },
      { label: "SKIP", tone: "skip", value: 11 },
      { label: "修正", tone: "neutral", value: 3 },
    ]);
    expect(viewModel.ruleGroups.map((group) => group.code)).toEqual([
      "B",
      "N",
      "C",
    ]);
    expect(viewModel.corrections).toEqual([
      {
        correctedTo: "PASS",
        originalStatus: "FAIL",
        reason: "COA 使用总结论格式",
        ruleId: "C001",
      },
    ]);
    expect(viewModel.phaseTimeline).toHaveLength(3);
    expect(viewModel.files.resultsPath).toBe(
      "/mnt/user-data/outputs/HLGF-I-26040404-results.json",
    );
  });
});
