import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";

import {
  BridgeNotEmbeddedError,
  BridgeTimeoutError,
  DEFAULT_BRIDGE_TIMEOUT_MS,
  IframeBridgeClient,
  getIframeBridgeClient,
  isEmbeddedWindow,
  resetIframeBridgeClient,
  resolveShellOrigin,
} from "@/core/bridge/iframe-bridge-client";

const SHELL_ORIGIN = "http://shell.example";
const OTHER_ORIGIN = "http://attacker.example";

type ParentWindow = { postMessage: ReturnType<typeof rs.fn> };

let parent: ParentWindow;
let clients: IframeBridgeClient[];

/**
 * Turn the happy-dom window into an "embedded" one: `self !== top` and a
 * spy-able `parent`. happy-dom exposes setter-backed slots for both, so plain
 * assignment (and restoring `window` afterwards) is enough.
 */
function frameWindow(): ParentWindow {
  const framedParent = { postMessage: rs.fn() };
  const w = window as unknown as { top: unknown; parent: unknown };
  w.top = { tag: "shell-top" };
  w.parent = framedParent;
  return framedParent;
}

function unframeWindow(): void {
  const w = window as unknown as { top: unknown; parent: unknown };
  w.top = window;
  w.parent = window;
}

function dispatchMessage(origin: string, data: unknown): void {
  window.dispatchEvent(
    new MessageEvent("message", { origin, data, source: window }),
  );
}

function handshakeMessage(origin: string) {
  dispatchMessage(origin, {
    version: "1.0",
    type: "HANDSHAKE",
    payload: { mode: "embed", capabilities: ["threads"] },
  });
}

function authTokenMessage(origin: string, token = "token-1") {
  dispatchMessage(origin, {
    version: "1.0",
    type: "AUTH_TOKEN",
    payload: { token, tokenType: "keycloak-jwt", provider: "keycloak" },
  });
}

function logoutMessage(origin: string) {
  dispatchMessage(origin, { version: "1.0", type: "LOGOUT", payload: {} });
}

function themeChangeMessage(origin: string, theme: "light" | "dark") {
  dispatchMessage(origin, {
    version: "1.0",
    type: "THEME_CHANGE",
    payload: { theme },
  });
}

function localeChangeMessage(origin: string, locale: "en" | "zh") {
  dispatchMessage(origin, {
    version: "1.0",
    type: "LOCALE_CHANGE",
    payload: { locale },
  });
}

function newClient(
  options: ConstructorParameters<typeof IframeBridgeClient>[0] = {},
): IframeBridgeClient {
  const client = new IframeBridgeClient({
    shellOrigin: SHELL_ORIGIN,
    ...options,
  });
  clients.push(client);
  return client;
}

beforeEach(() => {
  parent = frameWindow();
  clients = [];
});

afterEach(() => {
  for (const client of clients) {
    client.destroy();
  }
  clients = [];
  resetIframeBridgeClient();
  unframeWindow();
});

describe("iframe detection", () => {
  test("detects the framed window", () => {
    expect(isEmbeddedWindow()).toBe(true);
  });

  test("a top-level window is not embedded", () => {
    unframeWindow();
    expect(isEmbeddedWindow()).toBe(false);
  });
});

describe("outbound postMessage", () => {
  test("always passes the explicit Shell origin, never '*'", () => {
    const client = newClient();

    client.requestAuthToken("session-expired");
    client.sendReady("thread-1");
    client.sendAuthFailed("exchange failed", "E_EXCHANGE");

    expect(parent.postMessage).toHaveBeenCalledTimes(3);
    for (const call of parent.postMessage.mock.calls) {
      expect(call[1]).toBe(SHELL_ORIGIN);
    }

    expect(parent.postMessage.mock.calls[0]?.[0]).toEqual({
      version: "1.0",
      type: "AUTH_TOKEN_REQUEST",
      payload: { reason: "session-expired" },
    });
    expect(parent.postMessage.mock.calls[1]?.[0]).toEqual({
      version: "1.0",
      type: "READY",
      payload: { threadId: "thread-1" },
    });
    expect(parent.postMessage.mock.calls[2]?.[0]).toEqual({
      version: "1.0",
      type: "AUTH_FAILED",
      payload: { error: "exchange failed", code: "E_EXCHANGE" },
    });
  });
});

