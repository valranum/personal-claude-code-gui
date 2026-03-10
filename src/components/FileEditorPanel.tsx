import { useState, useEffect, useRef, useCallback } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { apiFetch } from "../utils/api";

interface FileEditorPanelProps {
  filePath: string;
  onClose: () => void;
  widthPercent?: number;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  py: "python", rb: "ruby", rs: "rust", go: "go",
  java: "java", kt: "kotlin", swift: "swift",
  css: "css", scss: "scss", less: "less",
  html: "html", vue: "vue", svelte: "svelte",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
  md: "markdown", sql: "sql", sh: "bash", bash: "bash",
  c: "c", cpp: "cpp", h: "c", hpp: "cpp",
  xml: "xml", graphql: "graphql",
};

function getLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_LANG[ext] || "text";
}

function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

function CodeEditor({ value, onChange, language, onSave }: {
  value: string;
  onChange: (v: string) => void;
  language: string;
  onSave: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      onSave();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const updated = value.substring(0, start) + "  " + value.substring(end);
      onChange(updated);
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
    }
  };

  const editorPadding = "12px 16px";

  return (
    <div className="code-editor-container">
      <div className="code-editor-highlight" ref={preRef} aria-hidden="true">
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          wrapLongLines={false}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "13px",
            lineHeight: "1.6",
            background: "transparent",
            minHeight: "100%",
            overflow: "visible",
            padding: editorPadding,
            fontFamily: "var(--font-mono)",
          }}
        >
          {value + "\n"}
        </SyntaxHighlighter>
      </div>
      <textarea
        ref={textareaRef}
        className="code-editor-textarea"
        style={{ padding: editorPadding }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
      />
    </div>
  );
}

export function FileEditorPanel({ filePath, onClose, widthPercent = 45 }: FileEditorPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const lang = getLang(filePath);
  const fileName = getFileName(filePath);

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load file");
      }
      const data = await res.json();
      setContent(data.content);
      setEditContent(data.content);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load file");
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    loadFile();
    setSaved(false);
  }, [loadFile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, content: editContent }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setContent(editContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = editContent !== content;
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const handleClose = () => {
    if (hasChanges) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  };

  const handleDiscardAndClose = () => {
    setShowUnsavedDialog(false);
    onClose();
  };

  const handleSaveAndClose = async () => {
    setShowUnsavedDialog(false);
    await handleSave();
    onClose();
  };

  return (
    <div className="file-editor-panel" style={{ flex: `0 0 ${widthPercent}%`, maxWidth: `${widthPercent}%` }}>
      {showUnsavedDialog && (
        <div className="file-unsaved-overlay">
          <div className="file-unsaved-dialog">
            <p className="file-unsaved-title">You have unsaved changes</p>
            <p className="file-unsaved-hint">Do you want to save your changes to <strong>{fileName}</strong> before closing?</p>
            <div className="file-unsaved-actions">
              <button className="file-unsaved-btn save" onClick={handleSaveAndClose}>Save</button>
              <button className="file-unsaved-btn discard" onClick={handleDiscardAndClose}>Discard</button>
              <button className="file-unsaved-btn cancel" onClick={() => setShowUnsavedDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="file-editor-header">
        <div className="file-editor-title">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="file-editor-file-icon">
            <path d="M4 2h5.5L13 5.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
              stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
          <span className="file-editor-name" title={filePath}>{fileName}</span>
          <span className="file-editor-lang">{lang.toUpperCase()}</span>
        </div>
        <div className="file-editor-actions">
          {saved && <span className="file-editor-saved-badge">Saved</span>}
          <button
            className={`file-editor-save-btn${hasChanges ? " has-changes" : ""}`}
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button className="file-editor-close-btn" onClick={handleClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="file-editor-body">
        {loading ? (
          <div className="file-editor-loading">Loading...</div>
        ) : error ? (
          <div className="file-editor-error">{error}</div>
        ) : (
          <CodeEditor
            value={editContent}
            onChange={setEditContent}
            language={lang}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}
