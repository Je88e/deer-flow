import { afterEach, beforeEach, describe, expect, it, rs } from "@rstest/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";

import WorkspaceChatPage from "@/app/workspace/chats/[thread_id]/page";
import { WorkspaceContent } from "@/app/workspace/workspace-content";
import { resetEmbedAuthGateForTesting } from "@/components/embed/embed-auth-gate";
import { WorkspaceChannelsList } from "@/components/workspace/channels/workspace-channels-list";
import { WorkspaceNavChatList } from "@/components/workspace/workspace-nav-chat-list";
import { AuthProvider, type User } from "@/core/auth/AuthProvider";
import { resetEmbedAuthForTesting } from "@/core/auth/embed-auth";
import { I18nProvider } from "@/core/i18n/context";

// Exercise the real workspace composition, sidebar consumers, query hooks,
// fetcher and bridge auth. Only unrelated chrome and platform I/O are doubled.
rs.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
rs.mock("next/navigation", () => ({
  useParams: () => ({ thread_id: "new" }),
  usePathname: () => "/workspace/chats/new",
  useSearchParams: () => new URLSearchParams(embedded ? "embed=true" : ""),
  useRouter: () => router,
}));
rs.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
rs.mock("@/core/bridge/iframe-bridge-client", () => ({
  isEmbeddedWindow: () => embedded,
  getIframeBridgeClient: () => bridge,
}));
rs.mock("@/components/query-client-provider", () => {
  return {
    QueryClientProvider: ({ children }: { children: ReactNode }) => {
      const [client] = useState(
        () =>
          new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
          }),
      );
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    },
  };
});
rs.mock("@/components/ui/sidebar", () => {
  const Slot = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    SidebarProvider: Slot,
    SidebarInset: Slot,
    SidebarGroup: Slot,
    SidebarMenu: Slot,
    SidebarMenuButton: Slot,
    SidebarMenuItem: Slot,
    SidebarGroupLabel: Slot,
    useSidebar: () => ({ open: false }),
  };
});
rs.mock("@/components/workspace/workspace-sidebar", () => {
  return {
    WorkspaceSidebar: () => (
      <>
        <WorkspaceNavChatList />
        <WorkspaceChannelsList />
      </>
    ),
  };
});
rs.mock("@/components/embed/embed-appearance-sync", () => ({
  EmbedAppearanceSync: () => null,
}));
rs.mock("@/core/settings/user-preferences-boundary", () => ({
  UserPreferencesBoundary: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
rs.mock("@/components/workspace/gateway-offline-banner", () => ({
  GatewayOfflineBanner: () => null,
}));
rs.mock("@/components/workspace/model-load-error-banner", () => ({
  ModelLoadErrorBanner: () => null,
}));
rs.mock("@/components/workspace/command-palette", () => ({
  CommandPalette: () => null,
}));
rs.mock("@/components/workspace/settings", () => ({
  SettingsDialogHost: () => null,
}));
rs.mock("@/components/workspace/workspace-settings-deep-link", () => ({
  WorkspaceSettingsDeepLink: () => null,
}));
rs.mock("@/components/workspace/chats/chat-page", () => ({
  default: () => <div>chat</div>,
}));
rs.mock("sonner", () => ({
  Toaster: () => null,
  toast: { success: rs.fn(), error: rs.fn() },
}));

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

const USER: User = {
  id: "u-1",
  email: "u@example.com",
  system_role: "user",
  needs_setup: false,
};
let embedded = true;
let router: {
  replace: ReturnType<typeof rs.fn>;
  refresh: ReturnType<typeof rs.fn>;
  push: ReturnType<typeof rs.fn>;
};
let bridge: ReturnType<typeof makeBridge>;
function makeBridge() {
  return {
    handshake: rs.fn(async () => ({ mode: "embed", capabilities: [] })),
    waitForToken: rs.fn(async () => ({
      token: "test-token",
      tokenType: "keycloak-jwt",
      provider: "keycloak",
    })),
    sendReady: rs.fn(),
    sendAuthFailed: rs.fn(),
    requestAuthToken: rs.fn(),
    onLogout: rs.fn(() => () => undefined),
  };
}

async function workspaceTree(user: User | null) {
  const workspace = await WorkspaceContent({ children: WorkspaceChatPage() });
  return (
    <I18nProvider initialLocale="en-US">
      <AuthProvider key={user ? "session" : "bootstrap"} initialUser={user}>
        {workspace}
      </AuthProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  embedded = true;
  router = { replace: rs.fn(), refresh: rs.fn(), push: rs.fn() };
  bridge = makeBridge();
  resetEmbedAuthForTesting();
  resetEmbedAuthGateForTesting();
});
afterEach(() => {
  cleanup();
  rs.restoreAllMocks();
});

describe("workspace first-login request ordering", () => {
  it.each([null, USER])(
    "does not send protected sidebar requests before bridge authentication (user=%j)",
    async (user) => {
      bridge.handshake.mockImplementation(() => new Promise(() => undefined));
      const rejected: Array<{ path: string; status: number }> = [];
      rs.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const path = requestUrl(input);
        // A fresh iframe has no deer-flow cookie; these real consumers receive
        // exactly the 401 from the reported features/providers requests.
        rejected.push({ path, status: 401 });
        return new Response("{}", { status: 401 });
      });
      const tree = await workspaceTree(user);
      await act(async () => {
        render(tree);
      });
      expect(rejected).toEqual([]);
    },
  );

  it("waits for exchange and the authenticated server tree before fetching", async () => {
    let finishExchange!: (response: Response) => void;
    const exchange = new Promise<Response>((resolve) => {
      finishExchange = resolve;
    });
    const paths: string[] = [];
    const fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const path = requestUrl(input);
        paths.push(path);
        if (path.endsWith("/token-exchange")) return exchange;
        return Response.json(
          path.endsWith("/features")
            ? { agents_api: { enabled: true } }
            : { enabled: false, providers: [] },
        );
      });
    const view = render(await workspaceTree(null));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(paths[0]).toContain("/v1/auth/token-exchange");
    expect(screen.queryByText("chat")).toBeNull();
    await act(async () => {
      finishExchange(Response.json({}));
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(paths).toHaveLength(1);
    view.rerender(await workspaceTree(USER));
    await waitFor(() => expect(paths).toHaveLength(3));
    expect(paths.slice(1).sort()).toEqual([
      "/api/channels/providers",
      "/api/features",
    ]);
    expect(screen.getByText("chat")).not.toBeNull();
    expect(bridge.handshake).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])(
    "keeps fresh-login consumers blocked after exchange HTTP %i",
    async (status) => {
      const fetchSpy = rs
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("{}", { status }));
      render(await workspaceTree(null));
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith("/login"),
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(bridge.sendAuthFailed).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("chat")).toBeNull();
    },
  );

  it("loads normally outside embed mode without requesting a Shell token", async () => {
    embedded = false;
    const fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) =>
        Response.json(
          requestUrl(input).endsWith("/features")
            ? { agents_api: { enabled: true } }
            : { enabled: false, providers: [] },
        ),
      );
    render(await workspaceTree(USER));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(bridge.handshake).not.toHaveBeenCalled();
    expect(screen.getByText("chat")).not.toBeNull();
  });

  it("gates the first render when a persisted layout enters embed mode", async () => {
    embedded = false;
    rs.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      Response.json(
        requestUrl(input).endsWith("/features")
          ? { agents_api: { enabled: true } }
          : { enabled: false, providers: [] },
      ),
    );
    const view = render(await workspaceTree(USER));
    expect(screen.getByText("chat")).not.toBeNull();
    embedded = true;
    bridge.handshake.mockImplementation(() => new Promise(() => undefined));
    view.rerender(await workspaceTree(USER));
    expect(screen.queryByText("chat")).toBeNull();
    expect(screen.getByRole("status")).not.toBeNull();
  });
});
