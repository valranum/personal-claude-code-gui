import { useState, useEffect, useRef } from "react";
import { Conversation } from "../types";

interface ModelOption {
  id: string;
  name: string;
}

interface WorkspaceBarProps {
  conversation: Conversation | null;
  onChangeCwd: (id: string, cwd: string) => void;
  onChangeModel: (id: string, model: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
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
  sidebarCollapsed,
  onToggleSidebar,
}: WorkspaceBarProps) {
  const [picking, setPicking] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
      </div>
    </div>
  );
}
