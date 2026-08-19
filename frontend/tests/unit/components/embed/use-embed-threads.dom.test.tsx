import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { renderHook } from "@testing-library/react";

// The wrapper under test must delegate all data work to the shared thread
// hooks; stub the four exports it imports so these tests pin the contract
// (arguments, normalization, active-thread shaping) without a backend.
rs.mock("@/core/threads/hooks", () => ({
  useInfiniteThreads: rs.fn(),
  useDeleteThread: rs.fn(),
  usePinThread: rs.fn(),
  useRenameThread: rs.fn(),
}));

import { useEmbedThreads } from "@/components/embed/use-embed-threads";
import {
  useDeleteThread,
  useInfiniteThreads,
  usePinThread,
  useRenameThread,
} from "@/core/threads/hooks";
import type { AgentThread } from "@/core/threads/types";

const mockedUseInfiniteThreads = rs.mocked(useInfiniteThreads);
const mockedUseDeleteThread = rs.mocked(useDeleteThread);
const mockedUsePinThread = rs.mocked(usePinThread);
const mockedUseRenameThread = rs.mocked(useRenameThread);

function makeThread(
  threadId: string,
  overrides: Partial<AgentThread> = {},
): AgentThread {
  return {
    thread_id: threadId,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    status: "idle",
    metadata: {},
    values: {
      title: `Thread ${threadId}`,
      messages: [],
      artifacts: [],
      todos: [],
    },
    ...overrides,
  } as AgentThread;
}

function setupInfiniteThreads(
  pages: AgentThread[][],
  options: {
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    isLoading?: boolean;
  } = {},
) {
  const fetchNextPage = rs.fn();
  mockedUseInfiniteThreads.mockReturnValue({
    data: { pages, pageParams: pages.map((_, index) => index) },
    fetchNextPage,
    hasNextPage: options.hasNextPage ?? false,
    isFetchingNextPage: options.isFetchingNextPage ?? false,
    isLoading: options.isLoading ?? false,
  } as unknown as ReturnType<typeof useInfiniteThreads>);
  return fetchNextPage;
}

function setupMutations() {
  const deleteMutateAsync = rs.fn(async () => []);
  const pinMutateAsync = rs.fn(async () => ({}));
  const renameMutateAsync = rs.fn(async () => undefined);
  mockedUseDeleteThread.mockReturnValue({
    mutateAsync: deleteMutateAsync,
  } as unknown as ReturnType<typeof useDeleteThread>);
  mockedUsePinThread.mockReturnValue({
    mutateAsync: pinMutateAsync,
  } as unknown as ReturnType<typeof usePinThread>);
  mockedUseRenameThread.mockReturnValue({
    mutateAsync: renameMutateAsync,
  } as unknown as ReturnType<typeof useRenameThread>);
  return { deleteMutateAsync, pinMutateAsync, renameMutateAsync };
}

afterEach(() => {
  rs.clearAllMocks();
});

describe("useEmbedThreads", () => {
  it("shapes threads through buildThreadListModel (pinned first, deduped across pages)", () => {
    setupMutations();
    const pinned = makeThread("t1", {
      metadata: { deerflow_pinned: true },
    });
    const second = makeThread("t2");
    const third = makeThread("t3");
    setupInfiniteThreads([
      [second, pinned],
      [second, third],
    ]);

    const { result } = renderHook(() => useEmbedThreads());

    expect(result.current.threads.map((thread) => thread.thread_id)).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
  });

  it("keeps the active thread visible when it falls outside the displayed window", () => {
    setupMutations();
    // buildThreadListModel displays pinned threads plus the first 200
    // unpinned ones, so thread #201 is loaded but hidden.
    const many = Array.from({ length: 205 }, (_, index) =>
      makeThread(`t${index + 1}`),
    );
    setupInfiniteThreads([many]);

    const { result, rerender } = renderHook(
      ({ activeThreadId }: { activeThreadId?: string }) =>
        useEmbedThreads(activeThreadId),
      { initialProps: { activeThreadId: "t100" as string | undefined } },
    );

    expect(
      result.current.threads.some((thread) => thread.thread_id === "t100"),
    ).toBe(true);
    expect(
      result.current.threads.some((thread) => thread.thread_id === "t205"),
    ).toBe(false);

    rerender({ activeThreadId: "t205" });
    const activeThread = result.current.threads.at(-1);
    expect(activeThread?.thread_id).toBe("t205");
  });

  it("ignores the 'new' sentinel as an active thread", () => {
    setupMutations();
    setupInfiniteThreads([[makeThread("t1")]]);

    const { result } = renderHook(() => useEmbedThreads("new"));

    expect(result.current.threads.map((thread) => thread.thread_id)).toEqual([
      "t1",
    ]);
  });

  it("normalizes the pagination flags and forwards loadMore", () => {
    const fetchNextPage = setupInfiniteThreads([[makeThread("t1")]], {
      hasNextPage: true,
      isFetchingNextPage: true,
      isLoading: true,
    });
    setupMutations();

    const { result } = renderHook(() => useEmbedThreads());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isLoadingMore).toBe(true);
    expect(result.current.hasMore).toBe(true);

    result.current.loadMore();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("reports hasMore=false once the query has no next page", () => {
    setupInfiniteThreads([[makeThread("t1")]], { hasNextPage: false });
    setupMutations();

    const { result } = renderHook(() => useEmbedThreads());

    expect(result.current.hasMore).toBe(false);
  });

  it("delegates delete and rename to the shared mutations", async () => {
    setupInfiniteThreads([[makeThread("t1")]]);
    const { deleteMutateAsync, renameMutateAsync } = setupMutations();

    const { result } = renderHook(() => useEmbedThreads());

    await result.current.deleteThread({
      threadId: "t1",
      onRemoteDeleted: undefined,
    });
    expect(deleteMutateAsync).toHaveBeenCalledWith({
      threadId: "t1",
      onRemoteDeleted: undefined,
    });

    await result.current.renameThread({ threadId: "t1", title: "Renamed" });
    expect(renameMutateAsync).toHaveBeenCalledWith({
      threadId: "t1",
      title: "Renamed",
    });
  });

  it("flips the pinned state when toggling a pin", async () => {
    setupInfiniteThreads([
      [
        makeThread("t1", { metadata: { deerflow_pinned: true } }),
        makeThread("t2"),
      ],
    ]);
    const { pinMutateAsync } = setupMutations();

    const { result } = renderHook(() => useEmbedThreads());
    const [pinnedThread, unpinnedThread] = result.current.threads;

    await result.current.togglePinned(pinnedThread!);
    expect(pinMutateAsync).toHaveBeenCalledWith({
      threadId: "t1",
      pinned: false,
    });

    await result.current.togglePinned(unpinnedThread!);
    expect(pinMutateAsync).toHaveBeenCalledWith({
      threadId: "t2",
      pinned: true,
    });
  });
});
