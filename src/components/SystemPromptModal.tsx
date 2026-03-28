import { useState, useEffect, useCallback } from "react";
import { Conversation } from "../types";
import { apiFetch } from "../utils/api";

interface SystemPromptModalProps {
  conversation?: Conversation | null;
  cwd: string;
  onClose: () => void;
}

export function SystemPromptModal({ conversation, cwd, onClose }: SystemPromptModalProps) {
  const [prompt, setPrompt] = useState(conversation?.systemPrompt || "");
  const [workspaceDefault, setWorkspaceDefault] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    apiFetch(`/api/workspace-config?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((data) => {
        setWorkspaceDefault(data.defaultSystemPrompt || "");
        if (!conversation?.systemPrompt && data.defaultSystemPrompt) {
          setPrompt(data.defaultSystemPrompt);
        }
      })
      .catch(() => {});
  }, [cwd, conversation?.systemPrompt]);

  const handleSaveConversation = useCallback(async () => {
    if (!conversation) return;
    setSaving(true);
    try {
      await apiFetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: prompt }),
      });
      setSaved("Saved for this conversation");
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(false);
    }
  }, [conversation, prompt]);

  const handleSaveWorkspace = useCallback(async () => {
    setSaving(true);
    try {
      await apiFetch("/api/workspace-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, defaultSystemPrompt: prompt }),
      });
      setWorkspaceDefault(prompt);
      setSaved("Saved as workspace default");
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(false);
    }
  }, [cwd, prompt]);

  return (
    <div className="sysprompt-overlay" onClick={onClose}>
      <div className="sysprompt-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sysprompt-header">
          <h3>System Prompt</h3>
          <button className="sysprompt-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="sysprompt-body">
          <textarea
            className="sysprompt-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Custom instructions that Claude will follow in every message. Use this to set tone, constraints, or context — e.g. 'Always respond in French' or 'You are a senior React developer.'"
            rows={8}
            spellCheck={false}
          />
          {workspaceDefault && workspaceDefault !== prompt && (
            <button
              className="sysprompt-load-default"
              onClick={() => setPrompt(workspaceDefault)}
            >
              Load workspace default
            </button>
          )}
          {saved && <div className="sysprompt-saved">{saved}</div>}
          <div className="sysprompt-actions">
            {conversation && (
              <button
                className="sysprompt-btn sysprompt-btn-secondary"
                onClick={handleSaveConversation}
                disabled={saving}
              >
                Save for this conversation
              </button>
            )}
            <button
              className="sysprompt-btn sysprompt-btn-primary"
              onClick={handleSaveWorkspace}
              disabled={saving}
            >
              Save as workspace default
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
