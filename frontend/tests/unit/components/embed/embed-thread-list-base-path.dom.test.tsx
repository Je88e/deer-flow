import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  rs,
} from "@rstest/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// Type-only import: fully erased at compile time, so it does NOT initialize
// the component module (and with it @/env) before the env-var assignment
// below. The runtime component arrives via the dynamic import in beforeAll.
import type { EmbedThreadList as EmbedThreadListExport } from "@/components/embed/embed-thread-list";
import { resetThreadChatAfterDelete } from "@/components/workspace/chats/use-thread-chat";
import type { AgentThread } from "@/core/threads/types";

// F1 coverage for a basePath deployment: the component compares
// window.location.pathname (which carries the deployment base path) against
// router-relative thread paths, so @/env must initialize with
// NEXT_PUBLIC_BASE_PATH set. createEnv reads process.env at module init, and
// ESM static imports evaluate before this module body, so the component is
// pulled in through a dynamic import below — keeping @/env uninitialized
// until after this assignment. Every static import here is either a test
// library or an rs.mock'ed module whose real code never loads.
process.env.NEXT_PUBLIC_BASE_PATH = "/leadagent";

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
  // Next's usePathname strips the base path; only window.location keeps it.
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

let EmbedThreadList: typeof EmbedThreadListExport;

beforeAll(async () => {
  ({ EmbedThreadList } = await import("@/components/embed/embed-thread-list"));
});

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
    /** Router-relative path (what Next hooks report — base path stripped). */
    pathname?: string;
    /** Committed browser URL; defaults to the base-path-prefixed `pathname`. */
    browserPathname?: string;
    threads?: AgentThread[];
    isLoading?: boolean;
  } = {},
) {
  const holders = globalThis as TestHolders;
  const pathname = options.pathname ?? "/workspace/chats/t1";
  holders.__embedNav = {
    pathname,
    threadId: options.pathname?.split("/").pop() ?? "t1",
    push: rs.fn(),
    replace: rs.fn(),
  };
  window.history.replaceState(
    null,
    "",
    options.browserPathname ?? `/leadagent${pathname}`,
  );
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
  // The component reads the committed browser URL; keep it neutral between
  // tests so a previous test's replaceState cannot leak into the next one.
  window.history.replaceState(null, "", "/leadagent/");
});

afterEach(cleanup);

afterAll(() => {
  delete process.env.NEXT_PUBLIC_BASE_PATH;
});

describe("EmbedThreadList under a basePath deployment (F1)", () => {
  it("highlights the active thread when the browser URL carries the base path", () => {
    setup({
      pathname: "/workspace/chats/t2",
      browserPathname: "/leadagent/workspace/chats/t2",
    });
    expect(
      screen.getByRole("button", { name: "Beta" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("button", { name: "Alpha" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("deleting a just-created thread resets and redirects while Next hooks are stale", () => {
    // ChatPage's onStart commits new threads with history.replaceState, which
    // does not notify the Next router: useParams/usePathname still report
    // /new while window.location already points at the created thread — and
    // under a basePath deployment it points there WITH the prefix.
    const holders = setup({
      pathname: "/workspace/chats/new",
      browserPathname: "/leadagent/workspace/chats/t1",
      threads: [makeThread("t1", "Alpha"), makeThread("t2", "Beta")],
    });
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

  it("deleting the newest thread while sitting on /new resets and redirects", () => {
    const holders = setup({
      pathname: "/workspace/chats/new",
      browserPathname: "/leadagent/workspace/chats/new",
      threads: [makeThread("t1", "Alpha"), makeThread("t2", "Beta")],
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(resetThreadChatAfterDelete).toHaveBeenCalledWith({
      deletedThreadId: "t1",
      nextPath: "/workspace/chats/new",
      force: true,
    });
    expect(holders.__embedNav!.replace).toHaveBeenCalledWith(
      "/workspace/chats/new?embed=true",
    );
    // Sanity: an older thread stays a background delete in the same state.
    cleanup();
    const holders2 = setup({
      pathname: "/workspace/chats/new",
      browserPathname: "/leadagent/workspace/chats/new",
      threads: [makeThread("t1", "Alpha"), makeThread("t2", "Beta")],
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]!);
    expect(holders2.__embedList!.deleteThread).toHaveBeenCalledWith({
      threadId: "t2",
      onRemoteDeleted: undefined,
    });
    expect(resetThreadChatAfterDelete).not.toHaveBeenCalledWith({
      deletedThreadId: "t2",
      nextPath: "/workspace/chats/new",
      force: true,
    });
  });
});
