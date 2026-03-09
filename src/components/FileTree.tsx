import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../utils/api";

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

interface FileTreeProps {
  cwd: string;
  onClose: () => void;
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 2h5.5L13 5.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon({ open }: { open?: boolean }) {
  if (open) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d="M1.5 12.5V4a1 1 0 0 1 1-1h3.25L7.5 5H13a1 1 0 0 1 1 1v1H5.5L3 12.5H1.5z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M5.5 7H14l-2 5.5H3.5L5.5 7z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TreeNode({ entry }: { entry: FileEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    if (entry.type !== "directory") return;

    if (expanded) {
      setExpanded(false);
      return;
    }

    if (children === null) {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/filetree?path=${encodeURIComponent(entry.path)}`);
        const data: FileEntry[] = await res.json();
        setChildren(data);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }

    setExpanded(true);
  }, [entry, expanded, children]);

  const isDir = entry.type === "directory";

  return (
    <div>
      <div
        className={`filetree-item ${isDir ? "directory" : "file"}`}
        onClick={toggle}
        role={isDir ? "button" : undefined}
      >
        {isDir && (
          <span className={`filetree-toggle ${expanded ? "expanded" : ""}`}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        {!isDir && <span className="filetree-toggle-spacer" />}
        <span className="filetree-icon">
          {isDir ? <FolderIcon open={expanded} /> : <FileIcon />}
        </span>
        <span className="filetree-name">{entry.name}</span>
        {loading && <span className="filetree-spinner" />}
      </div>
      {expanded && children && children.length > 0 && (
        <div className="filetree-children">
          {children.map((child) => (
            <TreeNode key={child.path} entry={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ cwd, onClose }: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRoot = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/filetree?path=${encodeURIComponent(cwd)}`);
      const data: FileEntry[] = await res.json();
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    fetchRoot();
  }, [fetchRoot]);

  return (
    <div className="filetree-panel">
      <div className="filetree-header">
        <span className="filetree-header-label">Files</span>
        <div className="filetree-header-actions">
          <button className="filetree-header-btn" onClick={fetchRoot} title="Refresh">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.3-3.56"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path d="M13.5 2.5V5H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="filetree-header-btn" onClick={onClose} title="Close file tree">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="filetree-body">
        {loading && entries.length === 0 ? (
          <div className="filetree-loading">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="filetree-empty">No files found</div>
        ) : (
          entries.map((entry) => <TreeNode key={entry.path} entry={entry} />)
        )}
      </div>
    </div>
  );
}
