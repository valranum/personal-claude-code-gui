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
  const lines = code.split("\n");
  const lineCount = lines.length;
  const preview = lines[0]?.slice(0, 80) || "";

  return (
    <button className="code-card" onClick={onClick} type="button">
      <div className="code-card-header">
        <span className="code-card-lang">{language}</span>
        <span className="code-card-meta">{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
      </div>
      <div className="code-card-preview">
        <code>{preview}{preview.length < (lines[0]?.length ?? 0) ? "..." : ""}</code>
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
      <div className={`message-avatar ${message.role}-avatar`}>
        {message.role === "user" ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M2.5 14C2.5 11.24 4.96 9 8 9C11.04 9 13.5 11.24 13.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="6" cy="8" r="1.25" fill="currentColor"/>
            <circle cx="10" cy="8" r="1.25" fill="currentColor"/>
          </svg>
        )}
      </div>
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
