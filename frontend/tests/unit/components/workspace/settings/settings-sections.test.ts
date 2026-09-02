import { describe, expect, it } from "@rstest/core";

import type { SettingsSection } from "@/components/workspace/settings/settings-dialog";
import {
  EMBED_HIDDEN_SECTIONS,
  resolveInitialSettingsSection,
} from "@/components/workspace/settings/settings-sections";

// Mirror of the dialog's section order (labels are irrelevant here).
const ALL_SECTION_IDS: SettingsSection[] = [
  "account",
  "appearance",
  "notification",
  "channels",
  "integrations",
  "memory",
  "tools",
  "subagents",
  "skills",
];

const EMBED_SECTION_IDS = ALL_SECTION_IDS.filter(
  (id) => !EMBED_HIDDEN_SECTIONS.has(id),
).map((id) => ({ id }));

const ALL_SECTIONS = ALL_SECTION_IDS.map((id) => ({ id }));

describe("EMBED_HIDDEN_SECTIONS", () => {
  it("hides account and appearance for the WIT Shell iframe", () => {
    expect(EMBED_HIDDEN_SECTIONS.has("account")).toBe(true);
    expect(EMBED_HIDDEN_SECTIONS.has("appearance")).toBe(true);
    expect([...EMBED_HIDDEN_SECTIONS].sort()).toEqual([
      "account",
      "appearance",
    ]);
  });
});

describe("resolveInitialSettingsSection", () => {
  it("returns the requested section when it is visible", () => {
    expect(resolveInitialSettingsSection("appearance", ALL_SECTIONS)).toBe(
      "appearance",
    );
    expect(resolveInitialSettingsSection("memory", EMBED_SECTION_IDS)).toBe(
      "memory",
    );
  });

  it("falls back to the first visible section when EMBED hides the default", () => {
    // "appearance" is the store default and every openSettings("appearance")
    // call site's argument — under EMBED the dialog must open on the first
    // visible section instead.
    expect(resolveInitialSettingsSection("appearance", EMBED_SECTION_IDS)).toBe(
      "notification",
    );
    expect(resolveInitialSettingsSection("account", EMBED_SECTION_IDS)).toBe(
      "notification",
    );
  });

  it("keeps the requested section when the visible list is empty", () => {
    expect(resolveInitialSettingsSection("tools", [])).toBe("tools");
  });
});
