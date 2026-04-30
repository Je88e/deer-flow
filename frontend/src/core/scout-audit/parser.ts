import type {
  ScoutAuditArtifactSet,
  ScoutAuditCorrection,
  ScoutAuditPhaseEntry,
  ScoutAuditResultsFile,
  ScoutAuditRuleGroup,
  ScoutAuditRuleResult,
  ScoutAuditSummaryCard,
  ScoutAuditViewModel,
} from "./types";

const RESULTS_SUFFIX = "-results.json";
const REPORT_SUFFIX = "-audit-report.md";
const SESSION_LOG_SUFFIX = "-session-log.jsonl";

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
};

function groupCodeOfRule(ruleId: string): string {
  const match = /^[A-Z]+/.exec(ruleId.trim());
  return match?.[0] ?? "OTHER";
}

function buildSummaryCards(
  results: ScoutAuditResultsFile,
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
    const sessionLogPath = `${reportBaseName}${SESSION_LOG_SUFFIX}`;

    if (
      artifactPaths.includes(reportPath) &&
      artifactPaths.includes(sessionLogPath)
    ) {
      return {
        reportBaseName: reportBaseName.split("/").at(-1) ?? reportBaseName,
        resultsPath: candidate,
        reportPath,
        sessionLogPath,
      };
    }
  }

  return null;
}

export function parseSessionLog(content: string): ScoutAuditPhaseEntry[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ScoutAuditPhaseEntry)
    .sort((left, right) => left.phase - right.phase);
}

export function buildAuditViewModel({
  artifactPaths,
  resultsContent,
  reportContent,
  sessionLogContent,
}: {
  artifactPaths: string[];
  resultsContent: string;
  reportContent: string;
  sessionLogContent: string;
}): ScoutAuditViewModel {
  const files = pickAuditArtifacts(artifactPaths);
  if (!files) {
    throw new Error("Missing scout-audit artifacts.");
  }

  const results = JSON.parse(resultsContent) as ScoutAuditResultsFile;
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
    phaseTimeline: parseSessionLog(sessionLogContent),
  };
}
