"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  searchKeyword,
  onMatchChange,
  pathBuilder,
}: {
  thread: AgentThread;
  isActive: boolean;
  searchKeyword: string;
  onMatchChange: (id: string, matched: boolean) => void;
  pathBuilder: (threadId: string) => string;
}) {
  const { data: state } = useThreadState(thread.thread_id);
  const artifactPaths =
    state?.values?.artifacts ?? thread.values.artifacts ?? [];
  const { data: auditHeader } = useScoutAuditHeader({
    threadId: thread.thread_id,
    artifactPaths,
  });
  const threadTitle = titleOfThread(thread);
  const displayTitle = auditHeader
    ? `${auditHeader.batchNo} ${auditHeader.reportNo}${auditHeader.productName ? ` ${auditHeader.productName}` : ""}`
    : threadTitle;

  const matched =
    !searchKeyword || displayTitle.toLowerCase().includes(searchKeyword);

  useEffect(() => {
    onMatchChange(thread.thread_id, matched);
  }, [matched, onMatchChange, thread.thread_id]);

  if (!matched) return null;

  const statusLabel = auditHeader?.overallResult;
  const statusStyle = {
    PASS: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
    FAIL: "border-red-500/50 text-red-600 dark:text-red-400",
    CONDITIONAL_PASS: "border-amber-500/50 text-amber-600 dark:text-amber-400",
    SKIP: "border-muted text-muted-foreground",
  }[statusLabel ?? "SKIP"];

  const subtitle = auditHeader
    ? [auditHeader.docType, auditHeader.auditDate].filter(Boolean).join(" · ")
    : threadTitle;

  return (
    <Link
      href={pathBuilder(thread.thread_id)}
      className={cn(
        "hover:bg-accent mb-1 rounded-xl border px-3 py-3 transition-colors",
        isActive ? "border-primary/40 bg-primary/5" : "border-transparent",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="line-clamp-2 text-sm font-medium">{displayTitle}</div>
        {statusLabel && (
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[10px]", statusStyle)}
          >
            {statusLabel}
          </Badge>
        )}
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="truncate">{subtitle}</span>
        {thread.updated_at && <span>{formatTimeAgo(thread.updated_at)}</span>}
      </div>
    </Link>
  );
}

export function AuditThreadList({
  threads,
  pathBuilder = pathOfAuditThread,
}: {
  threads: AgentThread[];
  pathBuilder?: (threadId: string) => string;
}) {
  const params = useParams<{ thread_id?: string }>();
  const [search, setSearch] = useState("");

  const searchKeyword = useMemo(() => search.trim().toLowerCase(), [search]);
  const [matchMap, setMatchMap] = useState<Record<string, boolean>>({});

  const handleMatchChange = useCallback((id: string, matched: boolean) => {
    setMatchMap((prev) =>
      prev[id] === matched ? prev : { ...prev, [id]: matched },
    );
  }, []);

  const hasVisibleThreads = threads.some(
    (t) => matchMap[t.thread_id] !== false,
  );

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
          {threads.map((thread) => {
            const isActive = params.thread_id === thread.thread_id;
            return (
              <AuditThreadRow
                key={thread.thread_id}
                thread={thread}
                isActive={isActive}
                searchKeyword={searchKeyword}
                onMatchChange={handleMatchChange}
                pathBuilder={pathBuilder}
              />
            );
          })}
          {!hasVisibleThreads && searchKeyword && (
            <div className="text-muted-foreground px-3 py-6 text-sm">
              没有匹配的线程
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
