"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuditThreadMissing } from "@/components/workspace/scout-audit/audit-dashboard";
import { useI18n } from "@/core/i18n/hooks";
import { pathOfAuditThread } from "@/core/scout-audit/utils";
import { useThreads } from "@/core/threads/hooks";

export default function AuditsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: threads = [] } = useThreads();

  useEffect(() => {
    document.title = `${t.pages.audits} - ${t.pages.appName}`;
  }, [t.pages.appName, t.pages.audits]);

  useEffect(() => {
    if (threads[0]?.thread_id) {
      void router.replace(pathOfAuditThread(threads[0].thread_id));
    }
  }, [router, threads]);

  return <AuditThreadMissing />;
}
