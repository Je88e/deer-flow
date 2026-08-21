import { redirect } from "next/navigation";

import { embedHref, isEmbedSearchValue } from "@/components/embed/embed-mode";
import { DEMO_THREAD_IDS } from "@/core/threads/static-demo";
import { env } from "@/env";

interface WorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspacePage({
  searchParams,
}: WorkspacePageProps) {
  if (env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true") {
    return redirect(`/workspace/chats/${DEMO_THREAD_IDS[0]}`);
  }
  const { embed } = await searchParams;
  // The default-chat redirect must carry EMBED mode across it: dropping the
  // parameter would silently re-render the standalone layout inside the
  // Shell iframe and the bridge handshake would never start.
  const target = "/workspace/chats/new";
  return redirect(isEmbedSearchValue(embed) ? embedHref(target) : target);
}
