"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

import { getIframeBridgeClient } from "@/core/bridge/iframe-bridge-client";
import { useI18nContext } from "@/core/i18n/context";
import { normalizeLocale } from "@/core/i18n/locale";

/**
 * Apply the Shell-pushed appearance inside the EMBED iframe.
 *
 * Theme and locale are Shell-owned in EMBED mode: the cross-origin iframe
 * cannot read the standalone app's cookie/localStorage (third-party cookie
 * blocking and storage partitioning), so THEME_CHANGE / LOCALE_CHANGE pushes
 * are the single source of truth. The theme goes through next-themes'
 * setTheme; the locale goes through the i18n context only — never the locale
 * cookie, which would leak the Shell's choice into standalone sessions.
 *
 * No-op outside an iframe: getIframeBridgeClient returns null standalone, so
 * the standalone app keeps its own appearance settings untouched.
 */
export function useEmbedAppearance(): void {
  const { setTheme } = useTheme();
  const { setLocale } = useI18nContext();

  useEffect(() => {
    const client = getIframeBridgeClient();
    if (!client) {
      return;
    }
    // Both subscriptions replay the newest pushed value synchronously, so a
    // Shell that pushed right after the handshake still takes effect here.
    const unsubscribeTheme = client.onThemeChange((theme) => {
      setTheme(theme);
    });
    const unsubscribeLocale = client.onLocaleChange((locale) => {
      setLocale(normalizeLocale(locale));
    });
    return () => {
      unsubscribeTheme();
      unsubscribeLocale();
    };
  }, [setTheme, setLocale]);
}
