import { EmbedAuthGate } from "@/components/embed/embed-auth-gate";
import { EmbedLayout } from "@/components/embed/embed-layout";
import { isEmbedSearchValue } from "@/components/embed/embed-mode";
import { EmbedModeProvider } from "@/components/embed/embed-mode-provider";
import ChatPage from "@/components/workspace/chats/chat-page";

// Next 16: `searchParams` is a Promise and must be awaited. The workspace
// layout is already `force-dynamic`, so no extra route segment config is
// needed here — awaiting `searchParams` keeps the route dynamic either way.
interface WorkspaceChatPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceChatPage({
  searchParams,
}: WorkspaceChatPageProps) {
  const { embed } = await searchParams;
  const isEmbedded = isEmbedSearchValue(embed);

  if (isEmbedded) {
    return (
      <EmbedModeProvider embedded>
        {/* The gate wraps the whole EMBED shell (thread panel included) so
            the shell's queries only fire once the session cookie from
            token-exchange is in place. */}
        <EmbedAuthGate>
          <EmbedLayout>
            <ChatPage />
          </EmbedLayout>
        </EmbedAuthGate>
      </EmbedModeProvider>
    );
  }

  return (
    <EmbedModeProvider embedded={false}>
      <ChatPage />
    </EmbedModeProvider>
  );
}
