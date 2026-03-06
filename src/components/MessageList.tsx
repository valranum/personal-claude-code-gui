import { ChatMessage, StreamingState } from "../types";
import { MessageBubble } from "./MessageBubble";
import { ToolCallBlock } from "./ToolCallBlock";
import { StreamingIndicator } from "./StreamingIndicator";
import { useAutoScroll } from "../hooks/useAutoScroll";
import littleDude from "../assets/little-dude.png";

interface MessageListProps {
  messages: ChatMessage[];
  streaming: StreamingState;
  onRetry: () => void;
  onSendPrompt: (content: string) => void;
}

const SUGGESTED_PROMPTS = [
  { label: "Summarize this project", prompt: "Read the project structure and give me a concise summary of what this codebase does." },
  { label: "Find TODOs", prompt: "Search the codebase for all TODO and FIXME comments and list them." },
  { label: "Check my code for bugs", prompt: "Review the codebase for potential bugs, edge cases, or issues and report what you find." },
  { label: "Suggest a new feature", prompt: "Analyze this project and suggest useful features or improvements that could be added." },
];

export function MessageList({ messages, streaming, onRetry, onSendPrompt }: MessageListProps) {
  const scrollRef = useAutoScroll([messages, streaming]);

  const showRetry =
    !streaming.isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant";

  return (
    <div className="message-list" ref={scrollRef}>
      {messages.length === 0 && !streaming.isStreaming && (
        <div className="empty-state">
          <img src={littleDude} alt="Claude" className="empty-logo-img" />
          <h2>Claude Code</h2>
          <p>What would you like to work on?</p>
          <div className="suggested-prompts">
            {SUGGESTED_PROMPTS.map((sp) => (
              <button
                key={sp.label}
                className="suggested-prompt-btn"
                onClick={() => onSendPrompt(sp.prompt)}
              >
                {sp.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {streaming.isStreaming && (
        <div className="message-bubble assistant streaming msg-enter">
          <div className="message-avatar assistant-avatar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="6" cy="8" r="1.25" fill="currentColor"/>
              <circle cx="10" cy="8" r="1.25" fill="currentColor"/>
            </svg>
          </div>
          <div className="message-body">
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
            ) : streaming.toolCalls.length === 0 ? (
              <StreamingIndicator />
            ) : null}
          </div>
        </div>
      )}
      {showRetry && (
        <div className="retry-container">
          <button className="retry-btn" onClick={onRetry} title="Regenerate response">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 8C2 4.69 4.69 2 8 2C10.22 2 12.16 3.21 13.2 5M14 8C14 11.31 11.31 14 8 14C5.78 14 3.84 12.79 2.8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M10 5H13.5V1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6 11H2.5V14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
