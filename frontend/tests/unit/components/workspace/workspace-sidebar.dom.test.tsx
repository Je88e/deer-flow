import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// The render decision only needs the sidebar context and the slot
// components — not the real shadcn sidebar tree (toolbars, sheets, media
// queries) or the nav children's data dependencies. Stub them out.
rs.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ open: true }),
  Sidebar: ({ children }: { children?: ReactNode }) => (
    <div data-testid="sidebar-shell">{children}</div>
  ),
  SidebarHeader: ({ children }: { children?: ReactNode }) => (
    <div data-testid="sidebar-header">{children}</div>
  ),
  SidebarContent: ({ children }: { children?: ReactNode }) => (
    <div data-testid="sidebar-content">{children}</div>
  ),
  SidebarFooter: ({ children }: { children?: ReactNode }) => (
    <div data-testid="sidebar-footer">{children}</div>
  ),
  SidebarRail: () => null,
}));

rs.mock("@/components/workspace/channels/workspace-channels-list", () => ({
  WorkspaceChannelsList: () => <div>channels</div>,
}));

rs.mock("@/components/workspace/recent-chat-list", () => ({
  RecentChatList: () => <div>recent chats</div>,
}));

rs.mock("@/components/workspace/workspace-header", () => ({
  WorkspaceHeader: () => <div>header</div>,
}));

rs.mock("@/components/workspace/workspace-nav-chat-list", () => ({
  WorkspaceNavChatList: () => <div>nav chats</div>,
}));

rs.mock("@/components/workspace/workspace-nav-menu", () => ({
  WorkspaceNavMenu: () => <div>nav menu</div>,
}));

import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";

afterEach(cleanup);

describe("WorkspaceSidebar render mode", () => {
  it("renders the sidebar on standalone routes", () => {
    render(<WorkspaceSidebar />);
    expect(screen.getByTestId("sidebar-shell")).not.toBeNull();
  });
});
