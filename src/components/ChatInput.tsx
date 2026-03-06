import { useState, useRef, useEffect, useCallback, KeyboardEvent, DragEvent } from "react";
import { ImageAttachment } from "../types";

interface ChatInputProps {
  onSend: (content: string, images?: ImageAttachment[]) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

function readFileAsBase64(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve({
        data: base64,
        mediaType: file.type || "image/png",
        name: file.name,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const SLASH_COMMANDS = [
  { command: "/clear", description: "Clear conversation history and reset context" },
  { command: "/compact", description: "Summarize and compact the conversation" },
  { command: "/usage", description: "Usage for this chat, or /usage week · month · 14" },
];

export function ChatInput({
  onSend,
  onAbort,
  isStreaming,
  disabled,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashActiveIdx, setSlashActiveIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [value]);

  useEffect(() => {
    if (!isStreaming && !disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming, disabled]);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && isStreaming) {
        onAbort();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isStreaming, onAbort]);

  const filteredCommands = value.startsWith("/")
    ? SLASH_COMMANDS.filter((c) =>
        c.command.toLowerCase().startsWith(value.toLowerCase()),
      )
    : [];

  useEffect(() => {
    const shouldShow = value.startsWith("/") && filteredCommands.length > 0 && !value.includes(" ");
    setShowSlashMenu(shouldShow);
    if (shouldShow) setSlashActiveIdx(0);
  }, [value, filteredCommands.length]);

  const selectSlashCommand = useCallback(
    (cmd: string) => {
      onSend(cmd);
      setValue("");
      setShowSlashMenu(false);
    },
    [onSend],
  );

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) =>
      ACCEPTED_TYPES.includes(f.type),
    );
    if (validFiles.length === 0) return;
    const attachments = await Promise.all(validFiles.map(readFileAsBase64));
    setImages((prev) => [...prev, ...attachments]);
  }, []);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (showSlashMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashActiveIdx((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashActiveIdx(
          (i) => (i - 1 + filteredCommands.length) % filteredCommands.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredCommands[slashActiveIdx]) {
          selectSlashCommand(filteredCommands[slashActiveIdx].command);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if ((!trimmed && images.length === 0) || disabled) return;
    onSend(trimmed || "(image)", images.length > 0 ? images : undefined);
    setValue("");
    setImages([]);
    setShowSlashMenu(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await addFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        await addFiles(imageFiles);
      }
    },
    [addFiles],
  );

  return (
    <div className="chat-input-container">
      <div
        className={`chat-input-wrapper ${dragOver ? "drag-over" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {showSlashMenu && (
          <div className="slash-menu" ref={slashMenuRef}>
            {filteredCommands.map((cmd, i) => (
              <div
                key={cmd.command}
                className={`slash-menu-item ${i === slashActiveIdx ? "active" : ""}`}
                onMouseEnter={() => setSlashActiveIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSlashCommand(cmd.command);
                }}
              >
                <span className="slash-menu-command">{cmd.command}</span>
                <span className="slash-menu-desc">{cmd.description}</span>
              </div>
            ))}
          </div>
        )}
        {images.length > 0 && (
          <div className="image-preview-row">
            {images.map((img, i) => (
              <div key={i} className="image-preview-item">
                <img
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name}
                  className="image-preview-thumb"
                />
                <button
                  className="image-preview-remove"
                  onClick={() => removeImage(i)}
                  title="Remove image"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder={
            disabled
              ? "Select or create a conversation..."
              : "Message Claude..."
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || isStreaming}
          rows={1}
        />
        <div className="chat-input-actions">
          <button
            className="chat-btn attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming}
            title="Attach image"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
              <circle cx="5.5" cy="5.5" r="1.25" fill="currentColor"/>
              <path d="M2 11L5.5 7.5L8 10L10.5 7L14 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
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
              disabled={(!value.trim() && images.length === 0) || disabled}
              title="Send message (Enter)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
