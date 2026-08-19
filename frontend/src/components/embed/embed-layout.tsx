import type { ReactNode } from "react";

/**
 * Layout shell for EMBED mode (`?embed=true`).
 *
 * The workspace layout above this shell already provides auth, i18n, the
 * query client, command palette, settings dialogs, and toasts, so this
 * component deliberately re-wraps nothing — duplicate providers would break
 * context singletons. The workspace sidebar is hidden separately by the
 * sidebar itself, which reads the same `embed` URL parameter.
 *
 * `children` is the single slot: chat content flows through it today, and
 * the embedded thread list mounts as a sibling column inside this shell in
 * the follow-up integration task.
 */
export function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full min-h-0" data-embed-layout="true">
      {children}
    </div>
  );
}
