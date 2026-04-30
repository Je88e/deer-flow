"use client";

import { AuditThreadList } from "@/components/workspace/scout-audit/audit-thread-list";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useThreads } from "@/core/threads/hooks";

export default function AuditsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: threads = [] } = useThreads();

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody className="items-stretch">
        <div className="flex size-full min-h-0">
          <AuditThreadList threads={threads} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
