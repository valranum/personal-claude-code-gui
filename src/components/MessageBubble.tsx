import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "../types";
import { ToolCallBlock } from "./ToolCallBlock";
import { formatTimestamp } from "../utils/time";

interface MessageBubbleProps {
  message: ChatMessage;
  onOpenArtifact?: (language: string, code: string) => void;
}

function CodeCard({
  language,
  code,
  onClick,
}: {
  language: string;
  code: string;
  onClick: () => void;
}) {
  const lineCount = code.split("\n").length;

  return (
    <button className="code-card" onClick={onClick} type="button">
      <div className="code-card-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M14 2V8H20" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M9 15L12 18L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 11L7 13L9 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M15 11L17 13L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="code-card-info">
        <span className="code-card-title">{language} code</span>
        <span className="code-card-meta">{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
      </div>
      <div className="code-card-open">
        <span>Open</span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </button>
  );
}

export function MessageBubble({ message, onOpenArtifact }: MessageBubbleProps) {
  if (message.role === "system") {
    return (
      <div className="message-bubble system msg-enter">
        <div className="system-message-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className={`message-bubble ${message.role} msg-enter`}>
      {message.role === "user" && (
        <div className="message-avatar user-avatar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M2.5 14C2.5 11.24 4.96 9 8 9C11.04 9 13.5 11.24 13.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      )}
      <div className="message-body">
        <div className="message-header">
          <span className="message-role">
            {message.role === "user" ? "You" : "Claude"}
          </span>
          <span className="message-time">{formatTimestamp(message.timestamp)}</span>
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="message-tools">
            {message.toolCalls.map((tc) => (
              <ToolCallBlock key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        <div className="message-content">
          {message.role === "user" && message.images && message.images.length > 0 && (
            <div className="message-images">
              {message.images.map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name}
                  className="message-image"
                />
              ))}
            </div>
          )}
          {message.role === "assistant" ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match;
                  if (isInline) {
                    return (
                      <code className="inline-code" {...props}>
                        {children}
                      </code>
                    );
                  }
                  const codeStr = String(children).replace(/\n$/, "");
                  const lang = match[1];
                  if (onOpenArtifact) {
                    return (
                      <CodeCard
                        language={lang}
                        code={codeStr}
                        onClick={() => onOpenArtifact(lang, codeStr)}
                      />
                    );
                  }
                  return <pre><code className={className} {...props}>{children}</code></pre>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <p>{message.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}
