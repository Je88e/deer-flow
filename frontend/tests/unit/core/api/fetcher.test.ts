import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";

import { UnauthorizedError } from "@/core/api/errors";

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

function stubWindow(pathname: string): { href: string; pathname: string } {
  const location = { href: "", pathname };
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
