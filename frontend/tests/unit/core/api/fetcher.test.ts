import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";

import { UnauthorizedError } from "@/core/api/errors";
import type { fetch as apiFetchType } from "@/core/api/fetcher";

// The fetcher's 401 handling prefixes the login redirect with the deployment
// base path, so these tests run with @/env initialized under a base path.
// createEnv reads process.env at module init and ESM static imports evaluate
// before this module body, so the fetcher is pulled in through a dynamic
// import inside each test — keeping @/env uninitialized until after this
// assignment. The only static imports are the test runner and the dependency
//-free error type.
process.env.NEXT_PUBLIC_BASE_PATH = "/leadagent";

// The embed-auth double lives on globalThis because rs.mock factories are
// hoisted above every module-scope binding.
type EmbedAuthDouble = {
  isEmbedAuthActive: ReturnType<typeof rs.fn>;
  renewEmbedSession: ReturnType<typeof rs.fn>;
};

type Holders = { __embedAuth?: EmbedAuthDouble };

rs.mock("@/core/auth/embed-auth", () => ({
  isEmbedAuthActive: () =>
    (globalThis as Holders).__embedAuth!.isEmbedAuthActive(),
  renewEmbedSession: () =>
    (globalThis as Holders).__embedAuth!.renewEmbedSession(),
}));

function embedAuth(): EmbedAuthDouble {
  return (globalThis as Holders).__embedAuth!;
}

function stubWindow(
  pathname: string,
  search = "",
): { href: string; pathname: string; search: string } {
  // A real browser Location always exposes `search` ("" when absent) — the
  // 401 redirect folds it into the login return path.
  const location = { href: "", pathname, search };
  rs.stubGlobal("window", { location });
  return location;
}

async function importFetcher() {
  return import("@/core/api/fetcher");
}

beforeEach(() => {
  (globalThis as Holders).__embedAuth = {
    isEmbedAuthActive: rs.fn(() => false),
    renewEmbedSession: rs.fn(async () => false),
  };
});

afterEach(() => {
  rs.unstubAllGlobals();
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_BASE_PATH;
});

