import { useState, useEffect, useRef } from "react";
import { Conversation } from "../types";

interface ModelOption {
  id: string;
  name: string;
}

const SYSTEM_PROMPT_PRESETS: { label: string; prompt: string }[] = [
  {
    label: "Code Reviewer",
    prompt: "You are a thorough code reviewer. Focus on bugs, performance issues, security concerns, and code quality. Be specific and provide actionable suggestions.",
  },
  {
    label: "Senior Dev",
    prompt: "You are a senior software engineer. Write clean, well-structured, production-quality code. Explain your architectural decisions.",
  },
  {
    label: "Explain Simply",
    prompt: "Explain concepts in simple, easy-to-understand terms. Avoid jargon. Use analogies and examples.",
  },
];

interface WorkspaceBarProps {
  conversation: Conversation | null;
  onChangeCwd: (id: string, cwd: string) => void;
  onChangeModel: (id: string, model: string) => void;
  onChangeSystemPrompt: (id: string, systemPrompt: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  showFileTree?: boolean;
  onToggleFileTree?: () => void;
}

function shortenPath(fullPath: string): { dir: string; name: string } {
  const home = fullPath.replace(/^\/Users\/[^/]+/, "~");
  const parts = home.split("/");
  const name = parts.pop() || home;
  const dir = parts.join("/");
  return { dir: dir ? dir + "/" : "", name };
}

export function WorkspaceBar({
  conversation,
  onChangeCwd,
  onChangeModel,
  onChangeSystemPrompt,
  sidebarCollapsed,
  onToggleSidebar,
  showFileTree,
  onToggleFileTree,
}: WorkspaceBarProps) {
  const [picking, setPicking] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const spRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => {});
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!showModelMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelMenu]);

  useEffect(() => {
    if (!showSystemPrompt) return;
    const handler = (e: MouseEvent) => {
      if (spRef.current && !spRef.current.contains(e.target as Node)) {
        setShowSystemPrompt(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSystemPrompt]);

  useEffect(() => {
    if (showSystemPrompt && conversation) {
      setSystemPromptDraft(conversation.systemPrompt || "");
    }
  }, [showSystemPrompt, conversation]);

  if (!conversation) return null;

  const { dir, name } = shortenPath(conversation.cwd);
  const currentModelName =
    models.find((m) => m.id === conversation.model)?.name ||
    conversation.model;

  const handleChangeCwd = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const res = await fetch("/api/pick-folder", { method: "POST" });
      const data = await res.json();
      if (!data.cancelled && data.path && data.path !== conversation.cwd) {
        onChangeCwd(conversation.id, data.path);
      }
    } finally {
      setPicking(false);
    }
  };

  const handleSelectModel = (modelId: string) => {
    if (modelId !== conversation.model) {
      onChangeModel(conversation.id, modelId);
    }
    setShowModelMenu(false);
  };

  const handleSaveSystemPrompt = () => {
    onChangeSystemPrompt(conversation.id, systemPromptDraft);
    setShowSystemPrompt(false);
  };

  const handleClearSystemPrompt = () => {
    setSystemPromptDraft("");
    onChangeSystemPrompt(conversation.id, "");
    setShowSystemPrompt(false);
  };

  const hasSystemPrompt = !!(conversation.systemPrompt && conversation.systemPrompt.trim());

  return (
    <div className="workspace-bar">
      <div className="workspace-bar-left">
        {sidebarCollapsed && (
          <button
            className="workspace-menu-btn"
            onClick={onToggleSidebar}
            title="Show sidebar (⌘B)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        {onToggleFileTree && (
          <button
            className={`workspace-menu-btn filetree-toggle-btn ${showFileTree ? "active" : ""}`}
            onClick={onToggleFileTree}
            title="Toggle file tree"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M2 3H5.5L7 4.5H14V12.5H2V3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="M5 7.5H11" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              <path d="M5 9.5H9" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        <button
          className="workspace-path-btn"
          onClick={handleChangeCwd}
          disabled={picking}
          title="Change working directory"
        >
          <svg className="workspace-folder-icon" width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          <span className="workspace-path-dir">{dir}</span>
          <span className="workspace-path-name">{picking ? "Opening..." : name}</span>
        </button>
      </div>
      <div className="workspace-bar-right" ref={menuRef}>
        <button
          className="model-selector-btn"
          onClick={() => setShowModelMenu((s) => !s)}
          title="Change model"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M5.5 7L8 4.5L10.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 4.5V11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span className="model-selector-name">{currentModelName}</span>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {showModelMenu && (
          <div className="model-dropdown">
            {models.map((m) => (
              <button
                key={m.id}
                className={`model-option ${m.id === conversation.model ? "active" : ""}`}
                onClick={() => handleSelectModel(m.id)}
              >
                <span className="model-option-name">{m.name}</span>
                {m.id === conversation.model && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="system-prompt-container" ref={spRef}>
          <button
            className={`system-prompt-btn ${hasSystemPrompt ? "active" : ""}`}
            onClick={() => setShowSystemPrompt((s) => !s)}
            title={hasSystemPrompt ? "System prompt active" : "Set system prompt"}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M6.5 1.5L6 3.5L4.2 4.3L2.3 3.3L1 4.7L2.2 6.5L1.5 8.3L-.2 8.8V10.7L1.8 11L2.6 12.8L1.7 14.7L3.1 16L5 14.8L6.8 15.5L7.3 17.5H9.2L9.5 15.5L11.3 14.7L13.2 15.7L14.5 14.3L13.3 12.5L14 10.7L16 10.2V8.3L14 8L13.2 6.2L14.1 4.3L12.7 3L10.8 4.2L9 3.5L8.5 1.5H6.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" transform="scale(0.85) translate(1.4, 1.2)"/>
              <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2" transform="scale(0.85) translate(1.4, 1.2)"/>
            </svg>
          </button>
          {showSystemPrompt && (
            <div className="system-prompt-dropdown">
              <textarea
                className="system-prompt-textarea"
                placeholder="Set a system prompt for this conversation..."
                value={systemPromptDraft}
                onChange={(e) => setSystemPromptDraft(e.target.value)}
                rows={4}
              />
              <div className="system-prompt-presets">
                {SYSTEM_PROMPT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    className="system-prompt-preset"
                    onClick={() => setSystemPromptDraft(preset.prompt)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="system-prompt-actions">
                <button className="system-prompt-clear" onClick={handleClearSystemPrompt}>
                  Clear
                </button>
                <button className="system-prompt-save" onClick={handleSaveSystemPrompt}>
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
