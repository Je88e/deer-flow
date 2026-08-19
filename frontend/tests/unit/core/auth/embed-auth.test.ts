import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";

import {
  EMBED_AUTH_FAILED_CODES,
  SESSION_EXPIRED_REASON,
  authenticateViaBridge,
  isEmbedAuthActive,
  renewEmbedSession,
  resetEmbedAuthForTesting,
  withEmbedAuthRetry,
  wireBridgeLogout,
} from "@/core/auth/embed-auth";
import {
  BridgeTimeoutError,
  type IframeBridgeClient,
} from "@/core/bridge/iframe-bridge-client";

const TOKEN_1 = {
  token: "jwt-1",
  tokenType: "keycloak-jwt",
  provider: "keycloak",
};
const TOKEN_2 = {
  token: "jwt-2",
  tokenType: "keycloak-jwt",
  provider: "keycloak",
};

type AuthTokenShape = typeof TOKEN_1;

/**
 * Stand-in for IframeBridgeClient recording the orchestration order. Test
 * outcomes are injected through the queue/error slots — never by replacing
 * the mock implementations, which would silently stop the order recording.
 */
interface FakeBridgeClient {
  handshake: ReturnType<typeof rs.fn>;
  waitForToken: ReturnType<typeof rs.fn>;
  requestAuthToken: ReturnType<typeof rs.fn>;
  sendReady: ReturnType<typeof rs.fn>;
  sendAuthFailed: ReturnType<typeof rs.fn>;
  onLogout: ReturnType<typeof rs.fn>;
  order: string[];
  /** Outcomes served by waitForToken in order; defaults to TOKEN_1. */
  tokenQueue: Array<AuthTokenShape | Promise<AuthTokenShape> | Error>;
  /** Thrown by handshake when set (timeout / not-embedded simulations). */
  handshakeError: Error | null;
}

// eslint forbids empty functions; an undefined-returning stub keeps intent explicit.
function noop(): void {
  return undefined;
}

function fakeBridgeClient(): FakeBridgeClient {
  const order: string[] = [];
  const fake: FakeBridgeClient = {
    handshake: rs.fn(async () => {
      order.push("handshake");
      if (fake.handshakeError) {
        throw fake.handshakeError;
      }
      return { mode: "embed", capabilities: ["threads"] };
    }),
    waitForToken: rs.fn(async (options?: { ignorePending?: boolean }) => {
      order.push(
        options?.ignorePending ? "waitForToken:fresh" : "waitForToken",
      );
      const next = fake.tokenQueue.shift() ?? { ...TOKEN_1 };
      if (next instanceof Error) {
        throw next;
      }
      return next;
    }),
    requestAuthToken: rs.fn((reason: string) => {
      order.push(`auth-token-request:${reason}`);
    }),
    sendReady: rs.fn((threadId: string) => {
      order.push(`ready:${threadId}`);
    }),
    sendAuthFailed: rs.fn((error: string, code: string) => {
      order.push(`auth-failed:${code}`);
    }),
    onLogout: rs.fn(() => noop),
    order,
    tokenQueue: [],
    handshakeError: null,
  };
  return fake;
}

function asClient(fake: FakeBridgeClient): IframeBridgeClient {
  return fake as unknown as IframeBridgeClient;
}

function jsonResponse(status: number, body: unknown = {}): Response {
  // No-content statuses reject a body, so send null for those.
  const bodyless = status === 204 || status === 205 || status === 304;
  return new Response(bodyless ? null : JSON.stringify(body), { status });
}

type FetchCalls = Array<[string, RequestInit]>;

let fetchSpy: ReturnType<typeof rs.spyOn>;

/** Spy on global fetch; each call records `exchange` in the shared order. */
function mockExchangeFetch(order: string[], responses: Response[] = []): void {
  const queue = [...responses];
  fetchSpy = rs.spyOn(globalThis, "fetch").mockImplementation(async () => {
    order.push("exchange");
    return (
      queue.shift() ??
      jsonResponse(200, { expires_in: 604800, needs_setup: false })
    );
  });
}