describe("fetch (shared CSRF/auth wrapper)", () => {
  test("passes non-401 responses through without touching embed auth", async () => {
    stubWindow("/leadagent/workspace/chats/t1");
    const fetchMock = rs.fn(async () => new Response("ok", { status: 200 }));
    rs.stubGlobal("fetch", fetchMock);

    const { fetch } = await importFetcher();
    const res = await fetch("/leadagent/api/v1/threads", { method: "GET" });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.credentials).toBe("include");
    expect(embedAuth().isEmbedAuthActive).not.toHaveBeenCalled();
  });

  test("401 hard-redirects to the base-path login URL with a router-relative return path", async () => {
    // Legacy contract, byte-stable outside EMBED mode: strip the base path
    // from the return path (the router re-applies it), prefix the login URL.
    const location = stubWindow("/leadagent/workspace/chats/t1");
    const fetchMock = rs.fn(async () => new Response(null, { status: 401 }));
    rs.stubGlobal("fetch", fetchMock);

    const { fetch } = await importFetcher();
    await expect(
      fetch("/leadagent/api/v1/threads", { method: "GET" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(location.href).toBe(
      "/leadagent/login?next=%2Fworkspace%2Fchats%2Ft1",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(embedAuth().renewEmbedSession).not.toHaveBeenCalled();
  });

  test("401 keeps the query string in the return path under a base path", async () => {
    // Routes that carry their target in the query (e.g. the standalone
    // artifact viewer) must survive the login round-trip (#upstream parity),
    // with the base path stripped from path+search alike.
    const location = stubWindow(
      "/leadagent/artifacts/view",
      "?path=%2Freport.md",
    );
    const fetchMock = rs.fn(async () => new Response(null, { status: 401 }));
    rs.stubGlobal("fetch", fetchMock);

    const { fetch } = await importFetcher();
    await expect(
      fetch("/leadagent/api/v1/threads", { method: "GET" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(location.href).toBe(
      "/leadagent/login?next=%2Fartifacts%2Fview%3Fpath%3D%252Freport.md",
    );
  });

  test("renews the embed session and retries once on 401 instead of redirecting", async () => {
    const location = stubWindow("/leadagent/workspace/chats/t1");
    embedAuth().isEmbedAuthActive.mockReturnValue(true);
    embedAuth().renewEmbedSession.mockResolvedValue(true);
    const fetchMock = rs.fn();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    rs.stubGlobal("fetch", fetchMock);

    const { fetch } = await importFetcher();
    const res = await fetch("/leadagent/api/v1/threads", { method: "GET" });

    expect(res.status).toBe(200);
    expect(embedAuth().renewEmbedSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl] = fetchMock.mock.calls[0] as unknown as [string];
    const [retryUrl, retryInit] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(retryUrl).toBe(firstUrl);
    expect(retryInit.credentials).toBe("include");
    // Silent renewal replaces the iframe login bounce: no navigation at all.
    expect(location.href).toBe("");
  });

  test("hard-redirects to login when the embed session renewal fails", async () => {
    const location = stubWindow("/leadagent/workspace/chats/t1");
    embedAuth().isEmbedAuthActive.mockReturnValue(true);
    embedAuth().renewEmbedSession.mockResolvedValue(false);
    const fetchMock = rs.fn(async () => new Response(null, { status: 401 }));
    rs.stubGlobal("fetch", fetchMock);

    const { fetch } = await importFetcher();
    await expect(
      fetch("/leadagent/api/v1/threads", { method: "GET" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(embedAuth().renewEmbedSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(location.href).toBe(
      "/leadagent/login?next=%2Fworkspace%2Fchats%2Ft1",
    );
  });

  test("hard-redirects when the post-renewal retry is still 401", async () => {
    const location = stubWindow("/leadagent/workspace/chats/t1");
    embedAuth().isEmbedAuthActive.mockReturnValue(true);
    embedAuth().renewEmbedSession.mockResolvedValue(true);
    const fetchMock = rs.fn(async () => new Response(null, { status: 401 }));
    rs.stubGlobal("fetch", fetchMock);

    const { fetch } = await importFetcher();
    await expect(
      fetch("/leadagent/api/v1/threads", { method: "GET" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(embedAuth().renewEmbedSession).toHaveBeenCalledTimes(1);
    expect(location.href).toBe(
      "/leadagent/login?next=%2Fworkspace%2Fchats%2Ft1",
    );
  });

  test("rebuilds the CSRF header from the rotated cookie on the post-renewal retry", async () => {
    // token-exchange sets a fresh csrf_token cookie like local login does, so
    // replaying the request with the pre-renewal token would 403.
    stubWindow("/leadagent/workspace/chats/t1");
    let csrf = "stale-token";
    rs.stubGlobal("document", {
      get cookie() {
        return `csrf_token=${csrf}`;
      },
    });
    embedAuth().isEmbedAuthActive.mockReturnValue(true);
    embedAuth().renewEmbedSession.mockImplementation(async () => {
      csrf = "fresh-token";
      return true;
    });
    const seenCsrf: Array<string | null> = [];
    const fetchMock = rs.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        seenCsrf.push(new Headers(init?.headers).get("X-CSRF-Token"));
        return seenCsrf.length === 1
          ? new Response(null, { status: 401 })
          : new Response("{}", { status: 200 });
      },
    );
    rs.stubGlobal("fetch", fetchMock);

    const { fetch } = await importFetcher();
    const res = await fetch("/leadagent/api/v1/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(200);
    expect(seenCsrf).toEqual(["stale-token", "fresh-token"]);
  });
});

describe("api fetcher Request inputs", () => {
  // Loaded through the same dynamic importer as the suite above so the
  // module-scope NEXT_PUBLIC_BASE_PATH assignment applies here too. The
  // type-only import erases at compile time, so it does not initialize
  // @/env before the assignment.
  let apiFetch: typeof apiFetchType;

  beforeAll(async () => {
    ({ fetch: apiFetch } = await importFetcher());
  });

  let sent: Request[];

  beforeEach(() => {
    sent = [];
    rs.stubGlobal("document", { cookie: "csrf_token=cookie-token" });
    rs.stubGlobal(
      "fetch",
      rs.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        sent.push(new Request(input, init));
        return new Response("ok");
      }),
    );
  });

  afterEach(() => {
    rs.unstubAllGlobals();
  });

  test("preserves a Request's method, body, headers and cancellation", async () => {
    const controller = new AbortController();
    const request = new Request("http://localhost/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": "run-1" },
      body: JSON.stringify({ title: "Research" }),
      signal: controller.signal,
    });

    await apiFetch(request);

    expect(sent[0]?.method).toBe("POST");
    expect(await sent[0]?.text()).toBe(JSON.stringify({ title: "Research" }));
    expect(sent[0]?.headers.get("Content-Type")).toBe("application/json");
    expect(sent[0]?.headers.get("X-Request-ID")).toBe("run-1");
    expect(sent[0]?.headers.get("X-CSRF-Token")).toBe("cookie-token");
    expect(sent[0]?.credentials).toBe("include");
    expect(request.headers.has("X-CSRF-Token")).toBe(false);
    controller.abort();
    expect(sent[0]?.signal.aborted).toBe(true);
  });

  test.each(["POST", "PUT", "PATCH", "DELETE"])(
    "injects CSRF for a Request with method %s",
    async (method) => {
      await apiFetch(new Request("http://localhost/api/threads", { method }));
      expect(sent[0]?.method).toBe(method);
      expect(sent[0]?.headers.get("X-CSRF-Token")).toBe("cookie-token");
    },
  );

  test.each(["GET", "HEAD", "OPTIONS"])(
    "does not inject CSRF for a Request with method %s",
    async (method) => {
      await apiFetch(new Request("http://localhost/api/threads", { method }));
      expect(sent[0]?.method).toBe(method);
      expect(sent[0]?.headers.has("X-CSRF-Token")).toBe(false);
    },
  );

  test("does not inject CSRF for TRACE in init", async () => {
    // Native Request rejects TRACE, so inspect options before that boundary.
    const nativeFetch = rs.fn().mockResolvedValue(new Response("ok"));
    rs.stubGlobal("fetch", nativeFetch);

    await apiFetch("http://localhost/api/threads", { method: "TRACE" });

    expect(nativeFetch).toHaveBeenCalledWith("http://localhost/api/threads", {
      method: "TRACE",
      headers: undefined,
      credentials: "include",
    });
  });

  test("preserves an explicit CSRF header inherited from the Request", async () => {
    await apiFetch(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "X-CSRF-Token": "explicit-token" },
      }),
    );
    expect(sent[0]?.headers.get("X-CSRF-Token")).toBe("explicit-token");
  });

  test("lets init replace Request headers and body without mutating either header set", async () => {
    const request = new Request("http://localhost/api/threads", {
      method: "POST",
      headers: { "X-Original": "original", "X-CSRF-Token": "request-token" },
      body: "original body",
    });
    const headers = new Headers({ "X-Override": "override" });

    await apiFetch(request, {
      method: "PUT",
      headers,
      body: "replacement body",
    });

    expect(sent[0]?.method).toBe("PUT");
    expect(await sent[0]?.text()).toBe("replacement body");
    expect(sent[0]?.headers.get("X-Override")).toBe("override");
    expect(sent[0]?.headers.has("X-Original")).toBe(false);
    expect(sent[0]?.headers.get("X-CSRF-Token")).toBe("cookie-token");
    expect(headers.has("X-CSRF-Token")).toBe(false);
    expect(request.headers.get("X-CSRF-Token")).toBe("request-token");
  });

  test("uses an init method override when deciding whether CSRF is required", async () => {
    await apiFetch(
      new Request("http://localhost/api/threads", { method: "DELETE" }),
      { method: "GET" },
    );
    expect(sent[0]?.method).toBe("GET");
    expect(sent[0]?.headers.has("X-CSRF-Token")).toBe(false);
  });

  test("preserves Request headers and body when there is no CSRF cookie", async () => {
    document.cookie = "";
    await apiFetch(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "X-Request-ID": "run-2" },
        body: "payload",
      }),
    );
    expect(sent[0]?.headers.get("X-Request-ID")).toBe("run-2");
    expect(sent[0]?.headers.has("X-CSRF-Token")).toBe(false);
    expect(await sent[0]?.text()).toBe("payload");
  });

  test("retains string-input behavior and an explicit init CSRF header", async () => {
    await apiFetch("http://localhost/api/threads", {
      method: "POST",
      headers: { "X-CSRF-Token": "init-token" },
      body: "payload",
    });
    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.headers.get("X-CSRF-Token")).toBe("init-token");
    expect(await sent[0]?.text()).toBe("payload");
  });

  test.each(["%E0%A4%A", "abc%", "a+b%zz"])(
    "forwards a malformed CSRF cookie verbatim instead of throwing: %s",
    async (cookieValue) => {
      document.cookie = `csrf_token=${cookieValue}`;

      await apiFetch("http://localhost/api/threads", { method: "POST" });

      expect(sent[0]?.headers.get("X-CSRF-Token")).toBe(cookieValue);
    },
  );

  test("still decodes a percent-encoded CSRF cookie", async () => {
    document.cookie = "csrf_token=cookie%2Dtoken";

    await apiFetch("http://localhost/api/threads", { method: "POST" });

    expect(sent[0]?.headers.get("X-CSRF-Token")).toBe("cookie-token");
  });
});
