import { useState, useRef, useCallback, useEffect } from "react";
import { apiFetch } from "../utils/api";

interface PreviewPanelProps {
  url: string;
  onUrlChange: (url: string) => void;
  onClose: () => void;
  widthPercent?: number;
  detecting?: boolean;
  project?: { framework: string; devScript: string | null } | null;
  cwd?: string;
}

export function PreviewPanel({
  url,
  onUrlChange,
  onClose,
  widthPercent = 45,
  detecting = false,
  project,
  cwd,
}: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState(url);
  const [iframeKey, setIframeKey] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  useEffect(() => {
    setEditUrl(url);
  }, [url]);

  const handleRefresh = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  const handleEditSubmit = () => {
    let finalUrl = editUrl.trim();
    if (finalUrl && !finalUrl.startsWith("http")) {
      finalUrl = `http://${finalUrl}`;
    }
    if (finalUrl) {
      onUrlChange(finalUrl);
    }
    setEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEditSubmit();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setEditUrl(url);
    }
  };

  const handleStartPreview = async () => {
    if (!cwd) return;
    setStarting(true);
    setStartError("");
    try {
      const res = await apiFetch("/api/start-dev-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        onUrlChange(data.url);
      } else {
        setStartError(data.error || "Could not start preview");
      }
    } catch {
      setStartError("Could not start preview");
    } finally {
      setStarting(false);
    }
  };

  const hasDevScript = project?.devScript != null;

  const previewIcon = (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path d="M22 12C12 12 5 22 5 22C5 22 12 32 22 32C32 32 39 22 39 22C39 22 32 12 22 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.45"/>
      <circle cx="22" cy="22" r="6" stroke="currentColor" strokeWidth="2" opacity="0.45"/>
      <circle cx="22" cy="22" r="2.5" fill="currentColor" opacity="0.35"/>
    </svg>
  );

  function renderEmptyBody() {
    if (startError) {
      return (
        <div className="preview-empty">
          <div className="preview-empty-icon">{previewIcon}</div>
          <p className="preview-empty-title">Couldn't start the preview</p>
          <p className="preview-empty-hint">
            You can try again, or enter a URL directly in the bar above if your project is already running somewhere.
          </p>
          <div className="preview-empty-actions">
            <button className="preview-action-pill primary" onClick={() => { setStartError(""); handleStartPreview(); }}>
              Try Again
            </button>
            <button className="preview-action-pill" onClick={() => { setStartError(""); setEditing(true); }}>
              Enter URL
            </button>
          </div>
        </div>
      );
    }

    if (hasDevScript) {
      return (
        <div className="preview-empty">
          <div className="preview-empty-icon">{previewIcon}</div>
          <p className="preview-empty-title">
            Preview your {project?.framework || "project"}
          </p>
          <p className="preview-empty-hint">
            See your design changes live as you build
          </p>
          <button className="preview-start-btn" onClick={handleStartPreview}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="currentColor"/>
            </svg>
            Start Preview
          </button>
        </div>
      );
    }

    return (
      <div className="preview-empty">
        <div className="preview-empty-icon">{previewIcon}</div>
        <p className="preview-empty-title">Preview your project</p>
        <p className="preview-empty-hint">
          Enter a URL in the bar above to preview any web page, or ask Claude to help set up your project.
        </p>
        <button className="preview-secondary-btn" onClick={() => setEditing(true)}>
          Enter URL
        </button>
      </div>
    );
  }

  return (
    <div
      className="preview-panel"
      style={{ flex: `0 0 ${widthPercent}%`, maxWidth: `${widthPercent}%` }}
    >
      <div className="preview-header">
        <div className="preview-url-bar">
          {editing ? (
            <input
              className="preview-url-input"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              onBlur={handleEditSubmit}
              onKeyDown={handleEditKeyDown}
              autoFocus
              placeholder="http://localhost:3000"
            />
          ) : (
            <button
              className="preview-url-display"
              onClick={() => setEditing(true)}
              title="Click to edit URL"
            >
              {url ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="preview-url-icon">
                  <circle cx="8" cy="8" r="3" fill="currentColor" opacity="0.6"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="preview-url-icon inactive">
                  <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.4"/>
                </svg>
              )}
              <span>{url || "Enter a URL..."}</span>
            </button>
          )}
        </div>
        <div className="preview-actions">
          <button className="preview-action-btn" onClick={handleRefresh} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 8C13.5 11.04 11.04 13.5 8 13.5C4.96 13.5 2.5 11.04 2.5 8C2.5 4.96 4.96 2.5 8 2.5C9.8 2.5 11.4 3.3 12.4 4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M12 2V5H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="preview-action-btn"
            onClick={() => { if (url) window.open(url, "_blank"); }}
            title="Open in browser"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 3H3.5C2.67 3 2 3.67 2 4.5V12.5C2 13.33 2.67 14 3.5 14H11.5C12.33 14 13 13.33 13 12.5V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M9 2H14V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2L7 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
          <button className="preview-action-btn" onClick={onClose} title="Close preview">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="preview-body">
        {detecting || starting ? (
          <div className="preview-empty">
            <div className="preview-spinner" />
            <p className="preview-empty-title">
              {starting ? "Starting preview..." : "Looking for your project..."}
            </p>
            {starting && (
              <p className="preview-empty-hint">This may take a few seconds</p>
            )}
          </div>
        ) : url ? (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={url}
            className="preview-iframe"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        ) : (
          renderEmptyBody()
        )}
      </div>
    </div>
  );
}
