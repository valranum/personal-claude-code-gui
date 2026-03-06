import { useState } from "react";
import { Conversation } from "../types";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (cwd?: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: SidebarProps) {
  const [showCwdInput, setShowCwdInput] = useState(false);
  const [cwdValue, setCwdValue] = useState("");

  const handleCreate = () => {
    if (showCwdInput) {
      onCreate(cwdValue || undefined);
      setCwdValue("");
      setShowCwdInput(false);
    } else {
      onCreate();
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">Claude Code</h1>
        <div className="sidebar-actions">
          <button
            className="sidebar-btn new-chat-btn"
            onClick={handleCreate}
            title="New chat"
          >
            +
          </button>
          <button
            className="sidebar-btn cwd-btn"
            onClick={() => setShowCwdInput(!showCwdInput)}
            title="Set working directory"
          >
            &#8943;
          </button>
        </div>
      </div>
      {showCwdInput && (
        <div className="cwd-input-wrapper">
          <input
            className="cwd-input"
            placeholder="Working directory (optional)"
            value={cwdValue}
            onChange={(e) => setCwdValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
        </div>
      )}
      <div className="conversation-list">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${activeId === conv.id ? "active" : ""}`}
            onClick={() => onSelect(conv.id)}
          >
            <span className="conversation-title">{conv.title}</span>
            <button
              className="conversation-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              title="Delete"
            >
              &times;
            </button>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="sidebar-empty">
            No conversations yet. Click + to start.
          </div>
        )}
      </div>
    </div>
  );
}
