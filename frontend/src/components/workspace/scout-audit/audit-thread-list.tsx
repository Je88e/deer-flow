"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScoutAuditHeader } from "@/core/scout-audit/hooks";
import { pathOfAuditThread } from "@/core/scout-audit/utils";
import { useThreadState } from "@/core/threads/hooks";
import type { AgentThread } from "@/core/threads/types";
import { titleOfThread } from "@/core/threads/utils";
import { formatTimeAgo } from "@/core/utils/datetime";
import { cn } from "@/lib/utils";

function AuditThreadRow({
  thread,
  isActive,
}: {
  thread: AgentThread;
  isActive: boolean;
}) {
  const { data: state } = useThreadState(thread.thread_id);
  const artifactPaths =
    state?.values?.artifacts ?? thread.values.artifacts ?? [];
  const { data: auditHeader } = useScoutAuditHeader({
    threadId: thread.thread_id,
    artifactPaths,
  });
  const artifactCount =
    state?.values?.artifacts?.length ?? thread.values.artifacts?.length ?? 0;
  const threadTitle = titleOfThread(thread);
  const displayTitle = auditHeader
    ? `${auditHeader.reportNo}${auditHeader.productName ? ` ${auditHeader.productName}` : ""}`
    : threadTitle;

  return (
    <Link
      href={pathOfAuditThread(thread.thread_id)}
      className={cn(
        "hover:bg-accent mb-1 rounded-xl border px-3 py-3 transition-colors",
        isActive ? "border-primary/40 bg-primary/5" : "border-transparent",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="line-clamp-2 text-sm font-medium">{displayTitle}</div>
        <Badge variant="outline" className="text-[10px]">
          {artifactCount} 文件
        </Badge>
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="truncate">{threadTitle}</span>
        {thread.updated_at && <span>{formatTimeAgo(thread.updated_at)}</span>}
      </div>
    </Link>
  );
}

export function AuditThreadList({ threads }: { threads: AgentThread[] }) {
  const params = useParams<{ thread_id?: string }>();
  const [search, setSearch] = useState("");

  const filteredThreads = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return threads;
    }

    return threads.filter((thread) => {
      return titleOfThread(thread).toLowerCase().includes(keyword);
    });
  }, [search, threads]);

  return (
    <aside className="bg-background/80 flex w-full max-w-80 shrink-0 flex-col border-r backdrop-blur">
      <div className="border-b px-4 py-4">
        <div className="mb-3">
          <div className="text-sm font-semibold">Scout Audit</div>
        </div>
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            className="pl-9"
            placeholder="搜索审核结果"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col p-2">
          {filteredThreads.map((thread) => {
            const isActive = params.thread_id === thread.thread_id;
            return (
              <AuditThreadRow
                key={thread.thread_id}
                thread={thread}
                isActive={isActive}
              />
            );
          })}
          {filteredThreads.length === 0 && (
            <div className="text-muted-foreground px-3 py-6 text-sm">
              没有匹配的线程
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
