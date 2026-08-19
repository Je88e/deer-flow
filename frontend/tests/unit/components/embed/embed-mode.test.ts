import { describe, expect, it } from "@rstest/core";

import {
  EMBED_SEARCH_PARAM,
  embedHref,
  isEmbedSearchValue,
} from "@/components/embed/embed-mode";

describe("isEmbedSearchValue", () => {
  it("enables embed mode only for the exact string 'true'", () => {
    expect(isEmbedSearchValue("true")).toBe(true);
    expect(isEmbedSearchValue("false")).toBe(false);
    expect(isEmbedSearchValue("1")).toBe(false);
    expect(isEmbedSearchValue("TRUE")).toBe(false);
    expect(isEmbedSearchValue(" true")).toBe(false);
    expect(isEmbedSearchValue("true ")).toBe(false);
  });

  it("keeps the standalone path when the parameter is absent or empty", () => {
    expect(isEmbedSearchValue(undefined)).toBe(false);
    expect(isEmbedSearchValue(null)).toBe(false);
    expect(isEmbedSearchValue("")).toBe(false);
  });

  it("uses the first value when the parameter is repeated", () => {
    expect(isEmbedSearchValue(["true"])).toBe(true);
    expect(isEmbedSearchValue(["true", "false"])).toBe(true);
    expect(isEmbedSearchValue(["false", "true"])).toBe(false);
    expect(isEmbedSearchValue([])).toBe(false);
  });

  it("pins the search parameter name", () => {
    expect(EMBED_SEARCH_PARAM).toBe("embed");
  });
});

describe("embedHref", () => {
  it("appends the embed parameter to a bare route path", () => {
    expect(embedHref("/workspace/chats/abc")).toBe(
      "/workspace/chats/abc?embed=true",
    );
  });

  it("joins with & when the path already carries a query", () => {
    expect(embedHref("/workspace/chats/abc?mock=true")).toBe(
      "/workspace/chats/abc?mock=true&embed=true",
    );
  });
});
