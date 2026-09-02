import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import WorkspaceChatPage from "@/app/workspace/chats/[thread_id]/page";
import { useEmbedMode } from "@/components/embed/embed-mode-provider";

// ChatPage pulls in the whole chat stack (streams, queries, settings). For
// the embed branch decision we only need to know what wraps it, so replace
// it with a probe that reports the embed context it renders under. The probe
// component is injected via globalThis so the hoisted mock factory stays
// free of outer references.
rs.mock("@/components/workspace/chats/chat-page", () => ({
  default: function ChatPageProbeSlot() {
    const probe = (globalThis as { __chatPageProbe?: () => ReactNode })
      .__chatPageProbe;
    const Probe = probe ?? (() => <div data-testid="chat-page-probe" />);
    return <Probe />;
  },
}));

// The EMBED branch wraps the chat in EmbedAuthGate (bridge handshake +
// token-exchange). Its i18n/bridge requirements do not belong in this
// branch-decision suite, so stub it as a pass-through.
rs.mock("@/components/embed/embed-auth-gate", () => ({
  EmbedAuthGate: ({ children }: { children: ReactNode }) => (
    <div data-testid="embed-auth-gate">{children}</div>
  ),
}));

afterEach(() => {
  delete (globalThis as { __chatPageProbe?: () => ReactNode }).__chatPageProbe;
  cleanup();
});

function installEmbedProbe() {
  // Reports the embed context the mocked ChatPage renders under.
  (globalThis as { __chatPageProbe?: () => ReactNode }).__chatPageProbe =
    function EmbedProbe(): ReactElement {
      const { embedded } = useEmbedMode();
      return <div data-testid="chat-page-probe">{`embedded=${embedded}`}</div>;
    };
}

async function renderPage(
  searchParams: Record<string, string | string[] | undefined>,
) {
  installEmbedProbe();
  const element = await WorkspaceChatPage({
    searchParams: Promise.resolve(searchParams),
  });
  return render(element);
}

describe("workspace chat page embed branch", () => {
  it("keeps the original rendering path when embed is absent", async () => {
    await renderPage({});
    expect(screen.getByTestId("chat-page-probe").textContent).toBe(
      "embedded=false",
    );
    expect(screen.queryByTestId("embed-auth-gate")).toBeNull();
  });

  it("does not enter embed mode for other embed values", async () => {
    await renderPage({ embed: "1" });
    expect(screen.getByTestId("chat-page-probe").textContent).toBe(
      "embedded=false",
    );
    expect(screen.queryByTestId("embed-auth-gate")).toBeNull();
  });

  it("wraps chat in the embed context and auth gate when ?embed=true", async () => {
    await renderPage({ embed: "true" });
    expect(screen.getByTestId("chat-page-probe").textContent).toBe(
      "embedded=true",
    );
    // EMBED renders the standard layout (no dedicated embed shell anymore):
    // the gate is the only wrapper, and it carries the chat page inside.
    const gate = screen.getByTestId("embed-auth-gate");
    expect(gate.contains(screen.getByTestId("chat-page-probe"))).toBe(true);
  });
});
