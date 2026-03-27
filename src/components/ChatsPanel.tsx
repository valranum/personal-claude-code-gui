import React, { useState, useRef, useEffect, useCallback } from "react";
import { Conversation } from "../types";
import { formatRelativeTime } from "../utils/time";
import { Tooltip } from "./Tooltip";
import { apiFetch } from "../utils/api";

interface SearchResult {
  conversation: Conversation;
  matchType: "title" | "message";
  matchContext?: string;
}

interface ChatsPanelProps {
  conversations: Conversation[];
  activeId: string | null;
  activeCwd?: string;
  onSelect: (id: string) => void;
  onCreate: (cwd?: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
}

export function ChatsPanel({
  conversations,
  activeId,
  activeCwd,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onPin,
}: ChatsPanelProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [exportMenuId, setExportMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
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

  const handleExport = useCallback(async (convId: string, format: "md" | "json") => {
    setExportMenuId(null);
    try {
      const res = await apiFetch(`/api/conversations/${convId}/export?format=${format}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `conversation.${format === "md" ? "md" : "json"}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }, []);

  return (
    <div className="chats-panel">
      <div className="sidebar-search">
        <svg className="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          className="search-input"
          placeholder="Search conversations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searching && <span className="search-spinner" />}
      </div>
      <button className="new-chat-list-btn" onClick={() => onCreate(activeCwd)}>
        <span className="new-chat-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        New chat
      </button>
      <div className="conversation-list">
        {pinnedCount > 0 && (
          <div className="pinned-divider">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L9.8 5.6L14.2 6.1L11 9.1L11.8 13.5L8 11.4L4.2 13.5L5 9.1L1.8 6.1L6.2 5.6Z" stroke="currentColor" strokeWidth="1.3" fill="currentColor" strokeLinejoin="round" />
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
                        <path d="M8 1.5L9.8 5.6L14.2 6.1L11 9.1L11.8 13.5L8 11.4L4.2 13.5L5 9.1L1.8 6.1L6.2 5.6Z" stroke="currentColor" strokeWidth="1.3" fill="currentColor" strokeLinejoin="round" />
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
                <Tooltip text={conv.pinned ? "Unfavorite" : "Favorite"}>
                  <button
                    className={`pin-btn ${conv.pinned ? "pinned" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPin(conv.id, !conv.pinned);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1.5L9.8 5.6L14.2 6.1L11 9.1L11.8 13.5L8 11.4L4.2 13.5L5 9.1L1.8 6.1L6.2 5.6Z" stroke="currentColor" strokeWidth="1.3" fill={conv.pinned ? "currentColor" : "none"} strokeLinejoin="round" />
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip text="Export">
                  <button
                    className="conversation-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExportMenuId(exportMenuId === conv.id ? null : conv.id);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2V10M5 7L8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3 13H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </Tooltip>
                {exportMenuId === conv.id && (
                  <div className="export-dropdown" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleExport(conv.id, "md")}>Markdown</button>
                    <button onClick={() => handleExport(conv.id, "json")}>JSON</button>
                  </div>
                )}
                <Tooltip text="Rename">
                  <button
                    className="conversation-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRenameStart(conv);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip text="Delete">
                  <button
                    className="conversation-action-btn delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (conv.title === "New Chat") {
                        onDelete(conv.id);
                      } else {
                        setDeleteConfirmId(conv.id);
                      }
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </Tooltip>
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
      {deleteConfirmId && (
        <div className="delete-confirm-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="delete-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Delete this conversation? This can't be undone.</p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
              <button className="delete-confirm-delete" onClick={() => { onDelete(deleteConfirmId); setDeleteConfirmId(null); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
