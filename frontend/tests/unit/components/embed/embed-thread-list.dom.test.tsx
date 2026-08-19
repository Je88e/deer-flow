import { afterEach, beforeEach, describe, expect, it, rs } from "@rstest/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { toast } from "sonner";

import { EmbedThreadList } from "@/components/embed/embed-thread-list";
import { resetThreadChatAfterDelete } from "@/components/workspace/chats/use-thread-chat";
import type { AgentThread } from "@/core/threads/types";

// Navigation doubles live on globalThis because rs.mock factories are hoisted
// above every module-scope binding; the holder keeps them reachable from the
// assertions without tripping "accessed before initialization".
type NavDouble = {
  pathname: string;
  threadId: string | undefined;
  push: ReturnType<typeof rs.fn>;
  replace: ReturnType<typeof rs.fn>;
};

type ListDouble = {
  threads: AgentThread[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: ReturnType<typeof rs.fn>;
  deleteThread: ReturnType<typeof rs.fn>;
  renameThread: ReturnType<typeof rs.fn>;
  togglePinned: ReturnType<typeof rs.fn>;
};

type TestHolders = {
  __embedNav?: NavDouble;
  __embedList?: ListDouble;
};

rs.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) =>
      (globalThis as TestHolders).__embedNav!.push(...args),
    replace: (...args: unknown[]) =>
      (globalThis as TestHolders).__embedNav!.replace(...args),
  }),
  usePathname: () => (globalThis as TestHolders).__embedNav!.pathname,
  useParams: () => ({
    thread_id: (globalThis as TestHolders).__embedNav!.threadId,
  }),
}));

rs.mock("@/core/i18n/hooks", () => ({
  useI18n: () => ({
    locale: "en-US",
    changeLocale: rs.fn(),
    t: {
      sidebar: {
        chats: "Chats",
        newChat: "New chat",
        recentChats: "Recent chats",
      },
      shortcuts: { toggleSidebar: "Toggle sidebar" },
      chats: {
        noChats: "No conversations yet",
        loadingMore: "Loading more...",
        loadOlderChats: "Load older chats",
        pinChat: "Pin chat",
        unpinChat: "Unpin chat",
        pinChatFailed: "Failed to update pinned chat",
        deleteChatFailed: "Failed to delete chat",
      },
      common: {
        rename: "Rename",
        delete: "Delete",
        renameFailed: "Rename failed",
      },
    },
  }),
}));

rs.mock("@/components/embed/use-embed-threads", () => ({
  useEmbedThreads: (activeThreadId?: string | null) => {
    const list = (globalThis as TestHolders).__embedList!;
    void activeThreadId;
    return {
      threads: list.threads,
      isLoading: list.isLoading,
      isLoadingMore: false,
      hasMore: list.hasMore,
      loadMore: list.loadMore,
      deleteThread: list.deleteThread,
      renameThread: list.renameThread,
      togglePinned: list.togglePinned,
    };
  },
}));

// The delete flow dispatches a window event through this helper; stub it so
// the test asserts the coordination without dragging in the chat page hooks.
rs.mock("@/components/workspace/chats/use-thread-chat", () => ({
  resetThreadChatAfterDelete: rs.fn(),
}));

rs.mock("sonner", () => ({
  toast: { error: rs.fn(), success: rs.fn() },
}));

function makeThread(threadId: string, title: string): AgentThread {
  return {
    thread_id: threadId,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    status: "idle",
    metadata: {},
    values: { title, messages: [], artifacts: [], todos: [] },
  } as unknown as AgentThread;
}

function setup(
  options: {
    pathname?: string;
    threads?: AgentThread[];
    isLoading?: boolean;
  } = {},
) {
  const holders = globalThis as TestHolders;
  holders.__embedNav = {
    pathname: options.pathname ?? "/workspace/chats/t1",
    threadId: options.pathname?.split("/").pop() ?? "t1",
    push: rs.fn(),
    replace: rs.fn(),
  };
  holders.__embedList = {
    threads: options.threads ?? [
      makeThread("t1", "Alpha"),
      makeThread("t2", "Beta"),
    ],
    isLoading: options.isLoading ?? false,
    hasMore: true,
    loadMore: rs.fn(),
    // Emulate the shared mutation: invoke onRemoteDeleted when provided.
    deleteThread: rs.fn(
      async ({ onRemoteDeleted }: { onRemoteDeleted?: () => void }) => {
        onRemoteDeleted?.();
        return [];
      },
    ),
    renameThread: rs.fn(async () => undefined),
    togglePinned: rs.fn(async () => undefined),
  };
  render(<EmbedThreadList />);
  return holders;
}

