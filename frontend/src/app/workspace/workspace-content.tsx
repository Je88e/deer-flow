import { cookies } from "next/headers";
import { Toaster } from "sonner";

import { EmbedAppearanceSync } from "@/components/embed/embed-appearance-sync";
import { EmbedWorkspaceBoundary } from "@/components/embed/embed-workspace-boundary";
import { QueryClientProvider } from "@/components/query-client-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/workspace/command-palette";
import { GatewayOfflineBanner } from "@/components/workspace/gateway-offline-banner";
import { ModelLoadErrorBanner } from "@/components/workspace/model-load-error-banner";
import { SettingsDialogHost } from "@/components/workspace/settings";
import { WorkspaceSettingsDeepLink } from "@/components/workspace/workspace-settings-deep-link";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { ExtensionPageBootstrap } from "@/core/extensions/hooks";
import { UserPreferencesBoundary } from "@/core/settings/user-preferences-boundary";

function parseSidebarOpenCookie(
  value: string | undefined,
): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function WorkspaceContent({
  children,
  gatewayUnavailable = false,
}: Readonly<{
  children: React.ReactNode;
  gatewayUnavailable?: boolean;
}>) {
  const cookieStore = await cookies();
  const initialSidebarOpen =
    parseSidebarOpenCookie(cookieStore.get("sidebar_state")?.value) ?? false;

  return (
    <QueryClientProvider>
      {/* EMBED: apply Shell-pushed theme/locale; renders null standalone.
          Stays outside UserPreferencesBoundary — it reads next-themes and the
          i18n context only, and must not unmount when the boundary suspends
          on an account switch. */}
      <EmbedAppearanceSync />
      <EmbedWorkspaceBoundary>
        <UserPreferencesBoundary>
          <ExtensionPageBootstrap />
          <SidebarProvider
            className="h-screen"
            defaultOpen={initialSidebarOpen}
          >
            <WorkspaceSidebar />
            <SidebarInset className="min-w-0">
              <GatewayOfflineBanner gatewayUnavailable={gatewayUnavailable} />
              <ModelLoadErrorBanner gatewayUnavailable={gatewayUnavailable} />
              {children}
            </SidebarInset>
          </SidebarProvider>
          <CommandPalette />
          <SettingsDialogHost />
          <WorkspaceSettingsDeepLink />
          <Toaster position="top-center" />
        </UserPreferencesBoundary>
      </EmbedWorkspaceBoundary>
    </QueryClientProvider>
  );
}
