"use client";

import { MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { embedHref } from "@/components/embed/embed-mode";
import { useIsEmbedRoute } from "@/components/embed/use-is-embed-route";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useI18n } from "@/core/i18n/hooks";
import { env } from "@/env";
import { cn } from "@/lib/utils";

import { useWorkspaceSidebarExpanded } from "./workspace-sidebar-frame";
import { WorkspaceSidebarTrigger } from "./workspace-sidebar-trigger";

export function WorkspaceHeader({ className }: { className?: string }) {
  const { t } = useI18n();
  const isSidebarOpen = useWorkspaceSidebarExpanded();
  const pathname = usePathname();
  const isEmbedRoute = useIsEmbedRoute();
  return (
    <>
      <div
        className={cn(
          "group/workspace-header flex h-12 flex-col justify-center",
          className,
        )}
      >
        {!isSidebarOpen ? (
          <div className="group-has-data-[collapsible=icon]/sidebar-wrapper:-translate-y flex w-full cursor-pointer items-center justify-center">
            {/* WitAI (EMBED shell) hides the serif wordmark; with nothing to
                swap against, the trigger stays visible without header hover. */}
            <WorkspaceSidebarTrigger className="pl-2" />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" ? (
              <Link href="/" className="text-primary ml-2 font-serif">
                WitAI
              </Link>
            ) : (
              <div className="text-primary ml-2 cursor-default font-serif">
                WitAI
              </div>
            )}
            <WorkspaceSidebarTrigger />
          </div>
        )}
      </div>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname === "/workspace/chats/new"}
            asChild
          >
            <Link
              className="text-muted-foreground"
              href={
                isEmbedRoute
                  ? embedHref("/workspace/chats/new")
                  : "/workspace/chats/new"
              }
            >
              <MessageSquarePlus size={16} />
              <span>{t.sidebar.newChat}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}