function exchangeCalls(): FetchCalls {
  return fetchSpy.mock.calls as unknown as FetchCalls;
}

/** Activate bridge auth so renewal tests start from an authenticated state. */
async function activate(fake: FakeBridgeClient): Promise<void> {
  mockExchangeFetch(fake.order);
  await authenticateViaBridge(asClient(fake), { threadId: "thread-1" });
  fake.order.length = 0;
}

beforeEach(() => {
  resetEmbedAuthForTesting();
});

afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = undefined as unknown as ReturnType<typeof rs.spyOn>;
  resetEmbedAuthForTesting();
});

describe("authenticateViaBridge", () => {
  test("happy path: handshake → token → exchange → ready, exact request body", async () => {
    const fake = fakeBridgeClient();
    mockExchangeFetch(fake.order);

    const result = await authenticateViaBridge(asClient(fake), {
      threadId: "thread-1",
    });

    expect(result).toEqual({ status: "authenticated" });
    expect(fake.order).toEqual([
      "handshake",
      "waitForToken",
      "exchange",
      "ready:thread-1",
    ]);
    expect(fake.sendAuthFailed).not.toHaveBeenCalled();
    expect(isEmbedAuthActive()).toBe(true);

    // The exchange request is the Task 1 contract, byte-for-byte.
    const firstExchange = exchangeCalls()[0];
    expect(exchangeCalls()).toHaveLength(1);
    if (!firstExchange) {
      throw new Error("expected one token-exchange fetch call");
    }
    const [url, init] = firstExchange;
    expect(url).toBe("/api/v1/auth/token-exchange");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({
      token: "jwt-1",
      provider: "keycloak",
    });
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });

  test("exchange failure reports AUTH_FAILED and returns a failed result", async () => {
    const fake = fakeBridgeClient();
    mockExchangeFetch(fake.order, [
      jsonResponse(401, { detail: "Invalid audience" }),
    ]);

    const result = await authenticateViaBridge(asClient(fake), {
      threadId: "thread-1",
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.code).toBe(EMBED_AUTH_FAILED_CODES.exchangeFailed);
      expect(result.error.message).toContain("401");
    }
    expect(fake.sendAuthFailed).toHaveBeenCalledTimes(1);
    const [error, code] = fake.sendAuthFailed.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(code).toBe(EMBED_AUTH_FAILED_CODES.exchangeFailed);
    expect(error).toContain("401");
    expect(fake.sendReady).not.toHaveBeenCalled();
    expect(isEmbedAuthActive()).toBe(false);
  });

  test("handshake timeout degrades to no-bridge without AUTH_FAILED or exchange", async () => {
    const fake = fakeBridgeClient();
    fake.handshakeError = new BridgeTimeoutError(5000);
    mockExchangeFetch(fake.order);

    const result = await authenticateViaBridge(asClient(fake), {
      threadId: "thread-1",
    });

    // Resolves (never rejects) with the degradation signal for the caller.
    expect(result.status).toBe("no-bridge");
    if (result.status === "no-bridge") {
      expect(result.error).toBeInstanceOf(BridgeTimeoutError);
    }
    expect(fake.waitForToken).not.toHaveBeenCalled();
    expect(fake.sendAuthFailed).not.toHaveBeenCalled();
    expect(fake.sendReady).not.toHaveBeenCalled();
    expect(fake.order).toEqual(["handshake"]);
    expect(exchangeCalls()).toHaveLength(0);
  });

  test("token wait timeout reports AUTH_FAILED with E_TOKEN_TIMEOUT", async () => {
    const fake = fakeBridgeClient();
    fake.tokenQueue.push(new BridgeTimeoutError(5000));
    mockExchangeFetch(fake.order);

    const result = await authenticateViaBridge(asClient(fake), {
      threadId: "thread-1",
    });

    expect(result.status).toBe("failed");
    expect(fake.sendAuthFailed).toHaveBeenCalledWith(
      expect.any(String),
      EMBED_AUTH_FAILED_CODES.tokenTimeout,
    );
    expect(fake.sendReady).not.toHaveBeenCalled();
    expect(exchangeCalls()).toHaveLength(0);
  });

  test("is idempotent per client: a second call replays the settled result", async () => {
    const fake = fakeBridgeClient();
    mockExchangeFetch(fake.order);
    const client = asClient(fake);

    const first = authenticateViaBridge(client, { threadId: "thread-1" });
    const second = authenticateViaBridge(client, { threadId: "thread-2" });
    await Promise.all([first, second]);

    expect(await first).toEqual({ status: "authenticated" });
    expect(await second).toEqual({ status: "authenticated" });
    expect(fake.handshake).toHaveBeenCalledTimes(1);
    expect(fake.sendReady).toHaveBeenCalledTimes(1);
    expect(fake.sendReady).toHaveBeenCalledWith("thread-1");
    expect(exchangeCalls()).toHaveLength(1);
  });
});

