import { afterEach, beforeEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// The menu decision needs the embed URL parameter, the route, the agents
// flag, i18n strings, and plain sidebar slots — not the real shadcn sidebar
// tree or tooltip portal behavior. Stub all of them; useIsEmbedRoute runs
// for real on top of the mocked useSearchParams.
rs.mock("next/navigation", () => ({
  usePathname: () =>
    (globalThis as { __navPathname?: string }).__navPathname ??
    "/workspace/chats",
  useSearchParams: () => ({
    get: (name: string) =>
      name === "embed"
        ? ((globalThis as { __embedParam?: string | null }).__embedParam ??
          null)
        : null,
  }),
}));

rs.mock("@/components/ui/sidebar", () => ({
  SidebarGroup: ({ children }: { children?: ReactNode }) => (
    <div data-testid="nav-group">{children}</div>
  ),
  SidebarMenu: ({ children }: { children?: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuButton: ({
    children,
    isActive,
  }: {
    children?: ReactNode;
    isActive?: boolean;
  }) => <li data-active={isActive ? "true" : undefined}>{children}</li>,
  SidebarMenuItem: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

rs.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

rs.mock("@/core/agents", () => ({
  useAgentsApiEnabled: () => ({ enabled: true }),
}));

rs.mock("@/core/i18n/hooks", () => ({
  useI18n: () => ({
    t: {
      sidebar: {
        chats: "Chats",
        agents: "Agents",
        scheduledTasks: "Scheduled Tasks",
        audits: "Audits",
        agentsDisabledTooltip: "Agents API is disabled",
      },
    },
  }),
}));

import { WorkspaceNavChatList } from "@/components/workspace/workspace-nav-chat-list";

type ParamHolder = {
  __embedParam?: string | null;
  __navPathname?: string;
};

beforeEach(() => {
  (globalThis as ParamHolder).__embedParam = null;
  (globalThis as ParamHolder).__navPathname = "/workspace/chats";
});

afterEach(cleanup);

function setEmbedParam(value: string | null) {
  (globalThis as ParamHolder).__embedParam = value;
}

function linkDestination(label: string): string {
  const link = screen.getByText(label).closest("a");
  if (!(link instanceof HTMLAnchorElement)) {
    throw new Error(`Expected an anchor wrapping "${label}"`);
  }
  return link.getAttribute("href") ?? "";
}

describe("WorkspaceNavChatList embed mode", () => {
  it("renders all four nav entries on standalone routes", () => {
    render(<WorkspaceNavChatList />);
    for (const label of ["Chats", "Agents", "Scheduled Tasks", "Audits"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
    expect(linkDestination("Chats")).toBe("/workspace/chats");
  });

  it("hides agents, scheduled tasks, and audits when ?embed=true", () => {
    setEmbedParam("true");
    render(<WorkspaceNavChatList />);
    expect(screen.getByText("Chats")).not.toBeNull();
    for (const label of ["Agents", "Scheduled Tasks", "Audits"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("keeps the embed parameter on the chats link when embedded", () => {
    setEmbedParam("true");
    render(<WorkspaceNavChatList />);
    expect(linkDestination("Chats")).toBe("/workspace/chats?embed=true");
  });

  it("renders the full menu for non-true embed values", () => {
    setEmbedParam("1");
    render(<WorkspaceNavChatList />);
    expect(screen.getByText("Agents")).not.toBeNull();
    expect(linkDestination("Chats")).toBe("/workspace/chats");
  });
});
