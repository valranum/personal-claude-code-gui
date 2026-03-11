import { useState, useRef, useEffect, useCallback, KeyboardEvent, DragEvent } from "react";
import { ImageAttachment, TokenUsage } from "../types";
import { Tooltip } from "./Tooltip";
import { apiFetch } from "../utils/api";

interface ModelOption {
  id: string;
  name: string;
}

interface ChatInputProps {
  onSend: (content: string, images?: ImageAttachment[]) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled: boolean;
  placeholder?: string;
  models?: ModelOption[];
  currentModel?: string;
  onChangeModel?: (modelId: string) => void;
  tokenUsage?: TokenUsage;
  contextTokens?: number;
  cwd?: string;
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
  { command: "/agents", description: "List available subagents for this workspace" },
  { command: "/clear", description: "Clear conversation history and reset context" },
  { command: "/compact", description: "Summarize and compact the conversation" },
  { command: "/context", description: "Show context window usage breakdown" },
  { command: "/cost", description: "Show session cost and token summary" },
  { command: "/diff", description: "Show uncommitted git changes" },
  { command: "/export", description: "Export conversation as markdown or /export json" },
  { command: "/review", description: "Ask Claude to review uncommitted changes" },
  { command: "/status", description: "Show model, workspace, and session info" },
  { command: "/usage", description: "Usage for this chat, or /usage week · month · 14" },
];

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatCostBadge(cost: number): string {
  if (cost < 0.005) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

const CONTEXT_WINDOW = 200_000;

function ContextRing({ tokens }: { tokens: number }) {
  const pct = Math.min(tokens / CONTEXT_WINDOW, 1);
  const display = `${(pct * 100).toFixed(1)}%`;
  const used = formatTokenCount(tokens);
  const total = formatTokenCount(CONTEXT_WINDOW);
  const tooltipText = `${display} · ${used} / ${total} context used`;

  const size = 13;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  let ringColor = "rgba(180, 180, 190, 0.9)";
  if (pct >= 0.9) ringColor = "#ef4444";
  else if (pct >= 0.7) ringColor = "#f59e0b";

  return (
    <Tooltip text={tooltipText}>
      <div className="context-ring" aria-label={tooltipText}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth={stroke}
          />
          {pct > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ringColor}
              strokeWidth={stroke}
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s ease" }}
            />
          )}
        </svg>
      </div>
    </Tooltip>
  );
}

export function ChatInput({
  onSend,
  onAbort,
  isStreaming,
  disabled,
  placeholder,
  models,
  currentModel,
  onChangeModel,
  tokenUsage,
  contextTokens = 0,
  cwd,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashActiveIdx, setSlashActiveIdx] = useState(0);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atQuery, setAtQuery] = useState("");
  const [atActiveIdx, setAtActiveIdx] = useState(0);
  const [atResults, setAtResults] = useState<string[]>([]);
  const [atStartPos, setAtStartPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const atMenuRef = useRef<HTMLDivElement>(null);
  const atDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
    if (!showModelMenu) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelMenu]);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && isStreaming) {
        onAbort();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isStreaming, onAbort]);

  // @mention search
  useEffect(() => {
    if (!showAtMenu || !cwd) {
      setAtResults([]);
      return;
    }
    if (atDebounceRef.current) clearTimeout(atDebounceRef.current);
    atDebounceRef.current = setTimeout(async () => {
      try {
        const url = atQuery
          ? `/api/files/search?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(atQuery)}`
          : `/api/files/search?cwd=${encodeURIComponent(cwd)}`;
        const res = await apiFetch(url);
        const data: string[] = await res.json();
        setAtResults(data);
        setAtActiveIdx(0);
      } catch {
        setAtResults([]);
      }
    }, 150);
    return () => { if (atDebounceRef.current) clearTimeout(atDebounceRef.current); };
  }, [showAtMenu, atQuery, cwd]);

  const selectAtFile = useCallback(
    (filePath: string) => {
      const before = value.slice(0, atStartPos);
      const after = value.slice(textareaRef.current?.selectionStart ?? value.length);
      const newValue = before + "@" + filePath + " " + after;
      setValue(newValue);
      setShowAtMenu(false);
      setAtResults([]);
      setTimeout(() => {
        if (textareaRef.current) {
          const pos = before.length + filePath.length + 2;
          textareaRef.current.selectionStart = pos;
          textareaRef.current.selectionEnd = pos;
          textareaRef.current.focus();
        }
      }, 0);
    },
    [value, atStartPos],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = e.target.value;
      setValue(newVal);

      const cursorPos = e.target.selectionStart ?? newVal.length;
      const textBefore = newVal.slice(0, cursorPos);
      const atMatch = textBefore.match(/@([\w./_-]*)$/);
      if (atMatch && cwd) {
        setShowAtMenu(true);
        setAtQuery(atMatch[1]);
        setAtStartPos(cursorPos - atMatch[0].length);
      } else {
        setShowAtMenu(false);
      }
    },
    [cwd],
  );

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
    if (showAtMenu && atResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAtActiveIdx((i) => (i + 1) % atResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAtActiveIdx((i) => (i - 1 + atResults.length) % atResults.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectAtFile(atResults[atActiveIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAtMenu(false);
        return;
      }
    }

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
        {showAtMenu && atResults.length > 0 && (
          <div className="at-menu" ref={atMenuRef}>
            {atResults.map((file, i) => (
              <div
                key={file}
                className={`at-menu-item ${i === atActiveIdx ? "active" : ""}`}
                onMouseEnter={() => setAtActiveIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectAtFile(file);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  {file.endsWith("/") ? (
                    <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                  ) : (
                    <path d="M9 2H4.5C3.67 2 3 2.67 3 3.5V12.5C3 13.33 3.67 14 4.5 14H11.5C12.33 14 13 13.33 13 12.5V6L9 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                  )}
                </svg>
                <span className="at-menu-path">{file}</span>
              </div>
            ))}
          </div>
        )}
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
              : placeholder || "Message Claude..."
          }
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || isStreaming}
          rows={1}
        />
        <div className="chat-input-actions">
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
        <div className="chat-input-bottom-bar">
          <div className="chat-input-bottom-left">
            <Tooltip text="Attach image (jpg, png, gif, webp)">
              <button
                className="chat-btn attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isStreaming}
              >
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <path d="M7.5 4.5L11.5 8.5C12.6 9.6 12.6 11.4 11.5 12.5C10.4 13.6 8.6 13.6 7.5 12.5L3 8C2.2 7.2 2.2 5.8 3 5C3.8 4.2 5.2 4.2 6 5L10 9C10.4 9.4 10.4 10.1 10 10.5C9.6 10.9 8.9 10.9 8.5 10.5L5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </Tooltip>
          </div>
          <div className="chat-input-bottom-right">
            {contextTokens > 0 && <ContextRing tokens={contextTokens} />}
          {models && models.length > 0 && onChangeModel && (
            <div className="model-selector" ref={modelMenuRef}>
              <button
                className="chat-input-model-btn"
                onClick={() => setShowModelMenu((s) => !s)}
              >
                {(models.find((m) => m.id === currentModel)?.name || currentModel || "").replace(/^Claude\s+/i, "")}
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {showModelMenu && (
                <div className="chat-input-model-dropdown">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      className={`chat-input-model-option ${m.id === currentModel ? "active" : ""}`}
                      onClick={() => {
                        onChangeModel(m.id);
                        setShowModelMenu(false);
                      }}
                    >
                      {m.name.replace(/^Claude\s+/i, "")}
                      {m.id === currentModel && (
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
