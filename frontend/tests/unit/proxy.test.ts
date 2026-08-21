import { describe, expect, it } from "@rstest/core";
import { NextRequest } from "next/server";

import { proxy } from "@/proxy";

// NextResponse.next({ request: { headers } }) encodes mutated request
// headers on the response as `x-middleware-request-<name>` overrides; the
// server applies them before the layout runs. These tests pin that contract.
const OVERRIDE_HEADER = "x-middleware-request-x-deerflow-embed";

describe("proxy EMBED header stamping", () => {
  it("stamps the embed header for ?embed=true workspace requests", () => {
    const response = proxy(
      new NextRequest("http://localhost/workspace?embed=true"),
    );

    expect(response.headers.get(OVERRIDE_HEADER)).toBe("1");
  });

  it("stamps nested workspace routes as well", () => {
    const response = proxy(
      new NextRequest("http://localhost/workspace/chats/new?embed=true"),
    );

    expect(response.headers.get(OVERRIDE_HEADER)).toBe("1");
  });

  it("leaves requests without the parameter unstamped", () => {
    const response = proxy(new NextRequest("http://localhost/workspace"));

    expect(response.headers.get(OVERRIDE_HEADER)).toBeNull();
  });

  it("does not treat other embed values as EMBED mode", () => {
    const response = proxy(
      new NextRequest("http://localhost/workspace?embed=1"),
    );

    expect(response.headers.get(OVERRIDE_HEADER)).toBeNull();
  });

  it("drops a client-supplied embed header instead of trusting it", () => {
    const request = new NextRequest("http://localhost/workspace", {
      headers: { "x-deerflow-embed": "1" },
    });
    const response = proxy(request);

    expect(response.headers.get(OVERRIDE_HEADER)).toBeNull();
  });
});
