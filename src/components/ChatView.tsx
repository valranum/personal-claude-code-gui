import { useChat } from "../hooks/useChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

interface ChatViewProps {
  conversationId: string | null;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

export function ChatView({
  conversationId,
  onToggleSidebar,
  sidebarCollapsed,
}: ChatViewProps) {
  const { messages, streaming, sendMessage, abort, retry } =
    useChat(conversationId);

  return (
    <div className="chat-view">
      {sidebarCollapsed && (
        <button
          className="mobile-menu-btn"
          onClick={onToggleSidebar}
          title="Show sidebar (⌘B)"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
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
