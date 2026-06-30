import type {
  AuditResultStatus,
  ElnFilteringInfo,
  JointDocumentData,
  ScoutAuditArtifactSet,
  ScoutAuditCorrection,
  ScoutAuditHeader,
  ScoutAuditMetadata,
  ScoutAuditResults,
  ScoutAuditResultsFile,
  ScoutAuditRuleGroup,
  ScoutAuditRuleResult,
  ScoutAuditRuleStatus,
  ScoutAuditSummaryCard,
  ScoutAuditViewModel,
} from "./types";

const RESULTS_SUFFIX = "-results.json";
const REPORT_SUFFIX = "-audit-report.md";

const RULE_GROUP_LABELS: Record<string, string> = {
  B: "基本信息",
  N: "数值判定",
  R: "数值规范",
  P: "精密度",
  E: "环境/仪器",
  S: "签名/审核",
  D: "数据完整性",
  L: "逻辑一致性",
  C: "结论/表述",
  X: "跨文档一致性",
};

function groupCodeOfRule(ruleId: string): string {
  const match = /^[A-Z]+/.exec(ruleId.trim());
  return match?.[0] ?? "OTHER";
}

function buildSummaryCards(
  results: ScoutAuditResults,
): ScoutAuditSummaryCard[] {
  return [
    { label: "PASS", tone: "pass", value: results.summary.passCount },
    { label: "FAIL", tone: "fail", value: results.summary.failCount },
    { label: "SKIP", tone: "skip", value: results.summary.skipCount },
    {
      label: "修正",
      tone: "neutral",
      value: results.summary.correctionCount,
    },
  ];
}

function buildRuleGroups(
  ruleResults: ScoutAuditRuleResult[],
): ScoutAuditRuleGroup[] {
  const grouped = new Map<string, ScoutAuditRuleResult[]>();

  for (const rule of ruleResults) {
    const code = groupCodeOfRule(rule.ruleId);
    const current = grouped.get(code) ?? [];
    current.push(rule);
    grouped.set(code, current);
  }

  return Array.from(grouped.entries()).map(([code, rules]) => ({
    code,
    label: RULE_GROUP_LABELS[code] ?? code,
    rules,
  }));
}

export function pickAuditArtifacts(
  artifactPaths: string[],
): ScoutAuditArtifactSet | null {
  for (const candidate of artifactPaths) {
    if (!candidate.endsWith(RESULTS_SUFFIX)) {
      continue;
    }

    const reportBaseName = candidate.slice(0, -RESULTS_SUFFIX.length);
    const reportPath = `${reportBaseName}${REPORT_SUFFIX}`;

    if (artifactPaths.includes(reportPath)) {
      return {
        reportBaseName: reportBaseName.split("/").at(-1) ?? reportBaseName,
        resultsPath: candidate,
        reportPath,
      };
    }
  }

  return null;
}

function countByStatus(
  ruleResults: ScoutAuditRuleResult[],
  status: ScoutAuditRuleStatus,
) {
  return ruleResults.reduce(
    (acc, rule) => (rule.status === status ? acc + 1 : acc),
    0,
  );
}

function computeOverallResult(ruleResults: ScoutAuditRuleResult[]) {
  const failRules = ruleResults.filter((rule) => rule.status === "FAIL");
  if (failRules.length === 0) {
    const passCount = countByStatus(ruleResults, "PASS");
    const skipCount = countByStatus(ruleResults, "SKIP");
    if (passCount === 0 && skipCount > 0) {
      return "SKIP";
    }
    return "PASS";
  }

  const hasSevereFail = failRules.some((rule) => rule.severity === "severe");
  return hasSevereFail ? "FAIL" : "CONDITIONAL_PASS";
}

