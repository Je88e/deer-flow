"use client";

import { useMemo } from "react";

import {
  useDeleteThread,
  useInfiniteThreads,
  usePinThread,
  useRenameThread,
} from "@/core/threads/hooks";
import {
  buildThreadListModel,
  type ThreadListModel,
} from "@/core/threads/thread-list-model";
import type { AgentThread } from "@/core/threads/types";
import { isThreadPinned } from "@/core/threads/utils";

export type UseEmbedThreadsResult = {
  /** Threads to render: pinned first, plus the active thread even if it falls outside the displayed window. */
  threads: readonly AgentThread[];
  /** True while the first page of threads is still loading. */
  isLoading: boolean;
  /** True while the next page is being fetched. */
  isLoadingMore: boolean;
  /** True when another page can be requested via `loadMore`. */
  hasMore: boolean;
  /** Requests the next page. */
  loadMore: () => void;
  /** Deletes a thread (and its sidecar threads) via the shared mutation. */
  deleteThread: ReturnType<typeof useDeleteThread>["mutateAsync"];
  /** Renames a thread via the shared mutation. */
  renameThread: ReturnType<typeof useRenameThread>["mutateAsync"];
  /** Flips a thread's pinned state via the shared mutation. */
  togglePinned: (thread: AgentThread) => Promise<unknown>;
};

/**
 * Thin EMBED-mode adapter over the shared thread hooks (§9.2 reuse: import,
 * never copy). Data fetching is entirely `useInfiniteThreads` plus
 * `buildThreadListModel`; the only logic here is the embed-specific shaping —
 * normalized pagination flags and keeping the active thread visible in the
 * compact panel even when it is not part of the displayed window.
 *
 * @param activeThreadId Route-derived thread id (`useParams().thread_id`);
 *   pass the literal "new" route value or undefined when none is active.
 */
export function useEmbedThreads(
  activeThreadId?: string | null,
): UseEmbedThreadsResult {
  const {
    data: infiniteThreads,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteThreads();

  const model: ThreadListModel = useMemo(
    () => buildThreadListModel(infiniteThreads?.pages ?? []),
    [infiniteThreads?.pages],
  );

  const threads = useMemo(() => {
    if (!activeThreadId || activeThreadId === "new") {
      return model.displayedThreads;
    }
    const isActiveVisible = model.displayedThreads.some(
      (thread) => thread.thread_id === activeThreadId,
    );
    if (isActiveVisible) {
      return model.displayedThreads;
    }
    const activeThread = model.byId.get(activeThreadId);
    return activeThread
      ? [...model.displayedThreads, activeThread]
      : model.displayedThreads;
  }, [activeThreadId, model]);

  const { mutateAsync: deleteThread } = useDeleteThread();
  const { mutateAsync: renameThread } = useRenameThread();
  const { mutateAsync: updatePinnedThread } = usePinThread();

  const togglePinned = async (thread: AgentThread) =>
    updatePinnedThread({
      threadId: thread.thread_id,
      pinned: !isThreadPinned(thread),
    });

  const loadMore = () => {
    void fetchNextPage();
  };

  return {
    threads,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    hasMore: Boolean(hasNextPage && model.canLoadMore),
    loadMore,
    deleteThread,
    renameThread,
    togglePinned,
  };
}
