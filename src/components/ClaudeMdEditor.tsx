import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../utils/api";

interface ClaudeMdEditorProps {
  cwd: string;
}

export function ClaudeMdEditor({ cwd }: ClaudeMdEditorProps) {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/claude-md?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((data) => {
        setContent(data.content || "");
        setSavedContent(data.content || "");
        setExists(data.exists);
      })
      .catch(() => {
        setContent("");
        setSavedContent("");
        setExists(false);
      })
      .finally(() => setLoading(false));
  }, [cwd]);

  const isDirty = content !== savedContent;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/claude-md", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, content }),
      });
      if (res.ok) {
        setSavedContent(content);
        setExists(true);
      }
    } finally {
      setSaving(false);
    }
  }, [cwd, content]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, handleSave]);

  if (loading) {
    return (
      <div className="claude-md-editor">
        <div className="claude-md-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="claude-md-editor">
      <div className="claude-md-header">
        <span className="claude-md-title">
          CLAUDE.md
          {isDirty && <span className="claude-md-dirty">*</span>}
        </span>
        <button
          className="claude-md-save-btn"
          onClick={handleSave}
          disabled={!isDirty || saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {!exists && !content && (
        <div className="claude-md-hint">
          No CLAUDE.md found. Create one to give Claude project-specific instructions.
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="claude-md-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="# Project Instructions\n\nAdd instructions for Claude here..."
        spellCheck={false}
      />
    </div>
  );
}
