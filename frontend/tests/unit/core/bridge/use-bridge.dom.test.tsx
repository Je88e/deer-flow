import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

import {
  IframeBridgeClient,
  resetIframeBridgeClient,
} from "@/core/bridge/iframe-bridge-client";
import {
  useBridgeClient,
  useBridgeHandshake,
  useBridgeLogout,
} from "@/core/bridge/use-bridge";

const SHELL_ORIGIN = "http://shell.example";

let parent: { postMessage: ReturnType<typeof rs.fn> };

function frameWindow() {
  const framedParent = { postMessage: rs.fn() };
  const w = window as unknown as { top: unknown; parent: unknown };
  w.top = { tag: "shell-top" };
  w.parent = framedParent;
  return framedParent;
}

function unframeWindow() {
  const w = window as unknown as { top: unknown; parent: unknown };
  w.top = window;
  w.parent = window;
}

function dispatchMessage(origin: string, data: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", { origin, data, source: window }),
    );
  });
}

beforeEach(() => {
  // The shared client resolves its Shell origin from the env, so pin it here
  // to keep inbound dispatches and outbound targetOrigins consistent.
  process.env.NEXT_PUBLIC_SHELL_ORIGIN = SHELL_ORIGIN;
  parent = frameWindow();
});

afterEach(() => {
  cleanup();
  resetIframeBridgeClient();
  unframeWindow();
  delete process.env.NEXT_PUBLIC_SHELL_ORIGIN;
});

describe("useBridgeClient", () => {
  test("exposes the shared client once mounted", async () => {
    const { result } = renderHook(() => useBridgeClient());

    await waitFor(() => {
      expect(result.current).toBeInstanceOf(IframeBridgeClient);
    });
    expect(result.current).toBe(
      renderHook(() => useBridgeClient()).result.current,
    );
  });

  test("stays null in standalone mode", async () => {
    unframeWindow();
    const { result } = renderHook(() => useBridgeClient());

    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });
});

describe("useBridgeHandshake", () => {
  test("moves from pending to ready when the Shell answers", async () => {
    const { result } = renderHook(() => useBridgeHandshake());

    // The handshake request goes out through the shared client.
    await waitFor(() => {
      expect(result.current.status).toBe("pending");
    });
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "HANDSHAKE_REQUEST" }),
      SHELL_ORIGIN,
    );

    dispatchMessage(SHELL_ORIGIN, {
      version: "1.0",
      type: "HANDSHAKE",
      payload: { mode: "embed", capabilities: ["threads"] },
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        status: "ready",
        handshake: { mode: "embed", capabilities: ["threads"] },
      });
    });
  });

  // The error path (timeout rejection surfacing as `{ status: "error" }`) has
  // its own file, use-bridge-error.dom.test.tsx, because faking the handshake
  // timer under React's async act deadlocks this environment.

  test("stays idle in standalone mode", async () => {
    unframeWindow();
    const { result } = renderHook(() => useBridgeHandshake());

    await waitFor(() => {
      expect(result.current).toEqual({ status: "idle" });
    });
    expect(parent.postMessage).not.toHaveBeenCalled();
  });
});

describe("useBridgeLogout", () => {
  test("invokes the handler for Shell LOGOUT and unsubscribes on unmount", async () => {
    const handler = rs.fn();
    const { result, unmount } = renderHook(() => {
      const client = useBridgeClient();
      useBridgeLogout(handler);
      return client;
    });

    // The subscription lands in the same commit that exposes the client.
    await waitFor(() => {
      expect(result.current).toBeInstanceOf(IframeBridgeClient);
    });

    dispatchMessage(SHELL_ORIGIN, {
      version: "1.0",
      type: "LOGOUT",
      payload: {},
    });
    expect(handler).toHaveBeenCalledTimes(1);

    unmount();
    dispatchMessage(SHELL_ORIGIN, {
      version: "1.0",
      type: "LOGOUT",
      payload: {},
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("never fires in standalone mode", async () => {
    unframeWindow();
    const handler = rs.fn();
    renderHook(() => useBridgeLogout(handler));

    dispatchMessage(SHELL_ORIGIN, {
      version: "1.0",
      type: "LOGOUT",
      payload: {},
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
