"use client";

import { useEffect } from "react";

import { isEmbeddedWindow } from "@/core/bridge/iframe-bridge-client";

import { useI18nContext } from "./context";
import { getLocaleFromCookie, setLocaleInCookie } from "./cookies";

import { detectLocale, normalizeLocale, type Locale } from "./index";

export function useI18n() {
  const { locale, setLocale, t } = useI18nContext();

  const changeLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    setLocaleInCookie(newLocale);
  };

  // Initialize locale on mount
  useEffect(() => {
    // Inside the WIT Shell iframe the Shell owns the locale (LOCALE_CHANGE
    // pushes via useEmbedAppearance). Skip the cookie/browser fallback here
    // so it cannot overwrite the pushed value, whichever runs last.
    if (isEmbeddedWindow()) {
      return;
    }

    const saved = getLocaleFromCookie();
    if (saved) {
      const normalizedSaved = normalizeLocale(saved);
      setLocale(normalizedSaved);
      if (saved !== normalizedSaved) {
        setLocaleInCookie(normalizedSaved);
      }
      return;
    }

    const detected = detectLocale();
    setLocale(detected);
    setLocaleInCookie(detected);
  }, [setLocale]);

  return {
    locale,
    t,
    changeLocale,
  };
}
