"use client";

import {
  BlocksIcon,
  BotIcon,
  CalendarClock,
  FileTextIcon,
  MessagesSquare,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { embedHref } from "@/components/embed/embed-mode";
import { useIsEmbedRoute } from "@/components/embed/use-is-embed-route";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAgentsApiEnabled } from "@/core/agents";
import { useI18n } from "@/core/i18n/hooks";

export function WorkspaceNavChatList() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { enabled: agentsEnabled } = useAgentsApiEnabled();
  // EMBED (WIT Shell iframe) hides the workspace-only destinations (agents,
  // audits): the Shell owns those flows, and those links never carry the
  // ?embed=true parameter. Scheduled tasks and the capability center stay
  // reachable from the Shell iframe and navigate through embedHref so
  // they never fall out of EMBED mode.
  const isEmbedRoute = useIsEmbedRoute();

  return (
    <SidebarGroup className="pt-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={pathname === "/workspace/chats"} asChild>
            <Link
              className="text-muted-foreground"
              href={
                isEmbedRoute
                  ? embedHref("/workspace/chats")
                  : "/workspace/chats"
              }
            >
              <MessagesSquare />
              <span>{t.sidebar.chats}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {!isEmbedRoute && (
          <>
            <SidebarMenuItem>
              {agentsEnabled ? (
                <SidebarMenuButton
                  isActive={pathname.startsWith("/workspace/agents")}
                  asChild
                >
                  <Link
                    className="text-muted-foreground"
                    href="/workspace/agents"
                  >
                    <BotIcon />
                    <span>{t.sidebar.agents}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                // Disabled: aria-disabled drives the sidebar CVA to suppress
                // pointer events on the button, so wrap it in a hoverable span
                // that still surfaces the "feature not enabled" tooltip for mouse
                // users. The button stays in the tab order (no tabIndex={-1}) and
                // is wired via aria-describedby to a visually-hidden reason, so
                // keyboard and screen-reader users also learn why it is disabled.
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* cursor-not-allowed lives on the span (the element that
                    still receives pointer events), not the inert button. */}
                    <span className="block w-full cursor-not-allowed">
                      <SidebarMenuButton
                        className="text-muted-foreground/50"
                        aria-disabled
                        aria-describedby="agents-disabled-reason"
                      >
                        <BotIcon />
                        <span>{t.sidebar.agents}</span>
                      </SidebarMenuButton>
                      <span id="agents-disabled-reason" className="sr-only">
                        {t.sidebar.agentsDisabledTooltip}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {t.sidebar.agentsDisabledTooltip}
                  </TooltipContent>
                </Tooltip>
              )}
            </SidebarMenuItem>
          </>
        )}
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/scheduled-tasks")}
            asChild
          >
            <Link
              className="text-muted-foreground"
              href={
                isEmbedRoute
                  ? embedHref("/workspace/scheduled-tasks")
                  : "/workspace/scheduled-tasks"
              }
            >
              <CalendarClock />
              <span>{t.sidebar.scheduledTasks}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {/* EMBED (WIT Shell iframe) hides the workspace-only audits
          destination; the Shell owns that flow. */}
        {!isEmbedRoute && (
          <>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname.startsWith("/workspace/audits")}
                asChild
              >
                <Link
                  className="text-muted-foreground"
                  href="/workspace/audits"
                >
                  <FileTextIcon />
                  <span>{t.sidebar.audits}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/capabilities")}
            asChild
          >
            <Link
              className="text-muted-foreground"
              href={
                isEmbedRoute
                  ? embedHref("/workspace/capabilities")
                  : "/workspace/capabilities"
              }
            >
              <BlocksIcon />
              <span>{t.capabilities.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