describe("handshake", () => {
  test("resolves with the HANDSHAKE payload from the Shell origin", async () => {
    const client = newClient();
    const pending = client.handshake();

    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(parent.postMessage.mock.calls[0]?.[0]).toEqual({
      version: "1.0",
      type: "HANDSHAKE_REQUEST",
      payload: {},
    });
    expect(parent.postMessage.mock.calls[0]?.[1]).toBe(SHELL_ORIGIN);

    handshakeMessage(SHELL_ORIGIN);
    await expect(pending).resolves.toEqual({
      mode: "embed",
      capabilities: ["threads"],
    });
  });

  test("is idempotent and caches its promise", async () => {
    const client = newClient();
    const first = client.handshake();
    const second = client.handshake();

    expect(second).toBe(first);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);

    handshakeMessage(SHELL_ORIGIN);
    await expect(first).resolves.toEqual({
      mode: "embed",
      capabilities: ["threads"],
    });
    // A completed handshake keeps serving the cached payload.
    await expect(client.handshake()).resolves.toEqual({
      mode: "embed",
      capabilities: ["threads"],
    });
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });

  test("rejects with BridgeTimeoutError when the Shell stays silent", async () => {
    rs.useFakeTimers();
    try {
      const client = newClient({ timeoutMs: DEFAULT_BRIDGE_TIMEOUT_MS });
      const pending = client.handshake();
      const assertion =
        expect(pending).rejects.toBeInstanceOf(BridgeTimeoutError);

      await rs.advanceTimersByTimeAsync(DEFAULT_BRIDGE_TIMEOUT_MS);
      await assertion;

      // A failed handshake is not cached forever: the next call retries.
      const retry = client.handshake();
      expect(parent.postMessage).toHaveBeenCalledTimes(2);
      const retryAssertion =
        expect(retry).rejects.toBeInstanceOf(BridgeTimeoutError);
      await rs.advanceTimersByTimeAsync(DEFAULT_BRIDGE_TIMEOUT_MS);
      await retryAssertion;
    } finally {
      rs.useRealTimers();
    }
  });

  test("silently drops messages from a non-Shell origin", async () => {
    rs.useFakeTimers();
    try {
      const client = newClient();
      const pending = client.handshake();
      const assertion =
        expect(pending).rejects.toBeInstanceOf(BridgeTimeoutError);

      handshakeMessage(OTHER_ORIGIN);
      authTokenMessage(OTHER_ORIGIN);
      logoutMessage(OTHER_ORIGIN);
      await rs.advanceTimersByTimeAsync(DEFAULT_BRIDGE_TIMEOUT_MS);
      await assertion;

      // No outbound reply to the foreign origin either.
      expect(parent.postMessage).toHaveBeenCalledTimes(1);
    } finally {
      rs.useRealTimers();
    }
  });

  test("drops protocol-invalid messages from the Shell origin", async () => {
    rs.useFakeTimers();
    try {
      const client = newClient();
      const pending = client.handshake();
      const assertion =
        expect(pending).rejects.toBeInstanceOf(BridgeTimeoutError);

      // Right origin, wrong version.
      dispatchMessage(SHELL_ORIGIN, {
        version: "2.0",
        type: "HANDSHAKE",
        payload: { mode: "embed", capabilities: [] },
      });
      // Right origin, malformed payload.
      dispatchMessage(SHELL_ORIGIN, {
        version: "1.0",
        type: "HANDSHAKE",
        payload: { mode: "standalone" },
      });
      await rs.advanceTimersByTimeAsync(DEFAULT_BRIDGE_TIMEOUT_MS);
      await assertion;
    } finally {
      rs.useRealTimers();
    }
  });
});

