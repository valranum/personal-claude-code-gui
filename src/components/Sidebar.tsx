import { useState, useRef, useEffect } from "react";
import { Conversation } from "../types";
import { formatRelativeTime } from "../utils/time";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (cwd?: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  width: number;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  collapsed,
  onToggleCollapse,
  width,
  theme,
  onToggleTheme,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );

  const handleRenameStart = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title);
  };

  const handleRenameCommit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <button
          className="sidebar-btn collapse-btn"
          onClick={onToggleCollapse}
          title="Expand sidebar (⌘B)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className="sidebar-btn"
          onClick={() => onCreate()}
          title="New chat (⌘N)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar" style={{ width }}>
      <div className="sidebar-header">
        <h1 className="sidebar-title">Claude Code</h1>
        <div className="sidebar-actions">
          <button
            className="sidebar-btn"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 1V3M8 13V15M1 8H3M13 8H15M3.05 3.05L4.46 4.46M11.54 11.54L12.95 12.95M12.95 3.05L11.54 4.46M4.46 11.54L3.05 12.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M14 10.5A6.5 6.5 0 015.5 2 6.5 6.5 0 1014 10.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          <button
            className="sidebar-btn"
            onClick={() => onCreate()}
            title="New chat (⌘N)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className="sidebar-btn collapse-btn"
            onClick={onToggleCollapse}
            title="Collapse sidebar (⌘B)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M11 3L6 8L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="sidebar-search">
        <svg className="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          className="search-input"
          placeholder="Search conversations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="conversation-list">
        {filtered.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${activeId === conv.id ? "active" : ""}`}
            onClick={() => onSelect(conv.id)}
          >
            {editingId === conv.id ? (
              <input
                ref={editRef}
                className="rename-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleRenameCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameCommit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="conversation-info">
                <span className="conversation-title">{conv.title}</span>
                <span className="conversation-time">
                  {formatRelativeTime(conv.updatedAt)}
                </span>
              </div>
            )}
            <div className="conversation-actions">
              <button
                className="conversation-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRenameStart(conv);
                }}
                title="Rename"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                className="conversation-action-btn delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                title="Delete"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && conversations.length > 0 && (
          <div className="sidebar-empty">No matches found.</div>
        )}
        {conversations.length === 0 && (
          <div className="sidebar-empty">
            No conversations yet. Click + to start.
          </div>
        )}
      </div>
    </div>
  );
}
