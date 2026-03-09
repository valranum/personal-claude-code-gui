import React, { useState, useRef, useEffect, useCallback } from "react";
import { Conversation } from "../types";
import { formatRelativeTime } from "../utils/time";
import { FileTree } from "./FileTree";
import { apiFetch } from "../utils/api";

interface SearchResult {
  conversation: Conversation;
  matchType: "title" | "message";
  matchContext?: string;
}

type SidebarTab = "chats" | "files";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  activeCwd?: string;
  onSelect: (id: string) => void;
  onCreate: (cwd?: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  width: number;
}

export function Sidebar({
  conversations,
  activeId,
  activeCwd,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onPin,
  collapsed,
  onToggleCollapse,
  width,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("chats");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [exportMenuId, setExportMenuId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  // Debounced server search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!search.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/conversations/search?q=${encodeURIComponent(search.trim())}`);
        const data: SearchResult[] = await res.json();
        setSearchResults(data);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Close export menu on outside click
  useEffect(() => {
    if (!exportMenuId) return;
    const handler = () => setExportMenuId(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [exportMenuId]);

  const displayList = searchResults
    ? searchResults.map((r) => ({ conv: r.conversation, matchType: r.matchType, matchContext: r.matchContext }))
    : [...conversations]
        .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1))
        .map((c) => ({ conv: c, matchType: "title" as const, matchContext: undefined }));

  const pinnedCount = searchResults ? 0 : displayList.filter((d) => d.conv.pinned).length;

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

  const handleExport = useCallback((convId: string, format: "md" | "json") => {
    window.open(`/api/conversations/${convId}/export?format=${format}`, "_blank");
    setExportMenuId(null);
  }, []);

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
          title="New Chat"
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
        <div className="sidebar-title-group">
          <h1 className="sidebar-title">Claude Code</h1>
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(for designers)</span>
        </div>
        <div className="sidebar-actions">
          <button
            className="sidebar-btn"
            onClick={() => onCreate()}
            title="New Chat"
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
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === "chats" ? "active" : ""}`}
          onClick={() => setActiveTab("chats")}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 3.5C2 2.67 2.67 2 3.5 2H12.5C13.33 2 14 2.67 14 3.5V10.5C14 11.33 13.33 12 12.5 12H5L2 15V3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          Chats
        </button>
        <button
          className={`sidebar-tab ${activeTab === "files" ? "active" : ""}`}
          onClick={() => setActiveTab("files")}
          disabled={!activeCwd}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          Files
        </button>
      </div>
      {activeTab === "chats" ? (
        <>
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
        {searching && <span className="search-spinner" />}
      </div>
      <div className="conversation-list">
        {pinnedCount > 0 && (
          <div className="pinned-divider">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L9.8 5.6L14.2 6.1L11 9.1L11.8 13.5L8 11.4L4.2 13.5L5 9.1L1.8 6.1L6.2 5.6Z" stroke="currentColor" strokeWidth="1.3" fill="currentColor" strokeLinejoin="round"/>
            </svg>
            Starred
          </div>
        )}
        {displayList.map(({ conv, matchType, matchContext }, idx) => (
          <React.Fragment key={conv.id}>
            {pinnedCount > 0 && idx === pinnedCount && (
              <div className="pinned-divider pinned-divider-end" />
            )}
            <div
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
                  <span className="conversation-title">
                    {conv.pinned && (
                      <svg className="conversation-pin-icon" width="10" height="10" viewBox="0 0 16 16" fill="none">
                        <path d="M8 1.5L9.8 5.6L14.2 6.1L11 9.1L11.8 13.5L8 11.4L4.2 13.5L5 9.1L1.8 6.1L6.2 5.6Z" stroke="currentColor" strokeWidth="1.3" fill="currentColor" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {conv.title}
                  </span>
                  {matchType === "message" && matchContext ? (
                    <span className="conversation-match-context">{matchContext}</span>
                  ) : (
                    <span className="conversation-time">
                      {formatRelativeTime(conv.updatedAt)}
                    </span>
                  )}
                </div>
              )}
              <div className="conversation-actions">
                <button
                  className={`pin-btn ${conv.pinned ? "pinned" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin(conv.id, !conv.pinned);
                  }}
                  title={conv.pinned ? "Unfavorite" : "Favorite"}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1.5L9.8 5.6L14.2 6.1L11 9.1L11.8 13.5L8 11.4L4.2 13.5L5 9.1L1.8 6.1L6.2 5.6Z" stroke="currentColor" strokeWidth="1.3" fill={conv.pinned ? "currentColor" : "none"} strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  className="conversation-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExportMenuId(exportMenuId === conv.id ? null : conv.id);
                  }}
                  title="Export"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2V10M5 7L8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 13H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
                {exportMenuId === conv.id && (
                  <div className="export-dropdown" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleExport(conv.id, "md")}>Markdown</button>
                    <button onClick={() => handleExport(conv.id, "json")}>JSON</button>
                  </div>
                )}
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
          </React.Fragment>
        ))}
        {displayList.length === 0 && search.trim() && (
          <div className="sidebar-empty">No matches found.</div>
        )}
        {displayList.length === 0 && !search.trim() && conversations.length === 0 && (
          <div className="sidebar-empty">
            No conversations yet. Click + to start.
          </div>
        )}
      </div>
        </>
      ) : (
        <div className="sidebar-filetree">
          {activeCwd ? (
            <FileTree cwd={activeCwd} onClose={() => setActiveTab("chats")} />
          ) : (
            <div className="sidebar-empty">Open a project folder to browse files.</div>
          )}
        </div>
      )}
    </div>
  );
}
