import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Conversation } from "../types";

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  section: "actions" | "models" | "conversations";
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string | null;
  onNewConversation: () => void;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onSelectConversation: (id: string) => void;
  onChangeModel: (model: string) => void;
  onClear?: () => void;
  onCompact?: () => void;
  onShare?: () => void;
}

export function CommandPalette({
  open,
  onClose,
  conversations,
  activeId,
  onNewConversation,
  onToggleSidebar,
  onToggleTheme,
  onSelectConversation,
  onChangeModel,
  onClear,
  onCompact,
  onShare,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/models")
        .then((r) => r.json())
        .then((data) => setModels(data.models || []))
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const exec = useCallback(
    (item: CommandItem) => {
      onClose();
      item.action();
    },
    [onClose],
  );

  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const mod = isMac ? "⌘" : "Ctrl+";

  const allItems = useMemo<CommandItem[]>(() => {
    const actions: CommandItem[] = [
      {
        id: "new-conversation",
        label: "New Conversation",
        shortcut: `${mod}N`,
        section: "actions",
        action: onNewConversation,
      },
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        shortcut: `${mod}B`,
        section: "actions",
        action: onToggleSidebar,
      },
      {
        id: "toggle-theme",
        label: "Toggle Theme",
        section: "actions",
        action: onToggleTheme,
      },
      ...(onClear
        ? [
            {
              id: "clear",
              label: "Clear Conversation",
              section: "actions" as const,
              action: onClear,
            },
          ]
        : []),
      ...(onCompact
        ? [
            {
              id: "compact",
              label: "Compact Conversation",
              section: "actions" as const,
              action: onCompact,
            },
          ]
        : []),
      ...(activeId
        ? [
            {
              id: "export-md",
              label: "Export as Markdown",
              section: "actions" as const,
              action: () => window.open(`/api/conversations/${activeId}/export?format=md`, "_blank"),
            },
            {
              id: "export-json",
              label: "Export as JSON",
              section: "actions" as const,
              action: () => window.open(`/api/conversations/${activeId}/export?format=json`, "_blank"),
            },
            ...(onShare
              ? [{
                  id: "share",
                  label: "Share Conversation",
                  section: "actions" as const,
                  action: onShare,
                }]
              : []),
          ]
        : []),
    ];

    const modelItems: CommandItem[] = models.map((m) => ({
      id: `model-${m.id}`,
      label: `Switch to ${m.name}`,
      section: "models" as const,
      action: () => onChangeModel(m.id),
    }));

    const convItems: CommandItem[] = conversations
      .filter((c) => c.id !== activeId)
      .slice(0, 8)
      .map((c) => ({
        id: `conv-${c.id}`,
        label: c.title,
        section: "conversations" as const,
        action: () => onSelectConversation(c.id),
      }));

    return [...actions, ...modelItems, ...convItems];
  }, [
    mod,
    models,
    conversations,
    activeId,
    onNewConversation,
    onToggleSidebar,
    onToggleTheme,
    onChangeModel,
    onSelectConversation,
  ]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter((item) => item.label.toLowerCase().includes(q));
  }, [allItems, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(".command-palette-item.active");
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(filtered.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          (i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1),
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[activeIndex]) exec(filtered[activeIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, activeIndex, exec, onClose],
  );

  if (!open) return null;

  const sections: { key: CommandItem["section"]; label: string }[] = [
    { key: "actions", label: "Actions" },
    { key: "models", label: "Models" },
    { key: "conversations", label: "Recent Conversations" },
  ];

  let globalIndex = 0;

  return (
    <div className="command-palette-overlay" onMouseDown={onClose}>
      <div
        className="command-palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="command-palette-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="command-palette-empty">No results</div>
          )}
          {sections.map(({ key, label }) => {
            const items = filtered.filter((i) => i.section === key);
            if (items.length === 0) return null;
            const sectionEl = (
              <div key={key}>
                <div className="command-palette-section">{label}</div>
                {items.map((item) => {
                  const idx = globalIndex++;
                  return (
                    <div
                      key={item.id}
                      className={`command-palette-item ${idx === activeIndex ? "active" : ""}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => exec(item)}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="command-palette-shortcut">
                          {item.shortcut}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
            return sectionEl;
          })}
        </div>
      </div>
    </div>
  );
}
