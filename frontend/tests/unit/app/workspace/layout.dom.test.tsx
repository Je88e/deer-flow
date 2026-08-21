import { afterEach, beforeEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import WorkspaceLayout from "@/app/workspace/layout";

// The layout is an async server component with heavy collaborators (server
// auth, i18n detection, sidebar chrome). Doubles are injected via
// globalThis so the hoisted mock factories stay free of outer references —
// the same pattern as the embed page/gate suites.
type LayoutHolders = {
  __layoutAuth?: { tag: string; user?: { id: string } };
  __layoutRequestHeaders?: Record<string, string>;
  __layoutRedirects?: string[];
};

function holders(): LayoutHolders {
  return globalThis as LayoutHolders;
}

rs.mock("@/core/auth/server", () => ({
  getServerSideUser: async () => holders().__layoutAuth,
}));

rs.mock("next/headers", () => ({
  headers: async () => new Headers(holders().__layoutRequestHeaders),
}));

rs.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    holders().__layoutRedirects?.push(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

rs.mock("@/core/i18n/server", () => ({
  detectLocaleServer: async () => "en-US",
}));

rs.mock("@/core/i18n/context", () => ({
  I18nProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

rs.mock("@/core/auth/AuthProvider", () => ({
  AuthProvider: ({
    children,
    initialUser,
  }: {
    children: ReactNode;
    initialUser: unknown;
  }) => (
    <div
      data-testid="auth-provider"
      data-initial-user={initialUser === null ? "null" : "set"}
    >
      {children}
    </div>
  ),
}));

rs.mock("@/app/workspace/workspace-content", () => ({
  WorkspaceContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="workspace-content">{children}</div>
  ),
}));

rs.mock("@/components/workspace/gateway-offline-fallback", () => ({
  GatewayOfflineFallback: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

async function renderLayout({
  auth,
  requestHeaders = {},
}: {
  auth: LayoutHolders["__layoutAuth"];
  requestHeaders?: Record<string, string>;
}) {
  holders().__layoutAuth = auth;
  holders().__layoutRequestHeaders = requestHeaders;
  holders().__layoutRedirects = [];
  const tree = await WorkspaceLayout({
    children: <div data-testid="layout-children">page</div>,
  });
  return render(tree);
}

beforeEach(() => {
  holders().__layoutRedirects = [];
});

afterEach(() => {
  cleanup();
  delete holders().__layoutAuth;
  delete holders().__layoutRequestHeaders;
  delete holders().__layoutRedirects;
});

describe("WorkspaceLayout EMBED bootstrap", () => {
  it("renders the provider tree for unauthenticated EMBED requests", async () => {
    await renderLayout({
      auth: { tag: "unauthenticated" },
      requestHeaders: { "x-deerflow-embed": "1" },
    });

    // The page tree must mount (so EmbedAuthGate can run the bridge
    // handshake) under a null-user AuthProvider, and WorkspaceContent must
    // stay in the tree: the page SSRs through ChatPage, which requires its
    // QueryClientProvider and SidebarProvider.
    expect(screen.getByTestId("layout-children")).not.toBeNull();
    expect(screen.getByTestId("auth-provider").dataset.initialUser).toBe(
      "null",
    );
    expect(screen.getByTestId("workspace-content")).not.toBeNull();
    expect(holders().__layoutRedirects).toEqual([]);
  });

  it("still redirects unauthenticated non-EMBED requests to /login", async () => {
    await expect(
      renderLayout({ auth: { tag: "unauthenticated" } }),
    ).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(holders().__layoutRedirects).toEqual(["/login"]);
    expect(screen.queryByTestId("layout-children")).toBeNull();
  });

  it("ignores the header for authenticated requests (sidebar path unchanged)", async () => {
    await renderLayout({
      auth: { tag: "authenticated", user: { id: "u-1" } },
      requestHeaders: { "x-deerflow-embed": "1" },
    });

    expect(screen.getByTestId("workspace-content")).not.toBeNull();
    expect(screen.getByTestId("auth-provider").dataset.initialUser).toBe("set");
    expect(holders().__layoutRedirects).toEqual([]);
  });
});
