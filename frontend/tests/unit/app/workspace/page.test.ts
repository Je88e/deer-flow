import { describe, expect, it } from "@rstest/core";

import WorkspacePage from "@/app/workspace/page";

// next/navigation redirect() throws; the digest encodes the target URL.
async function redirectDigest(
  searchParams: Record<string, string>,
): Promise<string> {
  try {
    await WorkspacePage({ searchParams: Promise.resolve(searchParams) });
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    if (digest?.includes("NEXT_REDIRECT")) {
      return digest;
    }
    throw error;
  }
  throw new Error("expected WorkspacePage to redirect");
}

describe("WorkspacePage", () => {
  it("carries embed=true across the default-chat redirect", async () => {
    const digest = await redirectDigest({ embed: "true" });

    expect(digest).toContain("/workspace/chats/new?embed=true");
  });

  it("redirects plain visits to the standalone default chat", async () => {
    const digest = await redirectDigest({});

    expect(digest).toContain("/workspace/chats/new");
    expect(digest).not.toContain("embed=true");
  });

  it("ignores embed values other than exactly 'true'", async () => {
    const digest = await redirectDigest({ embed: "1" });

    expect(digest).not.toContain("embed=true");
  });
});
