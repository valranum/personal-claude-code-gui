import { useChat } from "../hooks/useChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

interface ChatViewProps {
  conversationId: string | null;
}

export function ChatView({ conversationId }: ChatViewProps) {
  const { messages, streaming, sendMessage, abort } =
    useChat(conversationId);

  return (
    <div className="chat-view">
      <MessageList messages={messages} streaming={streaming} />
      <ChatInput
        onSend={sendMessage}
        onAbort={abort}
        isStreaming={streaming.isStreaming}
        disabled={!conversationId}
      />
    </div>
  );
}
