import { afterEach, describe, expect, it } from "@rstest/core";

import { embedHref } from "@/components/embed/embed-mode";

/**
 * happy-dom owns a real location, so the client-side auto-propagation of
 * ?shellOrigin across internal navigation can be tested by stubbing
 * location.search like the bridge client tests do.
 */
function stubSearch(search: string): void {
  Object.defineProperty(window.location, "search", {
    value: search,
    configurable: true,
  });
}

describe("embedHref (client window)", () => {
  afterEach(() => {
    delete (window.location as unknown as Record<string, unknown>).search;
  });

  it("re-propagates the current URL's shellOrigin automatically", () => {
    stubSearch("?embed=true&shellOrigin=http%3A%2F%2Fshell.example%3A3000");
    expect(embedHref("/workspace/chats/new")).toBe(
      "/workspace/chats/new?embed=true&shellOrigin=http%3A%2F%2Fshell.example%3A3000",
    );
  });

  it("stays at embed-only when the current URL has no shellOrigin", () => {
    stubSearch("?embed=true");
    expect(embedHref("/workspace/chats/new")).toBe(
      "/workspace/chats/new?embed=true",
    );
  });
});
