export type AuditResultStatus = "PASS" | "FAIL" | "SKIP" | "CONDITIONAL_PASS";

export type AuditSeverity = "severe" | "warning" | "info";

export type SummaryCardTone = "pass" | "fail" | "skip" | "neutral";

export interface ScoutAuditRuleResult {
  ruleId: string;
  ruleName: string;
  status: AuditResultStatus;
  severity: AuditSeverity;
  details: string;
  remediation: string;
}

export interface ScoutAuditCorrection {
  ruleId: string;
  originalStatus: AuditResultStatus;
  correctedTo: AuditResultStatus;
  reason: string;
}

export interface ScoutAuditSummary {
  totalRules: number;
  passCount: number;
  failCount: number;
  skipCount: number;
  applicableCount: number;
  correctionCount: number;
  severeFailCount: number;
}

export interface ScoutAuditMetadata {
  generatedBy?: string;
  generatedAt?: string;
  limsAvailable?: boolean;
  ruleEngineAvailable?: boolean;
  reportMethod?: string;
}

export interface ScoutAuditResultsFile {
  docType: string;
  reportNo: string;
  batchNo: string;
  productName?: string;
  specification?: string;
  standardRef?: string;
  auditDate?: string;
  overallResult: AuditResultStatus;
  summary: ScoutAuditSummary;
  ruleResults: ScoutAuditRuleResult[];
  corrections?: ScoutAuditCorrection[];
  metadata?: ScoutAuditMetadata;
}

export interface ScoutAuditArtifactSet {
  reportBaseName: string;
  resultsPath: string;
  reportPath: string;
  sessionLogPath: string;
}

export interface ScoutAuditPhaseEntry extends Record<string, unknown> {
  phase: number;
  action: string;
  status: string;
}

export interface ScoutAuditRuleGroup {
  code: string;
  label: string;
  rules: ScoutAuditRuleResult[];
}

export interface ScoutAuditSummaryCard {
  label: string;
  value: number;
  tone: SummaryCardTone;
}

export interface ScoutAuditHeader {
  reportNo: string;
  batchNo: string;
  docType: string;
  overallResult: AuditResultStatus;
  productName?: string;
  specification?: string;
  standardRef?: string;
  auditDate?: string;
}

export interface ScoutAuditViewModel {
  reportBaseName: string;
  files: ScoutAuditArtifactSet;
  header: ScoutAuditHeader;
  reportMarkdown: string;
  results: ScoutAuditResultsFile;
  summaryCards: ScoutAuditSummaryCard[];
  ruleGroups: ScoutAuditRuleGroup[];
  corrections: ScoutAuditCorrection[];
  phaseTimeline: ScoutAuditPhaseEntry[];
}
