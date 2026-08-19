import { describe, expect, test } from "@rstest/core";

import {
  BRIDGE_PROTOCOL_VERSION,
  authFailedMessage,
  authTokenRequestMessage,
  handshakeRequestMessage,
  parseInbound,
  readyMessage,
} from "@/core/bridge/bridge-protocol";

const VERSION = "1.0";

describe("parseInbound acceptance matrix", () => {
  test("accepts every downstream message shape", () => {
    expect(
      parseInbound({
        version: VERSION,
        type: "HANDSHAKE",
        payload: { mode: "embed", capabilities: ["threads", "todos"] },
      }),
    ).toEqual({
      version: VERSION,
      type: "HANDSHAKE",
      payload: { mode: "embed", capabilities: ["threads", "todos"] },
    });

    expect(
      parseInbound({
        version: VERSION,
        type: "AUTH_TOKEN",
        payload: {
          token: "jwt-value",
          tokenType: "keycloak-jwt",
          provider: "keycloak",
        },
      }),
    ).toEqual({
      version: VERSION,
      type: "AUTH_TOKEN",
      payload: {
        token: "jwt-value",
        tokenType: "keycloak-jwt",
        provider: "keycloak",
      },
    });

    expect(
      parseInbound({ version: VERSION, type: "LOGOUT", payload: {} }),
    ).toEqual({ version: VERSION, type: "LOGOUT", payload: {} });
  });

  test("accepts every upstream message shape", () => {
    expect(
      parseInbound({
        version: VERSION,
        type: "HANDSHAKE_REQUEST",
        payload: {},
      }),
    ).toEqual({ version: VERSION, type: "HANDSHAKE_REQUEST", payload: {} });

    expect(
      parseInbound({
        version: VERSION,
        type: "AUTH_TOKEN_REQUEST",
        payload: { reason: "session-expired" },
      }),
    ).toEqual({
      version: VERSION,
      type: "AUTH_TOKEN_REQUEST",
      payload: { reason: "session-expired" },
    });

    expect(
      parseInbound({
        version: VERSION,
        type: "AUTH_TOKEN_REQUEST",
        payload: {},
      }),
    ).toEqual({ version: VERSION, type: "AUTH_TOKEN_REQUEST", payload: {} });

    expect(
      parseInbound({
        version: VERSION,
        type: "READY",
        payload: { threadId: "thread-1" },
      }),
    ).toEqual({
      version: VERSION,
      type: "READY",
      payload: { threadId: "thread-1" },
    });

    expect(
      parseInbound({
        version: VERSION,
        type: "AUTH_FAILED",
        payload: { error: "token exchange failed", code: "E_EXCHANGE" },
      }),
    ).toEqual({
      version: VERSION,
      type: "AUTH_FAILED",
      payload: { error: "token exchange failed", code: "E_EXCHANGE" },
    });
  });

  test("tolerates unknown extra keys within the same version", () => {
    const message = parseInbound({
      version: VERSION,
      type: "HANDSHAKE",
      payload: { mode: "embed", capabilities: [], extra: true },
    });
    expect(message?.type).toBe("HANDSHAKE");
  });
});

