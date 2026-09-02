import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";
import { act, cleanup, render } from "@testing-library/react";

import { EmbedAppearanceSync } from "@/components/embed/embed-appearance-sync";
import {
  getIframeBridgeClient,
  resetIframeBridgeClient,
} from "@/core/bridge/iframe-bridge-client";
import { I18nProvider } from "@/core/i18n/context";
import { useI18n } from "@/core/i18n/hooks";

// next-themes' real provider needs a working Storage; the happy-dom test
// environment ships a plain-object localStorage. Mocking the hook also keeps
// these tests about our wiring (bridge push -> setTheme), not next-themes.
const setThemeSpy = rs.fn();
rs.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: setThemeSpy }),
}));

// The bundler inlines NEXT_PUBLIC_* at build time, so a runtime env override
// would never reach the client — pin the Shell origin to the actual window
// origin the singleton resolves as its fallback.
const SHELL_ORIGIN = window.location.origin;

function frameWindow(): void {
  const framedParent = { postMessage: rs.fn() };
  const w = window as unknown as { top: unknown; parent: unknown };
  w.top = { tag: "shell-top" };
  w.parent = framedParent;
}

function unframeWindow(): void {
  const w = window as unknown as { top: unknown; parent: unknown };
  w.top = window;
  w.parent = window;
}

function dispatchMessage(origin: string, data: unknown): void {
  window.dispatchEvent(
    new MessageEvent("message", { origin, data, source: window }),
  );
}

function pushTheme(theme: "light" | "dark"): void {
  dispatchMessage(SHELL_ORIGIN, {
    version: "1.0",
    type: "THEME_CHANGE",
    payload: { theme },
  });
}

function pushLocale(locale: "en" | "zh"): void {
  // The locale handler updates React state (the theme handler only calls a
  // spy), so the push must run inside act for the re-render to flush.
  act(() => {
    dispatchMessage(SHELL_ORIGIN, {
      version: "1.0",
      type: "LOCALE_CHANGE",
      payload: { locale },
    });
  });
}

function renderSync(): ReturnType<typeof render> {
  return render(
    <I18nProvider initialLocale="en-US">
      <EmbedAppearanceSync />
    </I18nProvider>,
  );
}

beforeEach(() => {
  document.documentElement.lang = "";
  document.cookie = "locale=; max-age=0";
  setThemeSpy.mockReset();
  frameWindow();
});

afterEach(() => {
  cleanup();
  resetIframeBridgeClient();
  unframeWindow();
});

describe("EmbedAppearanceSync", () => {
  test("applies Shell-pushed theme and locale", () => {
    renderSync();

    pushTheme("dark");
    expect(setThemeSpy).toHaveBeenCalledWith("dark");
    expect(setThemeSpy).toHaveBeenCalledTimes(1);

    pushLocale("zh");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  test("maps the pushed short locale to the full locale", () => {
    renderSync();

    pushLocale("zh");
    expect(document.documentElement.lang).toBe("zh-CN");

    pushLocale("en");
    expect(document.documentElement.lang).toBe("en-US");
  });

  test("follows later pushes", () => {
    renderSync();

    pushTheme("dark");
    pushTheme("light");
    expect(setThemeSpy).toHaveBeenLastCalledWith("light");
  });

  test("replays values pushed before the tree subscribed", () => {
    // Force the singleton bridge to exist and listen, then push — as the
    // Shell does right after the handshake, possibly before React mounts.
    getIframeBridgeClient();
    pushTheme("dark");
    pushLocale("zh");

    renderSync();
    expect(setThemeSpy).toHaveBeenCalledWith("dark");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  test("standalone mode keeps its own appearance settings", () => {
    unframeWindow();
    renderSync();

    // Even if a message somehow arrives, no bridge client exists to parse it:
    // the I18nProvider effect keeps the initial locale, and setTheme stays
    // untouched.
    pushTheme("dark");
    pushLocale("zh");

    expect(setThemeSpy).not.toHaveBeenCalled();
    expect(document.documentElement.lang).toBe("en-US");
  });
});

describe("useI18n initialization inside the Shell iframe", () => {
  function LocaleProbe() {
    const { locale } = useI18n();
    return <span data-testid="locale-probe">{locale}</span>;
  }

  function renderProbe(): ReturnType<typeof render> {
    return render(
      <I18nProvider initialLocale="en-US">
        <LocaleProbe />
      </I18nProvider>,
    );
  }

  test("skips browser detection when embedded so pushes are not overwritten", async () => {
    // navigator.language is a prototype getter in happy-dom — spy there.
    const languageSpy = rs
      .spyOn(Navigator.prototype, "language", "get")
      .mockReturnValue("zh-CN");

    try {
      const { getByTestId } = renderProbe();
      // The Shell owns the locale here: the browser-language fallback must
      // not run and clobber a (replayed or upcoming) LOCALE_CHANGE value.
      expect(getByTestId("locale-probe").textContent).toBe("en-US");
      expect(document.cookie).not.toContain("locale=");
    } finally {
      languageSpy.mockRestore();
    }
  });

  test("still detects the browser language standalone", async () => {
    unframeWindow();
    const languageSpy = rs
      .spyOn(Navigator.prototype, "language", "get")
      .mockReturnValue("zh-CN");

    try {
      const { getByTestId } = renderProbe();
      expect(getByTestId("locale-probe").textContent).toBe("zh-CN");
    } finally {
      languageSpy.mockRestore();
    }
  });
});
