import ChatPage from "@/components/workspace/chats/chat-page";

export default function WorkspaceChatPage() {
  // WorkspaceContent owns the shared embed context and authentication gate,
  // including sidebar/global consumers and every workspace destination.
  return <ChatPage />;
}