describe("parseInbound rejection matrix", () => {
  test.each([
    [
      "missing version",
      { type: "HANDSHAKE", payload: { mode: "embed", capabilities: [] } },
    ],
    [
      "wrong version string",
      {
        version: "1.1",
        type: "HANDSHAKE",
        payload: { mode: "embed", capabilities: [] },
      },
    ],
    [
      "numeric version",
      {
        version: 1.0,
        type: "HANDSHAKE",
        payload: { mode: "embed", capabilities: [] },
      },
    ],
    [
      "version inside the payload instead of the envelope",
      {
        type: "HANDSHAKE",
        payload: { version: VERSION, mode: "embed", capabilities: [] },
      },
    ],
    [
      "unknown type",
      { version: VERSION, type: "NAVIGATE", payload: { threadId: "t" } },
    ],
    ["missing type", { version: VERSION, payload: {} }],
    ["missing payload", { version: VERSION, type: "LOGOUT" }],
    [
      "HANDSHAKE with wrong mode",
      {
        version: VERSION,
        type: "HANDSHAKE",
        payload: { mode: "standalone", capabilities: [] },
      },
    ],
    [
      "HANDSHAKE with missing capabilities",
      { version: VERSION, type: "HANDSHAKE", payload: { mode: "embed" } },
    ],
    [
      "HANDSHAKE with non-array capabilities",
      {
        version: VERSION,
        type: "HANDSHAKE",
        payload: { mode: "embed", capabilities: "threads" },
      },
    ],
    [
      "HANDSHAKE with non-string capability entries",
      {
        version: VERSION,
        type: "HANDSHAKE",
        payload: { mode: "embed", capabilities: [42] },
      },
    ],
    [
      "AUTH_TOKEN with missing token",
      {
        version: VERSION,
        type: "AUTH_TOKEN",
        payload: { tokenType: "keycloak-jwt", provider: "keycloak" },
      },
    ],
    [
      "AUTH_TOKEN with wrong tokenType",
      {
        version: VERSION,
        type: "AUTH_TOKEN",
        payload: { token: "t", tokenType: "opaque", provider: "keycloak" },
      },
    ],
    [
      "AUTH_TOKEN with wrong provider",
      {
        version: VERSION,
        type: "AUTH_TOKEN",
        payload: { token: "t", tokenType: "keycloak-jwt", provider: "auth0" },
      },
    ],
    [
      "AUTH_TOKEN_REQUEST with non-string reason",
      { version: VERSION, type: "AUTH_TOKEN_REQUEST", payload: { reason: 7 } },
    ],
    [
      "READY with missing threadId",
      { version: VERSION, type: "READY", payload: {} },
    ],
    [
      "READY with non-string threadId",
      { version: VERSION, type: "READY", payload: { threadId: 1 } },
    ],
    [
      "AUTH_FAILED with missing code",
      {
        version: VERSION,
        type: "AUTH_FAILED",
        payload: { error: "boom" },
      },
    ],
    ["null input", null],
    ["string input", "HANDSHAKE"],
    ["array input", [{ version: VERSION, type: "LOGOUT", payload: {} }]],
  ])("rejects %s", (_label, input) => {
    expect(parseInbound(input)).toBeNull();
  });
});

describe("upstream message helpers", () => {
  test("stamp the top-level protocol version automatically", () => {
    expect(handshakeRequestMessage()).toEqual({
      version: BRIDGE_PROTOCOL_VERSION,
      type: "HANDSHAKE_REQUEST",
      payload: {},
    });

    expect(authTokenRequestMessage("session-expired")).toEqual({
      version: BRIDGE_PROTOCOL_VERSION,
      type: "AUTH_TOKEN_REQUEST",
      payload: { reason: "session-expired" },
    });

    expect(authTokenRequestMessage()).toEqual({
      version: BRIDGE_PROTOCOL_VERSION,
      type: "AUTH_TOKEN_REQUEST",
      payload: {},
    });

    expect(readyMessage("thread-1")).toEqual({
      version: BRIDGE_PROTOCOL_VERSION,
      type: "READY",
      payload: { threadId: "thread-1" },
    });

    expect(authFailedMessage("exchange failed", "E_EXCHANGE")).toEqual({
      version: BRIDGE_PROTOCOL_VERSION,
      type: "AUTH_FAILED",
      payload: { error: "exchange failed", code: "E_EXCHANGE" },
    });
  });

  test("produce messages parseInbound accepts", () => {
    expect(parseInbound(handshakeRequestMessage())?.type).toBe(
      "HANDSHAKE_REQUEST",
    );
    expect(parseInbound(authTokenRequestMessage())?.type).toBe(
      "AUTH_TOKEN_REQUEST",
    );
    expect(parseInbound(authTokenRequestMessage("401"))?.type).toBe(
      "AUTH_TOKEN_REQUEST",
    );
    expect(parseInbound(readyMessage("t"))?.type).toBe("READY");
    expect(parseInbound(authFailedMessage("e", "c"))?.type).toBe("AUTH_FAILED");
  });
});
