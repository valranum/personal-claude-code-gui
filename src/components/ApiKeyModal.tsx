import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../utils/api";

interface ApiKeyModalProps {
  open: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ open, onClose }: ApiKeyModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [maskedKey, setMaskedKey] = useState("");
  const [inputKey, setInputKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInputKey("");
    setError(null);
    setSuccess(null);
    apiFetch("/api/api-key")
      .then((r) => r.json())
      .then((data) => {
        setConfigured(data.configured);
        setMaskedKey(data.maskedKey || "");
      })
      .catch(() => setConfigured(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [success]);

  const handleSave = async () => {
    const trimmed = inputKey.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setConfigured(true);
      setMaskedKey(data.maskedKey);
      setInputKey("");
      setSuccess("API key saved successfully.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="faq-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="faq-modal apikey-modal">
        <div className="faq-header">
          <h2>API Key</h2>
          <button className="faq-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="faq-content apikey-content">
          <div className="apikey-status">
            <span className={`apikey-dot ${configured ? "apikey-dot-ok" : "apikey-dot-none"}`} />
            <span className="apikey-status-text">
              {configured === null
                ? "Checking..."
                : configured
                  ? "API key configured"
                  : "No API key configured"}
            </span>
          </div>

          {configured && maskedKey && (
            <div className="apikey-masked">
              <code>{maskedKey}</code>
            </div>
          )}

          {(error || success) && (
            <div className={`apikey-toast ${error ? "apikey-toast-error" : "apikey-toast-success"}`}>
              {error || success}
            </div>
          )}

          <div className="apikey-form">
            <label className="apikey-label">
              {configured ? "Update your API key" : "Paste your API key"}
            </label>
            <div className="apikey-input-row">
              <input
                className="apikey-input"
                type="password"
                placeholder="sk-ant-..."
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                disabled={saving}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="apikey-save-btn"
                onClick={handleSave}
                disabled={!inputKey.trim() || saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <p className="apikey-help">
            Get your API key from{" "}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>
            . Sign in with your work account, go to API Keys, and create a new key.
          </p>
        </div>
      </div>
    </div>
  );
}