function computeSummary(results: ScoutAuditResultsFile) {
  const totalRules = results.ruleResults.length;
  const passCount = countByStatus(results.ruleResults, "PASS");
  const failCount = countByStatus(results.ruleResults, "FAIL");
  const skipCount = countByStatus(results.ruleResults, "SKIP");
  const applicableCount = totalRules - skipCount;
  const correctionCount = results.corrections?.length ?? 0;
  const severeFailCount = results.ruleResults.filter(
    (rule) => rule.status === "FAIL" && rule.severity === "severe",
  ).length;

  return {
    totalRules,
    passCount,
    failCount,
    skipCount,
    applicableCount,
    correctionCount,
    severeFailCount,
  };
}

function normalizeResultsFile(
  results: ScoutAuditResultsFile,
): ScoutAuditResults {
  const summary = results.summary ?? computeSummary(results);
  const overallResult =
    results.overallResult ?? computeOverallResult(results.ruleResults);

  return {
    ...results,
    overallResult,
    summary,
  };
}

export function parseResultsFile(content: string): ScoutAuditResults {
  const parsed = JSON.parse(content) as ScoutAuditResultsFile;
  return normalizeResultsFile(parsed);
}

// ---------------------------------------------------------------------------
// Joint mode detection and parsing
// ---------------------------------------------------------------------------

interface JointRawFile {
  auditMode: "joint";
  batchNo: string;
  productName?: string;
  specification?: string;
  standardRef?: string;
  auditDate?: string;
  overallResult?: string;
  summary?: {
    totalRules: number;
    passCount: number;
    failCount: number;
    skipCount: number;
    applicableCount?: number;
    correctionCount?: number;
    severeFailCount?: number;
  };
  documents: Record<string, ScoutAuditResultsFile>;
  crossDocumentRules?: ScoutAuditRuleResult[];
  elnFiltering?: ElnFilteringInfo;
  corrections?: ScoutAuditCorrection[];
  metadata?: ScoutAuditMetadata;
}

function isJointMode(raw: Record<string, unknown>): boolean {
  return (
    raw.auditMode === "joint" ||
    (typeof raw.documents === "object" && raw.documents !== null)
  );
}

function parseJointContent(raw: JointRawFile): {
  results: ScoutAuditResults;
  documentResults: Record<string, JointDocumentData>;
  crossDocumentRuleGroups: ScoutAuditRuleGroup[];
  elnFiltering?: ElnFilteringInfo;
} {
  // Build per-document data
  const documentResults: Record<string, JointDocumentData> = {};
  for (const [key, docFile] of Object.entries(raw.documents)) {
    const docResults = normalizeResultsFile(docFile);
    documentResults[key] = {
      docType: docResults.docType,
      reportNo: docResults.reportNo,
      overallResult: docResults.overallResult,
      results: docResults,
      ruleGroups: buildRuleGroups(docResults.ruleResults),
    };
  }

  // Build cross-document rule groups
  const crossDocumentRuleGroups = buildRuleGroups(raw.crossDocumentRules ?? []);

  // Compute aggregate summary (root may only have partial counts)
  const totalRules = raw.summary?.totalRules ?? 0;
  const passCount = raw.summary?.passCount ?? 0;
  const failCount = raw.summary?.failCount ?? 0;
  const skipCount = raw.summary?.skipCount ?? 0;
  const applicableCount =
    raw.summary?.applicableCount ?? totalRules - skipCount;
  const correctionCount =
    raw.summary?.correctionCount ?? raw.corrections?.length ?? 0;

  // Count severe fails across all documents + cross-doc rules
  let severeFailCount = 0;
  for (const doc of Object.values(raw.documents)) {
    severeFailCount += doc.ruleResults.filter(
      (r) => r.status === "FAIL" && r.severity === "severe",
    ).length;
  }
  severeFailCount += (raw.crossDocumentRules ?? []).filter(
    (r) => r.status === "FAIL" && r.severity === "severe",
  ).length;
  severeFailCount = raw.summary?.severeFailCount ?? severeFailCount;

  // Build aggregate rule results list
  const allRuleResults: ScoutAuditRuleResult[] = [];
  for (const doc of Object.values(raw.documents)) {
    allRuleResults.push(...doc.ruleResults);
  }
  allRuleResults.push(...(raw.crossDocumentRules ?? []));

  const results: ScoutAuditResults = {
    docType: "JOINT",
    reportNo: "",
    batchNo: raw.batchNo,
    productName: raw.productName,
    specification: raw.specification,
    standardRef: raw.standardRef,
    auditDate: raw.auditDate,
    overallResult: (raw.overallResult as AuditResultStatus) ?? "FAIL",
    summary: {
      totalRules,
      passCount,
      failCount,
      skipCount,
      applicableCount,
      correctionCount,
      severeFailCount,
    },
    ruleResults: allRuleResults,
    corrections: raw.corrections ?? [],
    metadata: raw.metadata,
  };

  return {
    results,
    documentResults,
    crossDocumentRuleGroups,
    elnFiltering: raw.elnFiltering,
  };
}

