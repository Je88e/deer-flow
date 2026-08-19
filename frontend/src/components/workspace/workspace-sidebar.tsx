"use client";

import { useSearchParams } from "next/navigation";

import {
  EMBED_SEARCH_PARAM,
  isEmbedSearchValue,
} from "@/components/embed/embed-mode";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

import { WorkspaceChannelsList } from "./channels/workspace-channels-list";
import { RecentChatList } from "./recent-chat-list";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceNavChatList } from "./workspace-nav-chat-list";
import { WorkspaceNavMenu } from "./workspace-nav-menu";

export function WorkspaceSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const searchParams = useSearchParams();
  const { open: isSidebarOpen } = useSidebar();

  // The workspace layout renders this sidebar above the page, so it cannot
  // consume the page-scoped EmbedModeProvider context. Derive EMBED mode
  // from the same URL parameter instead: under ?embed=true the WIT Shell
  // provides top-level navigation and this sidebar stays hidden.
  if (isEmbedSearchValue(searchParams.get(EMBED_SEARCH_PARAM))) {
    return null;
  }

  return (
    <>
      <Sidebar variant="sidebar" collapsible="icon" {...props}>
        <SidebarHeader className="py-0">
          <WorkspaceHeader />
        </SidebarHeader>
        <SidebarContent>
          <WorkspaceNavChatList />
          <WorkspaceChannelsList />
          {isSidebarOpen && <RecentChatList />}
        </SidebarContent>
        <SidebarFooter>
          <WorkspaceNavMenu />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </>
  );
}