describe("waitForToken", () => {
  test("resolves when AUTH_TOKEN arrives from the Shell origin", async () => {
    const client = newClient();
    const pending = client.waitForToken();

    authTokenMessage(SHELL_ORIGIN, "token-1");
    await expect(pending).resolves.toEqual({
      token: "token-1",
      tokenType: "keycloak-jwt",
      provider: "keycloak",
    });
  });

  test("resolves immediately with a token that arrived earlier", async () => {
    const client = newClient();
    authTokenMessage(SHELL_ORIGIN, "token-early");

    await expect(client.waitForToken()).resolves.toMatchObject({
      token: "token-early",
    });
  });

  test("keeps only the newest unconsumed token", async () => {
    const client = newClient();
    authTokenMessage(SHELL_ORIGIN, "token-old");
    authTokenMessage(SHELL_ORIGIN, "token-new");

    await expect(client.waitForToken()).resolves.toMatchObject({
      token: "token-new",
    });
  });

  test("times out without an AUTH_TOKEN", async () => {
    rs.useFakeTimers();
    try {
      const client = newClient({ timeoutMs: 1000 });
      const pending = client.waitForToken();
      const assertion =
        expect(pending).rejects.toBeInstanceOf(BridgeTimeoutError);

      await rs.advanceTimersByTimeAsync(1000);
      await assertion;
    } finally {
      rs.useRealTimers();
    }
  });

  test("ignorePending drops a cached unconsumed token and waits for the next", async () => {
    const client = newClient();
    authTokenMessage(SHELL_ORIGIN, "token-stale");

    const pending = client.waitForToken({ ignorePending: true });
    authTokenMessage(SHELL_ORIGIN, "token-fresh");

    await expect(pending).resolves.toMatchObject({ token: "token-fresh" });
  });

  test("ignorePending is a no-op when nothing is cached", async () => {
    const client = newClient();

    const pending = client.waitForToken({ ignorePending: true });
    authTokenMessage(SHELL_ORIGIN, "token-only");

    await expect(pending).resolves.toMatchObject({ token: "token-only" });
  });
});

