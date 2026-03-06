import { useState, useRef, useEffect, KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (content: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export function ChatInput({
  onSend,
  onAbort,
  isStreaming,
  disabled,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [value]);

  // Re-focus input after streaming completes
  useEffect(() => {
    if (!isStreaming && !disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming, disabled]);

  // Global Escape to stop streaming
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && isStreaming) {
        onAbort();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isStreaming, onAbort]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder={
            disabled
              ? "Select or create a conversation..."
              : "Message Claude... (Enter to send, Shift+Enter for newline)"
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          rows={1}
        />
        <div className="chat-input-actions">
          {isStreaming ? (
            <button
              className="chat-btn stop-btn"
              onClick={onAbort}
              title="Stop generating (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/>
              </svg>
            </button>
          ) : (
            <button
              className="chat-btn send-btn"
              onClick={handleSend}
              disabled={!value.trim() || disabled}
              title="Send message (Enter)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="chat-input-hint">
        Enter to send · Shift+Enter for newline · Esc to stop
      </div>
    </div>
  );
}
