import { useChat } from "../hooks/useChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { WorkspaceBar } from "./WorkspaceBar";
import { Conversation } from "../types";

interface ChatViewProps {
  conversationId: string | null;
  conversation: Conversation | null;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  onChangeCwd: (id: string, cwd: string) => void;
  onTitleUpdate: (conversationId: string, title: string) => void;
}

export function ChatView({
  conversationId,
  conversation,
  onToggleSidebar,
  sidebarCollapsed,
  onChangeCwd,
  onTitleUpdate,
}: ChatViewProps) {
  const { messages, streaming, sendMessage, abort, retry } = useChat(
    conversationId,
    (title) => {
      if (conversationId) onTitleUpdate(conversationId, title);
    },
  );

  return (
    <div className="chat-view">
      <WorkspaceBar
        conversation={conversation}
        onChangeCwd={onChangeCwd}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
      />
      <MessageList
        messages={messages}
        streaming={streaming}
        onRetry={retry}
        onSendPrompt={sendMessage}
      />
      <ChatInput
        onSend={sendMessage}
        onAbort={abort}
        isStreaming={streaming.isStreaming}
        disabled={!conversationId}
      />
    </div>
  );
}
