import type {
  ScoutAuditArtifactSet,
  ScoutAuditCorrection,
  ScoutAuditPhaseEntry,
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
    .map((line, index) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return normalizePhaseEntry(parsed);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to parse session-log.jsonl at line ${index + 1}: ${message}`,
        );
      }
    })
    .sort(
      (left, right) =>
        (left.phase ?? Number.POSITIVE_INFINITY) -
        (right.phase ?? Number.POSITIVE_INFINITY),
    );
}

function normalizePhaseEntry(entry: unknown): ScoutAuditPhaseEntry {
  if (!entry || typeof entry !== "object") {
    return { phase: Number.POSITIVE_INFINITY };
  }

  const record = entry as Record<string, unknown>;
  const phaseValue = record.phase;
  const phase =
    typeof phaseValue === "number"
      ? phaseValue
      : typeof phaseValue === "string"
        ? Number(phaseValue)
        : Number.POSITIVE_INFINITY;

  const name =
    typeof record.name === "string"
      ? record.name
      : typeof record.action === "string"
        ? record.action
        : undefined;

  const timestamp =
    typeof record.timestamp === "string" ? record.timestamp : undefined;

  const normalized: ScoutAuditPhaseEntry = {
    ...record,
    phase,
  };

  if (name) {
    normalized.name = name;
  }

  if (timestamp) {
    normalized.timestamp = timestamp;
  }

  return normalized;
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

  const results = parseResultsFile(resultsContent);
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
