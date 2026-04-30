"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import {
  AuditDashboard,
  AuditThreadMissing,
} from "@/components/workspace/scout-audit/audit-dashboard";
import { useI18n } from "@/core/i18n/hooks";
import { useScoutAudit } from "@/core/scout-audit/hooks";
import { useThreads } from "@/core/threads/hooks";
import { titleOfThread } from "@/core/threads/utils";

export default function AuditThreadPage() {
  const { t } = useI18n();
  const params = useParams<{ thread_id: string }>();
  const threadId = params.thread_id;
  const { data: threads = [] } = useThreads();

  const thread = useMemo(() => {
    return threads.find((item) => item.thread_id === threadId);
  }, [threadId, threads]);

  const artifactPaths = thread?.values.artifacts ?? [];
  const audit = useScoutAudit({
    threadId,
    artifactPaths,
  });
  const auditError = audit.error instanceof Error ? audit.error : null;

  useEffect(() => {
    const title = thread ? titleOfThread(thread) : t.pages.untitled;
    document.title = `${title} - ${t.pages.audits} - ${t.pages.appName}`;
  }, [t.pages.appName, t.pages.audits, t.pages.untitled, thread]);

  if (!thread) {
    return <AuditThreadMissing threadId={threadId} />;
  }

  return (
    <AuditDashboard
      threadId={threadId}
      threadTitle={titleOfThread(thread)}
      audit={audit.data ?? undefined}
      isLoading={audit.isLoading}
      error={auditError}
      hasArtifacts={audit.hasArtifacts}
    />
  );
}
