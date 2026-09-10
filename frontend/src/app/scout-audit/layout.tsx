import { QueryClientProvider } from "@/components/query-client-provider";
import { I18nProvider } from "@/core/i18n/context";
import { detectLocaleServer } from "@/core/i18n/server";

import { ScoutAuditLayoutInner } from "./scout-audit-layout-inner";

export const dynamic = "force-dynamic";

export default async function ScoutAuditLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await detectLocaleServer();

  return (
    <I18nProvider initialLocale={locale}>
      <QueryClientProvider>
        <ScoutAuditLayoutInner>{children}</ScoutAuditLayoutInner>
      </QueryClientProvider>
    </I18nProvider>
  );
}
