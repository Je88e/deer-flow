"use client";

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  FileJsonIcon,
  FileTextIcon,
  FlaskConicalIcon,
  HourglassIcon,
  ListChecksIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { urlOfArtifact } from "@/core/artifacts/utils";
import { useI18n } from "@/core/i18n/hooks";
import {
  type ScoutAuditRuleGroup,
  type ScoutAuditViewModel,
} from "@/core/scout-audit/types";
import { cn } from "@/lib/utils";

function statusClasses(status: string) {
  if (status === "PASS") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "FAIL" || status === "CONDITIONAL_PASS") {
    return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  if (status === "SKIP") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-border bg-muted text-foreground";
}

function toneClasses(tone: string) {
  if (tone === "pass") {
    return "text-emerald-600 dark:text-emerald-300";
  }
  if (tone === "fail") {
    return "text-rose-600 dark:text-rose-300";
  }
  if (tone === "skip") {
    return "text-amber-600 dark:text-amber-300";
  }
  return "text-foreground";
}

function RuleGroupTable({ groups }: { groups: ScoutAuditRuleGroup[] }) {
  return groups.map((group) => (
    <Card key={group.code}>
      <CardHeader>
        <CardTitle>
          {group.label} ({group.code})
        </CardTitle>
        <CardDescription>{group.rules.length} 条规则</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-muted-foreground border-b text-left text-xs uppercase">
            <tr>
              <th className="w-[180px] py-2 pr-4 font-medium">规则</th>
              <th className="w-[100px] py-2 pr-4 font-medium">状态</th>
              <th className="w-[90px] py-2 pr-4 font-medium">严重级别</th>
              <th className="py-2 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {group.rules.map((rule) => (
              <tr
                key={rule.ruleId}
                className="border-b align-top last:border-b-0"
              >
                <td className="w-[180px] py-3 pr-4">
                  <div className="font-medium">{rule.ruleId}</div>
                  <div className="text-muted-foreground text-xs">
                    {rule.ruleName}
                  </div>
                </td>
                <td className="w-[100px] py-3 pr-4">
                  <Badge className={cn("border", statusClasses(rule.status))}>
                    {rule.status}
                  </Badge>
                </td>
                <td className="w-[90px] py-3 pr-4">{rule.severity}</td>
                <td className="py-3">{rule.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  ));
}

function ArtifactActions({
  threadId,
  audit,
}: {
  threadId: string;
  audit: ScoutAuditViewModel;
}) {
  const actions = [
    {
      href: urlOfArtifact({
        filepath: audit.files.resultsPath,
        threadId,
        download: true,
      }),
      icon: FileJsonIcon,
      label: "下载 results.json",
    },
    {
      href: urlOfArtifact({
        filepath: audit.files.reportPath,
        threadId,
        download: true,
      }),
      icon: FileTextIcon,
      label: "下载 audit-report.md",
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button key={action.label} variant="outline" size="sm" asChild>
          <a href={action.href} target="_blank" rel="noreferrer">
            <action.icon />
            {action.label}
          </a>
        </Button>
      ))}
    </div>
  );
}

function AuditReviewActions({
  onApprove,
  onRejectOpen,
}: {
  onApprove: () => void;
  onRejectOpen: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
        onClick={onApprove}
      >
        <CheckCircle2Icon />
        {t.audits.approve}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="border-rose-500/20 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
        onClick={onRejectOpen}
      >
        <XCircleIcon />
        {t.audits.reject}
      </Button>
    </div>
  );
}

function AuditEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex size-full items-center justify-center p-6">
      <Empty className="max-w-2xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FlaskConicalIcon />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function AuditDashboard({
  threadId,
  threadTitle,
  audit,
  isLoading,
  error,
  hasArtifacts,
}: {
  threadId: string;
  threadTitle: string;
  audit?: ScoutAuditViewModel | null;
  isLoading: boolean;
  error?: Error | null;
  hasArtifacts: boolean;
}) {
  const { t } = useI18n();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function handleApprove() {
    toast.success(t.audits.approveToast);
  }

  function handleRejectOpen() {
    setRejectReason("");
    setRejectDialogOpen(true);
  }

  function handleRejectSubmit() {
    toast.success(t.audits.rejectSubmitToast);
    setRejectDialogOpen(false);
  }

  if (isLoading) {
    return (
      <AuditEmpty
        title="正在加载审核结果"
        description="正在读取该线程下的 scout-audit 产物文件。"
      />
    );
  }

  if (error) {
    return (
      <AuditEmpty
        title="审核结果加载失败"
        description={error.message || "该线程的结果文件无法解析。"}
      />
    );
  }

  if (!hasArtifacts || !audit) {
    return (
      <AuditEmpty
        title="该线程暂无审核结果"
        description="当前线程下没有找到完整的 scout-audit 两件套输出文件。"
      />
    );
  }

  const passProgress =
    audit.results.summary.applicableCount > 0
      ? (audit.results.summary.passCount /
          audit.results.summary.applicableCount) *
        100
      : 0;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <section className="from-background via-background to-primary/5 relative overflow-hidden rounded-3xl border bg-linear-to-br p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="text-muted-foreground text-sm">{threadTitle}</div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {audit.auditMode === "joint"
                    ? audit.header.batchNo
                    : audit.header.reportNo}
                </h1>
                <Badge
                  className={cn(
                    "border",
                    statusClasses(audit.header.overallResult),
                  )}
                >
                  {audit.header.overallResult}
                </Badge>
              </div>
              <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span>批号 {audit.header.batchNo}</span>
                {audit.auditMode === "joint" ? (
                  Object.entries(audit.documentResults ?? {}).map(
                    ([key, doc]) => (
                      <span key={key}>
                        {doc.docType}: {doc.reportNo}
                      </span>
                    ),
                  )
                ) : (
                  <span>文档类型 {audit.header.docType}</span>
                )}
                {audit.header.auditDate && (
                  <span>审核日期 {audit.header.auditDate}</span>
                )}
                {audit.header.standardRef && (
                  <span>标准 {audit.header.standardRef}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <AuditReviewActions
                onApprove={handleApprove}
                onRejectOpen={handleRejectOpen}
              />
              <div className="bg-border mx-1 h-6 w-px" />
              <ArtifactActions threadId={threadId} audit={audit} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {audit.summaryCards.map((card) => (
              <Card key={card.label} className="gap-3 py-5">
                <CardHeader className="px-5 pb-0">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className={cn("text-3xl", toneClasses(card.tone))}>
                    {card.value}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.audits.rejectDialogTitle}</DialogTitle>
              <DialogDescription>
                {t.audits.rejectDialogDescription}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <label className="text-sm font-medium">
                {t.audits.rejectReasonLabel}
              </label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t.audits.rejectReasonPlaceholder}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRejectDialogOpen(false)}
              >
                {t.common.cancel}
              </Button>
              <Button variant="destructive" onClick={handleRejectSubmit}>
                {t.audits.rejectSubmit}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="overview" className="gap-4">
          <TabsList
            variant="line"
            className="w-full justify-start overflow-auto"
          >
            <TabsTrigger value="overview">总览</TabsTrigger>
            <TabsTrigger value="rules">规则结果</TabsTrigger>
            <TabsTrigger value="corrections">修正记录</TabsTrigger>
            <TabsTrigger value="report">原始报告</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle>报告信息</CardTitle>
                  <CardDescription>从报告信息提取的核心字段</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-muted-foreground text-xs">品名</div>
                    <div className="font-medium">
                      {audit.header.productName ?? "未提供"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground text-xs">规格</div>
                    <div className="font-medium">
                      {audit.header.specification ?? "未提供"}
                    </div>
                  </div>
                  {audit.auditMode === "joint" ? (
                    Object.entries(audit.documentResults ?? {}).map(
                      ([key, doc]) => (
                        <div key={key} className="space-y-1">
                          <div className="text-muted-foreground text-xs">
                            {doc.docType} 报告编号
                          </div>
                          <div className="font-medium">{doc.reportNo}</div>
                        </div>
                      ),
                    )
                  ) : (
                    <>
                      <div className="space-y-1">
                        <div className="text-muted-foreground text-xs">
                          报告编号
                        </div>
                        <div className="font-medium">
                          {audit.header.reportNo}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-muted-foreground text-xs">
                          批号
                        </div>
                        <div className="font-medium">
                          {audit.header.batchNo}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>审核完成度</CardTitle>
                  <CardDescription>适用规则通过率与生成元信息</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>适用规则通过率</span>
                      <span>
                        {audit.results.summary.passCount}/
                        {audit.results.summary.applicableCount}
                      </span>
                    </div>
                    <Progress value={passProgress} />
                  </div>
                  <div className="grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <div className="text-muted-foreground text-xs">
                        生成方式
                      </div>
                      <div className="font-medium">
                        {audit.results.metadata?.reportMethod ?? "未知"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">
                        生成器
                      </div>
                      <div className="font-medium">
                        {audit.results.metadata?.generatedBy ?? "未知"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">
                        LIMS数据
                      </div>
                      <div className="font-medium">
                        {audit.results.metadata?.limsAvailable
                          ? "可用"
                          : "不可用"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">
                        规则引擎
                      </div>
                      <div className="font-medium">
                        {audit.results.metadata?.ruleEngineAvailable
                          ? "可用"
                          : "不可用"}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {audit.auditMode === "joint" && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>各文档审核摘要</CardTitle>
                    <CardDescription>
                      COA / ELN / 跨文档规则各自统计
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-sm">
                      <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                        <tr>
                          <th className="py-2 pr-4 font-medium">文档</th>
                          <th className="py-2 pr-4 font-medium">报告编号</th>
                          <th className="py-2 pr-4 font-medium">PASS</th>
                          <th className="py-2 pr-4 font-medium">FAIL</th>
                          <th className="py-2 pr-4 font-medium">SKIP</th>
                          <th className="py-2 pr-4 font-medium">合计</th>
                          <th className="py-2 font-medium">结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(audit.documentResults ?? {}).map(
                          ([key, doc]) => (
                            <tr key={key} className="border-b last:border-b-0">
                              <td className="py-2 pr-4 font-medium">
                                {doc.docType}
                              </td>
                              <td className="py-2 pr-4">{doc.reportNo}</td>
                              <td className="py-2 pr-4 text-emerald-600">
                                {doc.results.summary.passCount}
                              </td>
                              <td className="py-2 pr-4 text-rose-600">
                                {doc.results.summary.failCount}
                              </td>
                              <td className="py-2 pr-4 text-amber-600">
                                {doc.results.summary.skipCount}
                              </td>
                              <td className="py-2 pr-4">
                                {doc.results.summary.totalRules}
                              </td>
                              <td className="py-2">
                                <Badge
                                  className={cn(
                                    "border",
                                    statusClasses(doc.overallResult),
                                  )}
                                >
                                  {doc.overallResult}
                                </Badge>
                              </td>
                            </tr>
                          ),
                        )}
                        {(audit.crossDocumentRuleGroups?.length ?? 0) > 0 && (
                          <tr className="border-b last:border-b-0">
                            <td className="py-2 pr-4 font-medium">跨文档</td>
                            <td className="py-2 pr-4">—</td>
                            <td className="py-2 pr-4 text-emerald-600">
                              {audit.crossDocumentRuleGroups?.reduce(
                                (sum, g) =>
                                  sum +
                                  g.rules.filter((r) => r.status === "PASS")
                                    .length,
                                0,
                              ) ?? 0}
                            </td>
                            <td className="py-2 pr-4 text-rose-600">
                              {audit.crossDocumentRuleGroups?.reduce(
                                (sum, g) =>
                                  sum +
                                  g.rules.filter((r) => r.status === "FAIL")
                                    .length,
                                0,
                              ) ?? 0}
                            </td>
                            <td className="py-2 pr-4 text-amber-600">
                              {audit.crossDocumentRuleGroups?.reduce(
                                (sum, g) =>
                                  sum +
                                  g.rules.filter((r) => r.status === "SKIP")
                                    .length,
                                0,
                              ) ?? 0}
                            </td>
                            <td className="py-2 pr-4">
                              {audit.crossDocumentRuleGroups?.reduce(
                                (sum, g) => sum + g.rules.length,
                                0,
                              ) ?? 0}
                            </td>
                            <td className="py-2">
                              <Badge
                                className={cn(
                                  "border",
                                  statusClasses(
                                    audit.crossDocumentRuleGroups?.some((g) =>
                                      g.rules.some((r) => r.status === "FAIL"),
                                    )
                                      ? "FAIL"
                                      : "PASS",
                                  ),
                                )}
                              >
                                {audit.crossDocumentRuleGroups?.some((g) =>
                                  g.rules.some((r) => r.status === "FAIL"),
                                )
                                  ? "FAIL"
                                  : "PASS"}
                              </Badge>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            {audit.auditMode === "joint" ? (
              <Tabs
                defaultValue={Object.keys(audit.documentResults ?? {})[0]}
                className="gap-4"
              >
                <TabsList variant="line" className="justify-start">
                  {Object.entries(audit.documentResults ?? {}).map(
                    ([key, doc]) => (
                      <TabsTrigger key={key} value={key}>
                        {doc.docType}
                      </TabsTrigger>
                    ),
                  )}
                  {(audit.crossDocumentRuleGroups?.length ?? 0) > 0 && (
                    <TabsTrigger value="__cross">跨文档规则</TabsTrigger>
                  )}
                </TabsList>
                {Object.entries(audit.documentResults ?? {}).map(
                  ([key, doc]) => (
                    <TabsContent key={key} value={key} className="space-y-4">
                      <RuleGroupTable groups={doc.ruleGroups} />
                    </TabsContent>
                  ),
                )}
                {(audit.crossDocumentRuleGroups?.length ?? 0) > 0 && (
                  <TabsContent value="__cross" className="space-y-4">
                    <RuleGroupTable groups={audit.crossDocumentRuleGroups!} />
                  </TabsContent>
                )}
              </Tabs>
            ) : (
              <RuleGroupTable groups={audit.ruleGroups} />
            )}
          </TabsContent>

          <TabsContent value="corrections" className="space-y-4">
            {audit.corrections.length === 0 ? (
              <AuditEmpty
                title="没有修正记录"
                description="该次审核没有从 FAIL 修正为其他状态的规则。"
              />
            ) : (
              audit.corrections.map((correction) => (
                <Card key={`${correction.ruleId}-${correction.reason}`}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <CardTitle>{correction.ruleId}</CardTitle>
                      <Badge
                        className={cn(
                          "border",
                          statusClasses(correction.correctedTo),
                        )}
                      >
                        {correction.originalStatus} → {correction.correctedTo}
                      </Badge>
                    </div>
                    <CardDescription>规则修正说明</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm leading-6">
                    {correction.reason}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="report" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Markdown 报告</CardTitle>
                <CardDescription>直接预览 audit-report.md 内容</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Streamdown>{audit.reportMarkdown}</Streamdown>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function AuditThreadMissing({ threadId }: { threadId?: string }) {
  return (
    <div className="flex size-full items-center justify-center p-6">
      <Empty className="max-w-2xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {threadId ? <AlertCircleIcon /> : <ListChecksIcon />}
          </EmptyMedia>
          <EmptyTitle>{threadId ? "线程不存在" : "选择一个线程"}</EmptyTitle>
          <EmptyDescription>
            {threadId
              ? "该路由参数对应的线程未找到。"
              : "从左侧列表中选择一个线程以查看审核结果。"}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function AuditPageMeta({ result }: { result: string }) {
  const Icon =
    result === "PASS"
      ? CheckCircle2Icon
      : result === "SKIP"
        ? HourglassIcon
        : AlertCircleIcon;

  return (
    <Badge className={cn("border", statusClasses(result))}>
      <Icon />
      {result}
    </Badge>
  );
}
