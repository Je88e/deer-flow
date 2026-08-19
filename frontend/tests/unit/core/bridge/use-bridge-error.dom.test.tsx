// Dedicated to the hook's error branch: the handshake rejection is produced by
// a stubbed client, because faking the real 5s handshake timer under React's
// async act deadlocks this environment (see use-bridge.dom.test.tsx).
import { afterEach, describe, expect, rs, test } from "@rstest/core";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

// The factory only closes over `stubClient`; it is evaluated lazily at call
// time, after module-level constants below have been initialized.
rs.mock("@/core/bridge/iframe-bridge-client", () => ({
  getIframeBridgeClient: () => stubClient,
}));

import { useBridgeHandshake } from "@/core/bridge/use-bridge";

const handshakeFailure = new Error("bridge handshake timed out");

const stubClient = {
  handshake: () => Promise.reject(handshakeFailure),
  onLogout: () => () => undefined,
};

afterEach(() => {
  cleanup();
});

describe("useBridgeHandshake error path", () => {
  test("surfaces a handshake rejection as an error state", async () => {
    const { result } = renderHook(() => useBridgeHandshake());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current).toEqual({
      status: "error",
      error: handshakeFailure,
    });
  });
});
