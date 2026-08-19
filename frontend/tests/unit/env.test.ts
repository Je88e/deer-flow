import { describe, expect, rs, test } from "@rstest/core";

async function importEnv() {
  // resetModules + a fresh dynamic import re-runs createEnv against the
  // current process.env, so each test controls the validated values.
  rs.resetModules();
  return import("@/env");
}

describe("apiBase", () => {
  test("defaults to /api on a root deployment", async () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    const { apiBase } = await importEnv();
    expect(apiBase()).toBe("/api");
  });

  test("prefixes the configured base path", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/leadagent";
    try {
      const { apiBase } = await importEnv();
      expect(apiBase()).toBe("/leadagent/api");
    } finally {
      delete process.env.NEXT_PUBLIC_BASE_PATH;
    }
  });

  test("treats an empty base path as unset", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "";
    try {
      const { apiBase } = await importEnv();
      expect(apiBase()).toBe("/api");
    } finally {
      delete process.env.NEXT_PUBLIC_BASE_PATH;
    }
  });
});
