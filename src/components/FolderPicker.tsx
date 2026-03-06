import { useState, useEffect, useRef, useCallback } from "react";

interface DirEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  parent: string;
  dirs: DirEntry[];
}

interface FolderPickerProps {
  value: string;
  onChange: (path: string) => void;
  onCommit: (path: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  large?: boolean;
}

export function FolderPicker({
  value,
  onChange,
  onCommit,
  onCancel,
  autoFocus = true,
  placeholder = "Enter folder path...",
  large = false,
}: FolderPickerProps) {
  const [suggestions, setSuggestions] = useState<DirEntry[]>([]);
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fetchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const fetchSuggestions = useCallback((query: string) => {
    clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/browse?path=${encodeURIComponent(query)}`,
        );
        const data: BrowseResult = await res.json();
        setSuggestions(data.dirs || []);
        setParentDir(data.parent || null);
        setSelectedIdx(-1);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
        setParentDir(null);
      }
    }, 100);
  }, []);

  const handleChange = (val: string) => {
    onChange(val);
    fetchSuggestions(val);
  };

  const navigateTo = (dirPath: string) => {
    onChange(dirPath);
    fetchSuggestions(dirPath + "/");
    inputRef.current?.focus();
  };

  const navigateUp = () => {
    if (!parentDir) return;
    const parent = parentDir.replace(/\/[^/]+\/?$/, "") || "/";
    navigateTo(parent);
  };

  const navigateHome = () => {
    navigateTo("~");
  };

  // Total items = shortcuts + suggestions
  const shortcutCount = parentDir ? 2 : 1; // ".." + "~" or just "~"
  const totalItems = shortcutCount + suggestions.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Tab" && totalItems > 0) {
      e.preventDefault();
      const idx = selectedIdx >= 0 ? selectedIdx : 0;
      handleItemSelect(idx);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0) {
        handleItemSelect(selectedIdx);
      } else {
        onCommit(value);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    }
  };

  const handleItemSelect = (idx: number) => {
    if (parentDir && idx === 0) {
      navigateUp();
    } else if (parentDir && idx === 1) {
      navigateHome();
    } else if (!parentDir && idx === 0) {
      navigateHome();
    } else {
      const dirIdx = idx - shortcutCount;
      if (suggestions[dirIdx]) {
        navigateTo(suggestions[dirIdx].path);
      }
    }
  };

  useEffect(() => {
    if (selectedIdx >= 0 && listRef.current) {
      const items = listRef.current.children;
      if (items[selectedIdx]) {
        (items[selectedIdx] as HTMLElement).scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIdx]);

  const cls = large ? "folder-picker folder-picker-lg" : "folder-picker";

  return (
    <div className={cls}>
      <div className="folder-picker-input-row">
        <svg className="folder-picker-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        </svg>
        <input
          ref={inputRef}
          className="folder-picker-input"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => fetchSuggestions(value || "~")}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          spellCheck={false}
        />
        <button
          className="folder-picker-go"
          onClick={() => onCommit(value)}
          title="Open folder"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      {showSuggestions && (
        <div className="folder-picker-suggestions" ref={listRef}>
          {parentDir && (
            <div
              className={`folder-suggestion folder-shortcut ${selectedIdx === 0 ? "selected" : ""}`}
              onMouseDown={navigateUp}
              onMouseEnter={() => setSelectedIdx(0)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 12V4M4 7L8 3L12 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="folder-suggestion-name">..</span>
              <span className="folder-suggestion-hint">Parent directory</span>
            </div>
          )}
          <div
            className={`folder-suggestion folder-shortcut ${selectedIdx === (parentDir ? 1 : 0) ? "selected" : ""}`}
            onMouseDown={navigateHome}
            onMouseEnter={() => setSelectedIdx(parentDir ? 1 : 0)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 8L8 3L13 8M4.5 9.5V13H6.5V10.5H9.5V13H11.5V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="folder-suggestion-name">~</span>
            <span className="folder-suggestion-hint">Home</span>
          </div>
          {suggestions.length > 0 && <div className="folder-suggestion-divider" />}
          {suggestions.map((dir, i) => (
            <div
              key={dir.path}
              className={`folder-suggestion ${i + shortcutCount === selectedIdx ? "selected" : ""}`}
              onMouseDown={() => navigateTo(dir.path)}
              onMouseEnter={() => setSelectedIdx(i + shortcutCount)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              <span className="folder-suggestion-name">{dir.name}</span>
            </div>
          ))}
          {suggestions.length === 0 && (
            <div className="folder-suggestion-empty">No subdirectories</div>
          )}
        </div>
      )}
    </div>
  );
}
