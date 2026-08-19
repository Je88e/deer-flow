// Plain node project: no `window`, which is exactly the SSR condition.
import { describe, expect, test } from "@rstest/core";

import {
  getIframeBridgeClient,
  isEmbeddedWindow,
  resolveShellOrigin,
} from "@/core/bridge/iframe-bridge-client";
// Importing the hook module must not touch `window` either.
import { useBridgeClient } from "@/core/bridge/use-bridge";

describe("bridge modules without a window (SSR)", () => {
  test("iframe detection reports not embedded", () => {
    expect(typeof window).toBe("undefined");
    expect(isEmbeddedWindow()).toBe(false);
  });

  test("the shared client stays null", () => {
    expect(getIframeBridgeClient()).toBeNull();
  });

  test("shell origin resolution does not crash", () => {
    expect(resolveShellOrigin()).toBe("");
  });

  test("the React hook surface is importable", () => {
    expect(typeof useBridgeClient).toBe("function");
  });
});