describe("onLogout", () => {
  test("notifies subscribers on LOGOUT from the Shell origin", () => {
    const client = newClient();
    const first = rs.fn();
    const second = rs.fn();

    const unsubscribeFirst = client.onLogout(first);
    client.onLogout(second);

    logoutMessage(SHELL_ORIGIN);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    logoutMessage(SHELL_ORIGIN);
    expect(first).toHaveBeenCalledTimes(2);

    unsubscribeFirst();
    logoutMessage(SHELL_ORIGIN);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(3);
  });

  test("the client itself performs no logout request", () => {
    const fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = newClient();
    client.onLogout(rs.fn());

    logoutMessage(SHELL_ORIGIN);
    // Only outbound bridge traffic exists; no fetch of a logout endpoint.
    expect(parent.postMessage).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("onThemeChange / onLocaleChange", () => {
  test("notifies subscribers on THEME_CHANGE from the Shell origin", () => {
    const client = newClient();
    const first = rs.fn();
    const second = rs.fn();

    const unsubscribeFirst = client.onThemeChange(first);
    client.onThemeChange(second);

    themeChangeMessage(SHELL_ORIGIN, "dark");
    expect(first).toHaveBeenCalledWith("dark");
    expect(second).toHaveBeenCalledWith("dark");

    themeChangeMessage(SHELL_ORIGIN, "light");
    expect(first).toHaveBeenCalledWith("light");

    unsubscribeFirst();
    themeChangeMessage(SHELL_ORIGIN, "dark");
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(3);
  });

  test("notifies subscribers on LOCALE_CHANGE from the Shell origin", () => {
    const client = newClient();
    const handler = rs.fn();
    client.onLocaleChange(handler);

    localeChangeMessage(SHELL_ORIGIN, "zh");
    expect(handler).toHaveBeenCalledWith("zh");
  });

  test("replays the latest pushed value to a late subscriber", () => {
    const client = newClient();
    // The Shell pushes the initial value right after the handshake, which can
    // happen before React mounts and subscribes.
    themeChangeMessage(SHELL_ORIGIN, "dark");
    localeChangeMessage(SHELL_ORIGIN, "zh");

    const themeHandler = rs.fn();
    const localeHandler = rs.fn();
    client.onThemeChange(themeHandler);
    client.onLocaleChange(localeHandler);

    expect(themeHandler).toHaveBeenCalledTimes(1);
    expect(themeHandler).toHaveBeenCalledWith("dark");
    expect(localeHandler).toHaveBeenCalledTimes(1);
    expect(localeHandler).toHaveBeenCalledWith("zh");
  });

  test("the replayed value is the newest, not the first, push", () => {
    const client = newClient();
    themeChangeMessage(SHELL_ORIGIN, "dark");
    themeChangeMessage(SHELL_ORIGIN, "light");

    const handler = rs.fn();
    client.onThemeChange(handler);
    expect(handler).toHaveBeenCalledWith("light");
  });

  test("ignores appearance pushes from a non-Shell origin", () => {
    const client = newClient();
    const themeHandler = rs.fn();
    const localeHandler = rs.fn();
    client.onThemeChange(themeHandler);
    client.onLocaleChange(localeHandler);

    themeChangeMessage(OTHER_ORIGIN, "dark");
    localeChangeMessage(OTHER_ORIGIN, "zh");

    expect(themeHandler).not.toHaveBeenCalled();
    expect(localeHandler).not.toHaveBeenCalled();
  });

  test("drops protocol-invalid appearance pushes", () => {
    const client = newClient();
    const themeHandler = rs.fn();
    client.onThemeChange(themeHandler);

    dispatchMessage(SHELL_ORIGIN, {
      version: "1.0",
      type: "THEME_CHANGE",
      payload: { theme: "system" },
    });
    dispatchMessage(SHELL_ORIGIN, {
      version: "1.0",
      type: "LOCALE_CHANGE",
      payload: { locale: "zh-CN" },
    });

    expect(themeHandler).not.toHaveBeenCalled();
  });
});

describe("standalone (non-iframe) guard", () => {
  test("handshake and waitForToken reject without posting anything", async () => {
    unframeWindow();
    // In a top-level window `window.parent === window`, so spying on the
    // window itself catches any post the guard failed to prevent.
    const windowPost = rs.spyOn(window, "postMessage");
    const client = newClient();

    await expect(client.handshake()).rejects.toBeInstanceOf(
      BridgeNotEmbeddedError,
    );
    await expect(client.waitForToken()).rejects.toBeInstanceOf(
      BridgeNotEmbeddedError,
    );

    // Send methods are silent no-ops, and the listener is never registered.
    client.requestAuthToken("401");
    client.sendReady("t");
    client.sendAuthFailed("e", "c");
    logoutMessage(SHELL_ORIGIN);
    expect(windowPost).not.toHaveBeenCalled();
  });

  test("getIframeBridgeClient stays null in standalone mode", () => {
    unframeWindow();
    expect(getIframeBridgeClient()).toBeNull();
  });

  test("getIframeBridgeClient returns one shared client when framed", () => {
    expect(getIframeBridgeClient()).toBeInstanceOf(IframeBridgeClient);
    expect(getIframeBridgeClient()).toBe(getIframeBridgeClient());
  });
});

/** Own-property stubs over location (search / ancestorOrigins) + referrer. */
interface ProbeStub {
  search?: string;
  ancestorOrigins?: string[];
  referrer?: string;
}

/**
 * happy-dom implements none of the probe signals (no ancestorOrigins, empty
 * search/referrer), so tests inject them as configurable own properties;
 * restoreProbes deletes them to expose the prototype getters again.
 */
function stubProbes(stub: ProbeStub): void {
  if (stub.search !== undefined) {
    Object.defineProperty(window.location, "search", {
      value: stub.search,
      configurable: true,
    });
  }
  if (stub.ancestorOrigins !== undefined) {
    Object.defineProperty(window.location, "ancestorOrigins", {
      value: stub.ancestorOrigins,
      configurable: true,
    });
  }
  if (stub.referrer !== undefined) {
    Object.defineProperty(document, "referrer", {
      value: stub.referrer,
      configurable: true,
    });
  }
}

function restoreProbes(): void {
  const location = window.location as unknown as Record<string, unknown>;
  delete location.search;
  delete location.ancestorOrigins;
  delete (document as unknown as Record<string, unknown>).referrer;
}

describe("resolveShellOrigin", () => {
  afterEach(() => {
    restoreProbes();
    delete process.env.NEXT_PUBLIC_SHELL_ORIGIN;
  });

  test("prefers ancestorOrigins (browser-computed direct parent) over every declared signal", () => {
    stubProbes({
      search: "?embed=true&shellOrigin=http%3A%2F%2Fdeclared.example",
      ancestorOrigins: ["http://outer.example", "http://direct-parent.example"],
      referrer: "http://referrer.example/page",
    });
    process.env.NEXT_PUBLIC_SHELL_ORIGIN = "http://configured:5007";
    expect(resolveShellOrigin()).toBe("http://direct-parent.example");
  });

  test("prefers document.referrer over the declared ?shellOrigin parameter", () => {
    stubProbes({
      search: "?shellOrigin=http%3A%2F%2Fdeclared.example",
      referrer: "http://referrer.example/some/page?next=1",
    });
    expect(resolveShellOrigin()).toBe("http://referrer.example");
  });

  test("uses the ?shellOrigin parameter when no browser-computed signal exists", () => {
    stubProbes({
      search: "?embed=true&shellOrigin=http%3A%2F%2Fdeclared.example%3A5007",
    });
    process.env.NEXT_PUBLIC_SHELL_ORIGIN = "http://configured:5007";
    expect(resolveShellOrigin()).toBe("http://declared.example:5007");
  });

  test("filters document.referrer pointing at the frame itself", () => {
    stubProbes({
      search: "?shellOrigin=http%3A%2F%2Fdeclared.example",
      referrer: `${window.location.origin}/workspace/chats/new`,
    });
    // A self-referencing referrer (in-frame reload) is navigation noise, not a
    // parent signal: it must fall through to the declared parameter.
    expect(resolveShellOrigin()).toBe("http://declared.example");
  });

  test("falls through a self-referencing referrer to the env fallback", () => {
    stubProbes({
      referrer: `${window.location.origin}/workspace/chats/new`,
    });
    process.env.NEXT_PUBLIC_SHELL_ORIGIN = "http://configured:5007";
    // Without the filter this would lock onto the frame's own origin (never
    // the Shell's), which also shields the env fallback below it.
    expect(resolveShellOrigin()).toBe("http://configured:5007");
  });

  test("skips an empty ancestorOrigins list", () => {
    stubProbes({
      ancestorOrigins: [],
      search: "?shellOrigin=http%3A%2F%2Fdeclared.example",
    });
    expect(resolveShellOrigin()).toBe("http://declared.example");
  });

  test("falls back to NEXT_PUBLIC_SHELL_ORIGIN when no probe signal exists", () => {
    process.env.NEXT_PUBLIC_SHELL_ORIGIN = "http://configured:5007";
    expect(resolveShellOrigin()).toBe("http://configured:5007");
  });

  test("falls back to the current origin when nothing is configured", () => {
    expect(resolveShellOrigin()).toBe(window.location.origin);
  });

  test("rejects a non-http(s) probe value and continues down the chain", () => {
    stubProbes({
      search: "?shellOrigin=javascript%3Aalert(1)",
      referrer: "http://referrer.example/page",
    });
    expect(resolveShellOrigin()).toBe("http://referrer.example");
  });

  test("does not probe in a top-level window", () => {
    unframeWindow();
    stubProbes({ search: "?shellOrigin=http%3A%2F%2Fdeclared.example" });
    process.env.NEXT_PUBLIC_SHELL_ORIGIN = "http://configured:5007";
    // Standalone: probing is skipped, so the configured value still wins.
    expect(resolveShellOrigin()).toBe("http://configured:5007");
  });

  test("probing feeds the client handshake target and inbound check", async () => {
    stubProbes({
      ancestorOrigins: ["http://direct-parent.example"],
    });
    const client = new IframeBridgeClient();
    clients.push(client);

    const pending = client.handshake();
    expect(parent.postMessage.mock.calls[0]?.[1]).toBe(
      "http://direct-parent.example",
    );

    handshakeMessage("http://direct-parent.example");
    await expect(pending).resolves.toEqual({
      mode: "embed",
      capabilities: ["threads"],
    });
  });
});
