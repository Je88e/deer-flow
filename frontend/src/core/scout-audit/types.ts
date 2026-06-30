export type AuditResultStatus = "PASS" | "FAIL" | "SKIP" | "CONDITIONAL_PASS";

export type ScoutAuditRuleStatus = "PASS" | "FAIL" | "SKIP";

export type AuditSeverity = "severe" | "warning" | "info";

export type SummaryCardTone = "pass" | "fail" | "skip" | "neutral";

export interface ScoutAuditRuleResult {
  ruleId: string;
  ruleName: string;
  status: ScoutAuditRuleStatus;
  severity: AuditSeverity;
  details: string;
  evidence?: {
    expected?: string;
    actual?: string;
    location?: string;
  };
  remediation: string;
}

export interface ScoutAuditCorrection {
  ruleId: string;
  originalStatus: ScoutAuditRuleStatus;
  correctedTo: ScoutAuditRuleStatus;
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
  generatedBy?: string; //Scout Auditor
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
  overallResult?: AuditResultStatus;
  summary?: ScoutAuditSummary;
  ruleResults: ScoutAuditRuleResult[];
  corrections?: ScoutAuditCorrection[];
  metadata?: ScoutAuditMetadata;
}

export type ScoutAuditResults = Omit<
  ScoutAuditResultsFile,
  "overallResult" | "summary"
> & {
  overallResult: AuditResultStatus;
  summary: ScoutAuditSummary;
};

export interface ScoutAuditArtifactSet {
  reportBaseName: string;
  resultsPath: string;
  reportPath: string;
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

export interface ElnFilteringInfo {
  elnScope: string;
  originalSampleCount: number;
  filteredSampleCount: number;
  filterMethod: string;
  keptSampleIds?: string[];
  excludedSampleIds?: string[];
}

export interface JointDocumentData {
  docType: string;
  reportNo: string;
  overallResult: AuditResultStatus;
  results: ScoutAuditResults;
  ruleGroups: ScoutAuditRuleGroup[];
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
  results: ScoutAuditResults;
  summaryCards: ScoutAuditSummaryCard[];
  ruleGroups: ScoutAuditRuleGroup[];
  corrections: ScoutAuditCorrection[];
  /** "joint" for multi-document audits; undefined defaults to "single" */
  auditMode?: "single" | "joint";
  /** Per-document results for joint mode */
  documentResults?: Record<string, JointDocumentData>;
  /** Cross-document rule groups for joint mode */
  crossDocumentRuleGroups?: ScoutAuditRuleGroup[];
  /** ELN filtering info for joint mode */
  elnFiltering?: ElnFilteringInfo;
}
