import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage, StreamingState } from "../types";
import { MessageBubble } from "./MessageBubble";
import { StreamingIndicator } from "./StreamingIndicator";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { apiFetch } from "../utils/api";
import littleDude from "../assets/little-dude.png";

interface MessageListProps {
  messages: ChatMessage[];
  streaming: StreamingState;
  conversationId: string | null;
  onRetry: () => void;
  onSendPrompt: (content: string) => void;
  onToast?: (message: string, type?: "info" | "error") => void;
  onOpenArtifact?: (language: string, code: string) => void;
  onEditMessage?: (messageId: string) => void;
  renderInput?: () => React.ReactNode;
  chatOnly?: boolean;
}

const CODE_PROMPTS = [
  { label: "Summarize this project", prompt: "Read the project structure and give me a concise summary of what this codebase does." },
  { label: "Find TODOs", prompt: "Search the codebase for all TODO and FIXME comments and list them." },
  { label: "Explain a file", prompt: "What are the main files in this project? Give me a brief overview of each." },
  { label: "Suggest a new feature", prompt: "Analyze this project and suggest useful features or improvements that could be added." },
  { label: "Create a design brief", prompt: "Help me create a structured design brief for a new feature. Ask me about the goal, audience, constraints, and deliverables, then generate a formatted brief document." },
  { label: "Audit accessibility", prompt: "Scan this project for accessibility issues — missing alt text, color contrast problems, keyboard navigation gaps, and ARIA attributes. Give me a prioritized list of fixes." },
];

const CHAT_PROMPTS = [
  { label: "Explain something", prompt: "Can you explain a concept to me in simple terms? I'll tell you what I'm curious about." },
  { label: "Help me write", prompt: "I need help writing something. Can you help me draft, edit, or brainstorm ideas?" },
  { label: "Pros and cons", prompt: "I'm trying to make a decision. Can you help me think through the pros and cons?" },
  { label: "Learn something new", prompt: "Teach me something interesting I probably don't know. Surprise me!" },
  { label: "Draft an email", prompt: "Help me write a professional email. I'll give you the context and who it's for, and you draft it for me." },
  { label: "Summarize a document", prompt: "I have a long document I need summarized. I'll paste or describe the content, and you condense it into the key points." },
];

export function MessageList({ messages, streaming, conversationId, onRetry, onSendPrompt, onToast, onOpenArtifact, onEditMessage, renderInput, chatOnly }: MessageListProps) {
  const scrollRef = useAutoScroll([messages, streaming]);
  const [sharing, setSharing] = useState(false);

  const showActions =
    !streaming.isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant";

  const handleShare = async () => {
    if (!conversationId || sharing) return;
    setSharing(true);
    try {
      const res = await apiFetch(`/api/conversations/${conversationId}/share`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await navigator.clipboard.writeText(data.url);
      onToast?.("Share link copied to clipboard!", "info");
    } catch {
      onToast?.("Failed to create share link", "error");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="message-list" ref={scrollRef}>
      {messages.length === 0 && !streaming.isStreaming && (
        <div className="empty-state">
          <img src={littleDude} alt="Claude" className="empty-logo-img" />
          <h2>Claude Code</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: -10, fontSize: 14 }}>(for designers)</p>
          {renderInput && <div className="empty-state-input">{renderInput()}</div>}
          <div className="empty-state-prompts">
            {(chatOnly ? CHAT_PROMPTS : CODE_PROMPTS).map((sp) => (
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
        <MessageBubble key={msg.id} message={msg} onOpenArtifact={onOpenArtifact} onEdit={onEditMessage} />
      ))}
      {streaming.isStreaming && (
        <div className="message-bubble assistant streaming msg-enter">
          <div className="message-body">
            {streaming.text && (
              <div className="message-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streaming.text}
                </ReactMarkdown>
              </div>
            )}
            <StreamingIndicator toolCalls={streaming.toolCalls} subagents={streaming.subagents} />
          </div>
        </div>
      )}
      {showActions && (
        <div className="retry-container">
          <button className="retry-btn" onClick={onRetry} title="Regenerate response">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 8C2 4.69 4.69 2 8 2C10.22 2 12.16 3.21 13.2 5M14 8C14 11.31 11.31 14 8 14C5.78 14 3.84 12.79 2.8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M10 5H13.5V1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6 11H2.5V14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Retry
          </button>
          <button className="retry-btn share-btn" onClick={handleShare} disabled={sharing} title="Share conversation">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="12" cy="3" r="2" stroke="currentColor" strokeWidth="1.4"/>
              <circle cx="12" cy="13" r="2" stroke="currentColor" strokeWidth="1.4"/>
              <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5.8 6.9L10.2 4.1M5.8 9.1L10.2 11.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {sharing ? "Sharing..." : "Share"}
          </button>
        </div>
      )}
    </div>
  );
}