beforeEach(() => {
  rs.clearAllMocks();
});

afterEach(cleanup);

describe("EmbedThreadList", () => {
  it("renders the panel with each thread title", () => {
    setup();
    expect(screen.getByText("Chats")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Alpha" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Beta" })).not.toBeNull();
  });

  it("highlights the thread matching the current pathname", () => {
    setup({ pathname: "/workspace/chats/t2" });
    expect(
      screen.getByRole("button", { name: "Beta" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("button", { name: "Alpha" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("starts a new chat with the embed parameter preserved", () => {
    const holders = setup();
    fireEvent.click(screen.getByTestId("embed-thread-list-new-chat"));
    expect(holders.__embedNav!.push).toHaveBeenCalledWith(
      "/workspace/chats/new?embed=true",
    );
  });

  it("switches threads with the embed parameter preserved", () => {
    const holders = setup({ pathname: "/workspace/chats/t1" });
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(holders.__embedNav!.push).toHaveBeenCalledWith(
      "/workspace/chats/t2?embed=true",
    );
  });

  it("routes agent-owned threads to their agent chat path", () => {
    const agentThread = makeThread("t9", "Agent talk");
    agentThread.metadata = { agent_name: "researcher" };
    const holders = setup({ threads: [agentThread] });
    fireEvent.click(screen.getByRole("button", { name: "Agent talk" }));
    expect(holders.__embedNav!.push).toHaveBeenCalledWith(
      "/workspace/agents/researcher/chats/t9?embed=true",
    );
  });

  it("deletes a background thread without touching the route", () => {
    const holders = setup({ pathname: "/workspace/chats/t1" });
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]!);
    expect(holders.__embedList!.deleteThread).toHaveBeenCalledWith({
      threadId: "t2",
      onRemoteDeleted: undefined,
    });
    expect(holders.__embedNav!.replace).not.toHaveBeenCalled();
    expect(resetThreadChatAfterDelete).not.toHaveBeenCalled();
  });

  it("deleting the open thread resets the chat and replaces the route with the embed parameter", () => {
    const holders = setup({ pathname: "/workspace/chats/t1" });
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(holders.__embedList!.deleteThread).toHaveBeenCalledTimes(1);
    const call = holders.__embedList!.deleteThread.mock.calls[0]?.[0];
    expect(call.onRemoteDeleted).toBeInstanceOf(Function);
    expect(resetThreadChatAfterDelete).toHaveBeenCalledWith({
      deletedThreadId: "t1",
      nextPath: "/workspace/chats/new",
      force: true,
    });
    expect(holders.__embedNav!.replace).toHaveBeenCalledWith(
      "/workspace/chats/new?embed=true",
    );
  });

  it("surfaces a delete failure as a toast", async () => {
    const holders = setup();
    holders.__embedList!.deleteThread.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
  });

  it("loads older threads on demand", () => {
    const holders = setup();
    const loadMore = screen.getByTestId("embed-thread-list-load-more");
    expect(loadMore.textContent).toContain("Load older chats");
    fireEvent.click(loadMore);
    expect(holders.__embedList!.loadMore).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state only once loading finishes", () => {
    setup({ threads: [], isLoading: true });
    expect(screen.queryByText("No conversations yet")).toBeNull();
    cleanup();

    setup({ threads: [], isLoading: false });
    expect(screen.getByText("No conversations yet")).not.toBeNull();
  });

  it("collapses to a rail and expands back", () => {
    setup();
    fireEvent.click(screen.getByTestId("embed-thread-list-collapse"));
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.getByTestId("embed-thread-list-expand")).not.toBeNull();

    fireEvent.click(screen.getByTestId("embed-thread-list-expand"));
    expect(screen.getByRole("button", { name: "Alpha" })).not.toBeNull();
  });

  it("starts a new chat from the collapsed rail", () => {
    const holders = setup();
    fireEvent.click(screen.getByTestId("embed-thread-list-collapse"));
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(holders.__embedNav!.push).toHaveBeenCalledWith(
      "/workspace/chats/new?embed=true",
    );
  });
});
