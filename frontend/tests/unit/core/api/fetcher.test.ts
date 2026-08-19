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
});
