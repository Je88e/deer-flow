"use client";

import { Toaster } from "sonner";

import { QueryClientProvider } from "@/components/query-client-provider";
import { AuditThreadList } from "@/components/workspace/scout-audit/audit-thread-list";
import { pathOfScoutAuditThread } from "@/core/scout-audit/utils";
import { useThreads } from "@/core/threads/hooks";

function ScoutAuditLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: threads = [] } = useThreads();

  return (
    <div className="flex h-screen w-full flex-col">
      <div className="flex min-h-0 flex-1">
        <AuditThreadList
          threads={threads}
          pathBuilder={pathOfScoutAuditThread}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <Toaster position="top-center" />
    </div>
  );
}

export default function ScoutAuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider>
      <ScoutAuditLayoutInner>{children}</ScoutAuditLayoutInner>
    </QueryClientProvider>
  );
}