describe("renewEmbedSession / withEmbedAuthRetry", () => {
  test("401 → requestAuthToken(session-expired) → new token → re-exchange → retry", async () => {
    const fake = fakeBridgeClient();
    await activate(fake);
    fake.tokenQueue.push({ ...TOKEN_2 });
    fake.waitForToken.mockClear();

    let calls = 0;
    const operation = rs.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error("HTTP 401: Unauthorized"), {
          status: 401,
        });
      }
      return "recovered";
    });

    const result = await withEmbedAuthRetry(operation);

    expect(result).toBe("recovered");
    expect(operation).toHaveBeenCalledTimes(2);
    // Renewal asks for a fresh token and waits for one that arrives after
    // the request (stale cached tokens are dropped, Task 3 review Minor③).
    expect(fake.requestAuthToken).toHaveBeenCalledTimes(1);
    expect(fake.requestAuthToken).toHaveBeenCalledWith(SESSION_EXPIRED_REASON);
    expect(fake.waitForToken).toHaveBeenCalledTimes(1);
    expect(fake.waitForToken).toHaveBeenCalledWith({ ignorePending: true });
    // The re-exchange carries the NEW token, byte-for-byte contract body.
    const callsMade = exchangeCalls();
    expect(callsMade).toHaveLength(2);
    const renewalExchange = callsMade[1];
    if (!renewalExchange) {
      throw new Error("expected a second token-exchange fetch call");
    }
    expect(JSON.parse(renewalExchange[1].body as string)).toEqual({
      token: "jwt-2",
      provider: "keycloak",
    });
    // The waiter registers before the request goes out.
    expect(fake.order).toEqual([
      "waitForToken:fresh",
      `auth-token-request:${SESSION_EXPIRED_REASON}`,
      "exchange",
    ]);
  });

  test("concurrent 401s share a single AUTH_TOKEN_REQUEST (single flight)", async () => {
    const fake = fakeBridgeClient();
    await activate(fake);

    let releaseToken: ((token: AuthTokenShape) => void) | undefined;
    fake.tokenQueue.push(
      new Promise<AuthTokenShape>((resolve) => {
        releaseToken = resolve;
      }),
    );
    fake.waitForToken.mockClear();
    fake.requestAuthToken.mockClear();

    const first = renewEmbedSession();
    const second = renewEmbedSession();
    await Promise.resolve();

    expect(fake.requestAuthToken).toHaveBeenCalledTimes(1);
    expect(fake.waitForToken).toHaveBeenCalledTimes(1);

    releaseToken?.({ ...TOKEN_2 });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(fake.requestAuthToken).toHaveBeenCalledTimes(1);
  });

  test("returns false without touching the bridge when auth never succeeded", async () => {
    const fake = fakeBridgeClient();
    await expect(renewEmbedSession()).resolves.toBe(false);
    expect(fake.requestAuthToken).not.toHaveBeenCalled();
  });

  test("non-401 errors rethrow without renewal", async () => {
    const fake = fakeBridgeClient();
    await activate(fake);

    const operation = rs.fn(async () => {
      throw new Error("HTTP 500: boom");
    });
    await expect(withEmbedAuthRetry(operation)).rejects.toThrow("boom");
    expect(fake.requestAuthToken).not.toHaveBeenCalled();
  });

  test("401 without active bridge auth rethrows without AUTH_TOKEN_REQUEST", async () => {
    const fake = fakeBridgeClient();
    const operation = rs.fn(async () => {
      throw Object.assign(new Error("HTTP 401: Unauthorized"), {
        status: 401,
      });
    });
    await expect(withEmbedAuthRetry(operation)).rejects.toThrow("401");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(fake.requestAuthToken).not.toHaveBeenCalled();
  });

  test("failed renewal rethrows the original error", async () => {
    const fake = fakeBridgeClient();
    await activate(fake);
    fake.tokenQueue.push(new BridgeTimeoutError(5000));

    const operation = rs.fn(async () => {
      throw Object.assign(new Error("HTTP 401: Unauthorized"), {
        status: 401,
      });
    });
    await expect(withEmbedAuthRetry(operation)).rejects.toThrow("401");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test("retries once when the operation resolves to a bare 401 Response", async () => {
    const fake = fakeBridgeClient();
    await activate(fake);
    fake.tokenQueue.push({ ...TOKEN_2 });

    let calls = 0;
    const operation = rs.fn(async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(401) : jsonResponse(200, { ok: true });
    });

    const result = await withEmbedAuthRetry(operation);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });
});

