import { afterEach, beforeEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import {
  EmbedAuthGate,
  resetEmbedAuthGateForTesting,
} from "@/components/embed/embed-auth-gate";
import { EmbedModeProvider } from "@/components/embed/embed-mode-provider";
import { AuthProvider, type User } from "@/core/auth/AuthProvider";
import { resetEmbedAuthForTesting } from "@/core/auth/embed-auth";
import { I18nProvider } from "@/core/i18n/context";

// The gate resolves its bridge client through the shared singleton getter;
// double it via globalThis so the hoisted rs.mock factory stays free of
// outer references (same pattern as the page/thread-list suites).
type BridgeClientDouble = {
  handshake: ReturnType<typeof rs.fn>;
  waitForToken: ReturnType<typeof rs.fn>;
  requestAuthToken: ReturnType<typeof rs.fn>;
  sendReady: ReturnType<typeof rs.fn>;
  sendAuthFailed: ReturnType<typeof rs.fn>;
  onLogout: ReturnType<typeof rs.fn>;
};

type RouterDouble = {
  replace: ReturnType<typeof rs.fn>;
  refresh: ReturnType<typeof rs.fn>;
  push: ReturnType<typeof rs.fn>;
};

type GateHolders = {
  __gateBridge?: {
    client: BridgeClientDouble | null;
    getCalls: number;
  };
  __gateRoute?: { threadId: string | undefined };
  __gateRouter?: RouterDouble;
};

rs.mock("@/core/bridge/iframe-bridge-client", () => ({
  getIframeBridgeClient: () => {
    const holder = (globalThis as GateHolders).__gateBridge!;
    holder.getCalls += 1;
    return holder.client;
  },
}));

rs.mock("next/navigation", () => ({
  useParams: () => ({
    thread_id: (globalThis as GateHolders).__gateRoute?.threadId,
  }),
  useRouter: () => (globalThis as GateHolders).__gateRouter,
  usePathname: () => "/workspace/chats/thread-1",
}));

// eslint forbids empty functions; an undefined-returning stub keeps intent explicit.
function noop(): void {
  return undefined;
}

function neverResolving<T>(): Promise<T> {
  return new Promise(noop);
}

function pendingBridgeClient(): BridgeClientDouble {
  return {
    handshake: rs.fn(neverResolving),
    waitForToken: rs.fn(neverResolving),
    requestAuthToken: rs.fn(),
    sendReady: rs.fn(),
    sendAuthFailed: rs.fn(),
    onLogout: rs.fn(() => noop),
  };
}

function resolvingBridgeClient(): BridgeClientDouble {
  return {
    handshake: rs.fn(async () => ({ mode: "embed", capabilities: [] })),
    waitForToken: rs.fn(async () => ({
      token: "jwt-1",
      tokenType: "keycloak-jwt",
      provider: "keycloak",
    })),
    requestAuthToken: rs.fn(),
    sendReady: rs.fn(),
    sendAuthFailed: rs.fn(),
    onLogout: rs.fn(() => noop),
  };
}

const AUTH_USER: User = {
  id: "u-1",
  email: "u@example.com",
  system_role: "user",
  needs_setup: false,
};

/**
 * Render the gate the way the workspace layout does: authenticated requests
 * wrap it in an AuthProvider carrying the session user; the unauthenticated
 * EMBED bootstrap branch mounts the same provider with `null`. Pass
 * `user: null` to exercise the bootstrap behavior.
 */
function renderGate(
  bridge: BridgeClientDouble | null,
  {
    embedded = true,
    threadId = "thread-1",
    user = AUTH_USER as User | null,
  } = {},
) {
  (globalThis as GateHolders).__gateBridge = { client: bridge, getCalls: 0 };
  (globalThis as GateHolders).__gateRoute = { threadId };
  (globalThis as GateHolders).__gateRouter = {
    replace: rs.fn(),
    refresh: rs.fn(),
    push: rs.fn(),
  };
  return render(
    <I18nProvider initialLocale="en-US">
      <AuthProvider initialUser={user}>
        <EmbedModeProvider embedded={embedded}>
          <EmbedAuthGate>
            <div data-testid="gate-children">workspace</div>
          </EmbedAuthGate>
        </EmbedModeProvider>
      </AuthProvider>
    </I18nProvider>,
  );
}

function routerDouble(): RouterDouble {
  return (globalThis as GateHolders).__gateRouter!;
}

beforeEach(() => {
  resetEmbedAuthForTesting();
  resetEmbedAuthGateForTesting();
});

afterEach(() => {
  cleanup();
  delete (globalThis as GateHolders).__gateBridge;
  delete (globalThis as GateHolders).__gateRoute;
  delete (globalThis as GateHolders).__gateRouter;
  resetEmbedAuthForTesting();
  resetEmbedAuthGateForTesting();
});

describe("EmbedAuthGate", () => {
  it("shows the authenticating status while the sequence is pending", () => {
    renderGate(pendingBridgeClient());

    expect(screen.getByRole("status")).not.toBeNull();
    expect(screen.queryByTestId("gate-children")).toBeNull();
  });

  it("renders children once the sequence settles", async () => {
    const fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const bridge = resolvingBridgeClient();
    renderGate(bridge);

    await waitFor(() => {
      expect(screen.getByTestId("gate-children")).not.toBeNull();
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(bridge.handshake).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // An existing session means no bootstrap refresh is needed.
    expect(routerDouble().refresh).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("degrades to children immediately when no bridge client exists", () => {
    renderGate(null);

    expect(screen.getByTestId("gate-children")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders children immediately and never touches the bridge when not embedded", () => {
    const { unmount } = renderGate(pendingBridgeClient(), {
      embedded: false,
    });

    expect(screen.getByTestId("gate-children")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect((globalThis as GateHolders).__gateBridge?.getCalls).toBe(0);
    unmount();
  });

  it("keeps rendering children after a failed exchange (degrade, not block)", async () => {
    const fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 401 }));
    const bridge = resolvingBridgeClient();
    renderGate(bridge);

    await waitFor(() => {
      expect(screen.getByTestId("gate-children")).not.toBeNull();
    });
    // The Shell was told about the failure; the standalone path takes over.
    expect(bridge.sendAuthFailed).toHaveBeenCalledTimes(1);
    expect(bridge.sendReady).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("subscribes to LOGOUT and unsubscribes on unmount", async () => {
    const fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const unsubscribe = rs.fn();
    const bridge: BridgeClientDouble = {
      ...resolvingBridgeClient(),
      onLogout: rs.fn(() => unsubscribe),
    };
    const { unmount } = renderGate(bridge);

    await waitFor(() => {
      expect(bridge.onLogout).toHaveBeenCalledTimes(1);
    });
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it("reports the route thread id in READY and the placeholder for /new", async () => {
    const fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const first = resolvingBridgeClient();
    const { unmount } = renderGate(first, { threadId: "thread-9" });
    await waitFor(() => {
      expect(first.sendReady).toHaveBeenCalledWith("thread-9");
    });
    unmount();

    const second = resolvingBridgeClient();
    renderGate(second, { threadId: "new" });
    await waitFor(() => {
      expect(second.sendReady).toHaveBeenCalledWith("");
    });

    fetchSpy.mockRestore();
  });
});

describe("EmbedAuthGate bootstrap (unauthenticated EMBED entry)", () => {
  it("refreshes into the authenticated tree after a successful exchange", async () => {
    const fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const bridge = resolvingBridgeClient();
    renderGate(bridge, { user: null });

    await waitFor(() => {
      expect(routerDouble().refresh).toHaveBeenCalledTimes(1);
    });
    // READY was reported, and the overlay stays up until the refreshed
    // server tree arrives — children never mount without a user.
    expect(bridge.sendReady).toHaveBeenCalledWith("thread-1");
    expect(screen.queryByTestId("gate-children")).toBeNull();
    expect(screen.getByRole("status")).not.toBeNull();

    fetchSpy.mockRestore();
  });

  it("never refreshes twice when the refreshed tree still has no user", async () => {
    const fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const bridge = resolvingBridgeClient();
    const first = renderGate(bridge, { user: null });
    const firstRouter = routerDouble();
    await waitFor(() => {
      expect(firstRouter.refresh).toHaveBeenCalledTimes(1);
    });
    first.unmount();

    // Post-refresh remount: the cached first-auth resolves again (no second
    // handshake/exchange), and the one-shot guard must settle the gate
    // instead of looping router.refresh().
    renderGate(bridge, { user: null });
    await waitFor(() => {
      expect(screen.getByTestId("gate-children")).not.toBeNull();
    });
    expect(routerDouble().refresh).not.toHaveBeenCalled();
    expect(firstRouter.refresh).toHaveBeenCalledTimes(1);
    expect(bridge.handshake).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it("degrades to the login page when the bootstrap exchange fails", async () => {
    const fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 401 }));
    const bridge = resolvingBridgeClient();
    renderGate(bridge, { user: null });

    await waitFor(() => {
      expect(routerDouble().replace).toHaveBeenCalledWith("/login");
    });
    expect(bridge.sendAuthFailed).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("gate-children")).toBeNull();

    fetchSpy.mockRestore();
  });

  it("goes to the login page when no bridge client exists at all", async () => {
    renderGate(null, { user: null });

    await waitFor(() => {
      expect(routerDouble().replace).toHaveBeenCalledWith("/login");
    });
    expect(screen.queryByTestId("gate-children")).toBeNull();
  });
});
