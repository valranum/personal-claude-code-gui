import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "../types";
import { CodeBlock } from "./CodeBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { formatTimestamp } from "../utils/time";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          <button
            className={`message-copy-btn ${copied ? "copied" : ""}`}
            onClick={handleCopy}
            title="Copy message"
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 5V3.5C11 2.67 10.33 2 9.5 2H3.5C2.67 2 2 2.67 2 3.5V9.5C2 10.33 2.67 11 3.5 11H5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            )}
          </button>
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
                  return (
                    <CodeBlock language={match[1]}>
                      {String(children).replace(/\n$/, "")}
                    </CodeBlock>
                  );
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