describe("wireBridgeLogout", () => {
  test("LOGOUT handler POSTs the Gateway logout with keepalive and apiBase prefix", () => {
    const fake = fakeBridgeClient();
    let handler: (() => void) | undefined;
    fake.onLogout.mockImplementation((subscriber: () => void) => {
      handler = subscriber;
      return noop;
    });
    fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(204));

    wireBridgeLogout(asClient(fake));

    expect(typeof handler).toBe("function");
    handler?.();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/v1/auth/logout");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.keepalive).toBe(true);
  });

  test("the handler swallows fetch failures during page unload", async () => {
    const fake = fakeBridgeClient();
    let handler: (() => void) | undefined;
    fake.onLogout.mockImplementation((subscriber: () => void) => {
      handler = subscriber;
      return noop;
    });
    fetchSpy = rs
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("unloaded"));

    wireBridgeLogout(asClient(fake));
    handler?.();
    // Fire-and-forget: let the rejected promise reach its catch handler
    // instead of becoming an unhandled rejection.
    await Promise.resolve();
    await Promise.resolve();
  });

  test("returns the client's unsubscribe function", () => {
    const fake = fakeBridgeClient();
    const unsubscribe = rs.fn();
    fake.onLogout.mockReturnValue(unsubscribe);

    expect(wireBridgeLogout(asClient(fake))).toBe(unsubscribe);
  });

  test("LOGOUT clears the active bridge so later renewals short-circuit", async () => {
    // T6 review Minor②: after the Shell logs the user out, a late 401 must
    // not trigger a renewal against the logged-out Shell.
    const fake = fakeBridgeClient();
    await activate(fake);
    expect(isEmbedAuthActive()).toBe(true);

    let handler: (() => void) | undefined;
    fake.onLogout.mockImplementation((subscriber: () => void) => {
      handler = subscriber;
      return noop;
    });
    wireBridgeLogout(asClient(fake));
    handler?.();

    expect(isEmbedAuthActive()).toBe(false);
    await expect(renewEmbedSession()).resolves.toBe(false);
    expect(fake.requestAuthToken).not.toHaveBeenCalled();
  });
});
