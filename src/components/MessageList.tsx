import { ChatMessage, StreamingState } from "../types";
import { MessageBubble } from "./MessageBubble";
import { ToolCallBlock } from "./ToolCallBlock";
import { StreamingIndicator } from "./StreamingIndicator";
import { useAutoScroll } from "../hooks/useAutoScroll";

interface MessageListProps {
  messages: ChatMessage[];
  streaming: StreamingState;
}

export function MessageList({ messages, streaming }: MessageListProps) {
  const scrollRef = useAutoScroll([messages, streaming]);

  return (
    <div className="message-list" ref={scrollRef}>
      {messages.length === 0 && !streaming.isStreaming && (
        <div className="empty-state">
          <div className="empty-icon">&#9678;</div>
          <h2>Claude Code</h2>
          <p>Send a message to start coding with Claude.</p>
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {streaming.isStreaming && (
        <div className="message-bubble assistant streaming">
          <div className="message-role">Claude</div>
          {streaming.toolCalls.length > 0 && (
            <div className="message-tools">
              {streaming.toolCalls.map((tc) => (
                <ToolCallBlock key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}
          {streaming.text ? (
            <div className="message-content">
              <p>{streaming.text}</p>
            </div>
          ) : (
            <StreamingIndicator />
          )}
        </div>
      )}
    </div>
  );
}