export function parseHeaderFromResults(content: string): ScoutAuditHeader {
  const rawParsed = JSON.parse(content) as Record<string, unknown>;

  if (isJointMode(rawParsed)) {
    const joint = rawParsed as unknown as JointRawFile;
    return {
      reportNo: "",
      batchNo: joint.batchNo,
      docType: "JOINT",
      overallResult: (joint.overallResult as AuditResultStatus) ?? "FAIL",
      productName: joint.productName,
      specification: joint.specification,
      standardRef: joint.standardRef,
      auditDate: joint.auditDate,
    };
  }

  const results = normalizeResultsFile(
    rawParsed as unknown as ScoutAuditResultsFile,
  );
  return {
    reportNo: results.reportNo,
    batchNo: results.batchNo,
    docType: results.docType,
    overallResult: results.overallResult,
    productName: results.productName,
    specification: results.specification,
    standardRef: results.standardRef,
    auditDate: results.auditDate,
  };
}

export function buildAuditViewModel({
  artifactPaths,
  resultsContent,
  reportContent,
}: {
  artifactPaths: string[];
  resultsContent: string;
  reportContent: string;
}): ScoutAuditViewModel {
  const files = pickAuditArtifacts(artifactPaths);
  if (!files) {
    throw new Error("Missing scout-audit artifacts.");
  }

  const rawParsed = JSON.parse(resultsContent) as Record<string, unknown>;

  if (isJointMode(rawParsed)) {
    const joint = parseJointContent(rawParsed as unknown as JointRawFile);

    return {
      reportBaseName: files.reportBaseName,
      files,
      header: {
        reportNo: "",
        batchNo: joint.results.batchNo,
        docType: "JOINT",
        overallResult: joint.results.overallResult,
        productName: joint.results.productName,
        specification: joint.results.specification,
        standardRef: joint.results.standardRef,
        auditDate: joint.results.auditDate,
      },
      reportMarkdown: reportContent,
      results: joint.results,
      summaryCards: buildSummaryCards(joint.results),
      ruleGroups: [],
      corrections: joint.results.corrections ?? [],
      auditMode: "joint",
      documentResults: joint.documentResults,
      crossDocumentRuleGroups: joint.crossDocumentRuleGroups,
      elnFiltering: joint.elnFiltering,
    };
  }

  const results = normalizeResultsFile(
    rawParsed as unknown as ScoutAuditResultsFile,
  );
  const corrections: ScoutAuditCorrection[] = results.corrections ?? [];

  return {
    reportBaseName: files.reportBaseName,
    files,
    header: {
      reportNo: results.reportNo,
      batchNo: results.batchNo,
      docType: results.docType,
      overallResult: results.overallResult,
      productName: results.productName,
      specification: results.specification,
      standardRef: results.standardRef,
      auditDate: results.auditDate,
    },
    reportMarkdown: reportContent,
    results,
    summaryCards: buildSummaryCards(results),
    ruleGroups: buildRuleGroups(results.ruleResults),
    corrections,
    auditMode: "single",
  };
}
