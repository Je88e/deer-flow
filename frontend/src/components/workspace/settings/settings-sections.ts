import type { SettingsSection } from "./settings-dialog";

/**
 * Sections hidden in EMBED mode (WIT Shell iframe): the Shell owns account
 * management, and visual theming of the embedded frame follows the host page.
 */
export const EMBED_HIDDEN_SECTIONS: ReadonlySet<string> = new Set([
  "account",
  "appearance",
]);

/**
 * Pick the section the dialog opens on: the requested one when it is in the
 * visible list, otherwise the first visible section. EMBED hides "account"
 * and "appearance" — both defaults elsewhere — so the dialog must not open
 * on a section whose nav entry is filtered out.
 */
export function resolveInitialSettingsSection(
  defaultSection: SettingsSection,
  visibleSections: ReadonlyArray<{ id: string }>,
): SettingsSection {
  if (visibleSections.some((section) => section.id === defaultSection)) {
    return defaultSection;
  }
  return (
    (visibleSections[0]?.id as SettingsSection | undefined) ?? defaultSection
  );
}
