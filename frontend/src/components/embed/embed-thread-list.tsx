"use client";

import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { embedHref } from "@/components/embed/embed-mode";
import { EmbedThreadItem } from "@/components/embed/embed-thread-item";
import { useEmbedThreads } from "@/components/embed/use-embed-threads";
import { Button } from "@/components/ui/button";
import { resetThreadChatAfterDelete } from "@/components/workspace/chats/use-thread-chat";
import { useI18n } from "@/core/i18n/hooks";
import type { AgentThread } from "@/core/threads/types";
import { pathOfThread } from "@/core/threads/utils";

function getMutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

/**
 * Compact, collapsible conversation panel for EMBED mode — the thread
 * management slice of WorkspaceSidebar, rebuilt on the same shared hooks
 * (§9.2: import, never copy). All navigations carry `?embed=true` via
 * {@link embedHref} so the shell never falls out of EMBED mode.
 */
export function EmbedThreadList() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { thread_id: activeThreadId } = useParams<{ thread_id?: string }>();
  const [collapsed, setCollapsed] = useState(false);

  const {
    threads,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    deleteThread,
    renameThread,
    togglePinned,
  } = useEmbedThreads(activeThreadId);

  const handleNewChat = useCallback(() => {
    router.push(embedHref(pathOfThread("new")));
  }, [router]);

  const handleSelect = useCallback(
    (thread: AgentThread) => {
      router.push(embedHref(pathOfThread(thread)));
    },
    [router],
  );

  const handleTogglePinned = useCallback(
    (thread: AgentThread) => {
      void togglePinned(thread).catch((error: unknown) => {
        toast.error(getMutationErrorMessage(error, t.chats.pinChatFailed));
      });
    },
    [t.chats.pinChatFailed, togglePinned],
  );

  const handleRename = useCallback(
    (thread: AgentThread, title: string) => {
      void renameThread({ threadId: thread.thread_id, title }).catch(
        (error: unknown) => {
          toast.error(getMutationErrorMessage(error, t.common.renameFailed));
        },
      );
    },
    [renameThread, t.common.renameFailed],
  );

  const handleDelete = useCallback(
    (thread: AgentThread) => {
      const nextPath = pathOfThread("new");
      const isCurrentThread =
        thread.thread_id === activeThreadId ||
        pathOfThread(thread) === pathname;
      void deleteThread({
        threadId: thread.thread_id,
        onRemoteDeleted: isCurrentThread
          ? () => {
              resetThreadChatAfterDelete({
                deletedThreadId: thread.thread_id,
                nextPath,
                force: true,
              });
              void router.replace(embedHref(nextPath));
            }
          : undefined,
      }).catch((error: unknown) => {
        toast.error(getMutationErrorMessage(error, t.chats.deleteChatFailed));
      });
    },
    [activeThreadId, deleteThread, pathname, router, t.chats.deleteChatFailed],
  );

  if (collapsed) {
    return (
      <aside
        data-embed-thread-list="true"
        aria-label={t.sidebar.chats}
        className="bg-background/50 flex h-full min-h-0 w-11 shrink-0 flex-col items-center gap-1 border-r py-2"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.shortcuts.toggleSidebar}
          title={t.shortcuts.toggleSidebar}
          onClick={() => setCollapsed(false)}
          data-testid="embed-thread-list-expand"
        >
          <PanelLeftOpen aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.sidebar.newChat}
          title={t.sidebar.newChat}
          onClick={handleNewChat}
        >
          <Plus aria-hidden="true" />
        </Button>
      </aside>
    );
  }

  let listBody: ReactNode;
  if (threads.length === 0) {
    listBody = isLoading ? null : (
      <p className="text-muted-foreground px-3 py-6 text-center text-xs">
        {t.chats.noChats}
      </p>
    );
  } else {
    listBody = (
      <>
        {threads.map((thread) => (
          <EmbedThreadItem
            key={thread.thread_id}
            thread={thread}
            isActive={pathOfThread(thread) === pathname}
            onSelect={handleSelect}
            onTogglePinned={handleTogglePinned}
            onDelete={handleDelete}
            onRename={handleRename}
          />
        ))}
        {hasMore && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mx-1 my-1 justify-center text-xs"
            disabled={isLoadingMore}
            onClick={loadMore}
            data-testid="embed-thread-list-load-more"
          >
            {isLoadingMore ? t.chats.loadingMore : t.chats.loadOlderChats}
          </Button>
        )}
      </>
    );
  }

  return (
    <aside
      data-embed-thread-list="true"
      aria-label={t.sidebar.chats}
      className="bg-background/50 flex h-full min-h-0 w-56 shrink-0 flex-col border-r"
    >
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        <span className="text-muted-foreground min-w-0 grow truncate px-1 text-xs font-medium">
          {t.sidebar.chats}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.shortcuts.toggleSidebar}
          title={t.shortcuts.toggleSidebar}
          onClick={() => setCollapsed(true)}
          data-testid="embed-thread-list-collapse"
        >
          <PanelLeftClose aria-hidden="true" />
        </Button>
      </div>
      <div className="shrink-0 px-2 pb-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-1.5 text-xs"
          onClick={handleNewChat}
          data-testid="embed-thread-list-new-chat"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          {t.sidebar.newChat}
        </Button>
      </div>
      <nav
        aria-label={t.sidebar.recentChats}
        className="flex min-h-0 grow flex-col gap-0.5 overflow-y-auto p-1"
      >
        {listBody}
      </nav>
    </aside>
  );
}
