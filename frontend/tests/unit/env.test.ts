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

describe("stripBasePath", () => {
  test("is the identity on a root deployment", async () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    const { stripBasePath } = await importEnv();
    expect(stripBasePath("/workspace/chats/t1")).toBe("/workspace/chats/t1");
    expect(stripBasePath("/")).toBe("/");
  });

  test("strips the configured base path prefix", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/leadagent";
    try {
      const { stripBasePath } = await importEnv();
      expect(stripBasePath("/leadagent/workspace/chats/t1")).toBe(
        "/workspace/chats/t1",
      );
    } finally {
      delete process.env.NEXT_PUBLIC_BASE_PATH;
    }
  });

  test("maps the bare base path to /", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/leadagent";
    try {
      const { stripBasePath } = await importEnv();
      expect(stripBasePath("/leadagent")).toBe("/");
    } finally {
      delete process.env.NEXT_PUBLIC_BASE_PATH;
    }
  });

  test("leaves pathnames outside the base path unchanged", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/leadagent";
    try {
      const { stripBasePath } = await importEnv();
      expect(stripBasePath("/workspace/chats/t1")).toBe("/workspace/chats/t1");
    } finally {
      delete process.env.NEXT_PUBLIC_BASE_PATH;
    }
  });
});
