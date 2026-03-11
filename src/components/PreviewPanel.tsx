import { useState, useRef, useCallback, useEffect } from "react";
import { apiFetch } from "../utils/api";

interface PreviewPanelProps {
  cwd?: string;
}

export function PreviewPanel({ cwd }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [project, setProject] = useState<{ framework: string; devScript: string | null } | null>(null);
  const detectedCwdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cwd || cwd === detectedCwdRef.current) return;
    detectedCwdRef.current = cwd;
    setDetecting(true);
    setUrl("");
    setProject(null);
    apiFetch(`/api/detect-dev-server?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((data: { found: boolean; url: string | null; project: { framework: string; devScript: string | null } | null }) => {
        if (data.found && data.url) {
          setUrl(data.url);
          setEditUrl(data.url);
        }
        if (data.project) setProject(data.project);
      })
      .catch(() => {})
      .finally(() => setDetecting(false));
  }, [cwd]);

  const handleRefresh = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  const handleEditSubmit = () => {
    let finalUrl = editUrl.trim();
    if (finalUrl && !finalUrl.startsWith("http")) {
      finalUrl = `http://${finalUrl}`;
    }
    if (finalUrl) {
      setUrl(finalUrl);
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
        setUrl(data.url);
        setEditUrl(data.url);
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

  function renderEmptyBody() {
    if (startError) {
      return (
        <div className="preview-empty">
          <div className="preview-empty-icon preview-empty-icon--error">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="1.5" opacity="0.35"/>
              <path d="M13 13L23 23M23 13L13 23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="preview-empty-title">Something went wrong</p>
          <p className="preview-empty-hint">
            The dev server couldn't be started. You can retry or enter a URL manually if it's already running.
          </p>
          <div className="preview-empty-actions">
            <button className="preview-start-btn" onClick={() => { setStartError(""); handleStartPreview(); }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 8C13.5 11.04 11.04 13.5 8 13.5C4.96 13.5 2.5 11.04 2.5 8C2.5 4.96 4.96 2.5 8 2.5C9.8 2.5 11.4 3.3 12.4 4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M12 2V5H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Retry
            </button>
            <button className="preview-action-pill" onClick={() => { setStartError(""); setEditing(true); }}>
              Enter URL instead
            </button>
          </div>
        </div>
      );
    }

    if (hasDevScript) {
      return (
        <div className="preview-empty">
          <div className="preview-empty-icon">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="4" y="6" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
              <path d="M4 11H36" stroke="currentColor" strokeWidth="1.5" opacity="0.2"/>
              <circle cx="8" cy="8.5" r="1" fill="currentColor" opacity="0.25"/>
              <circle cx="11.5" cy="8.5" r="1" fill="currentColor" opacity="0.25"/>
              <circle cx="15" cy="8.5" r="1" fill="currentColor" opacity="0.25"/>
              <path d="M15 21L18 24L25 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
              <path d="M16 33H24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.2"/>
            </svg>
          </div>
          <p className="preview-empty-title">Ready to preview</p>
          <p className="preview-empty-hint">
            Launch a local dev server to see changes in real time
          </p>
          <button className="preview-start-btn" onClick={handleStartPreview}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="currentColor"/>
            </svg>
            Start Dev Server
          </button>
        </div>
      );
    }

    return (
      <div className="preview-empty">
        <div className="preview-empty-icon">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="6" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
            <path d="M4 11H36" stroke="currentColor" strokeWidth="1.5" opacity="0.2"/>
            <circle cx="8" cy="8.5" r="1" fill="currentColor" opacity="0.25"/>
            <circle cx="11.5" cy="8.5" r="1" fill="currentColor" opacity="0.25"/>
            <circle cx="15" cy="8.5" r="1" fill="currentColor" opacity="0.25"/>
            <path d="M17 22L20 19L23 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
            <path d="M20 19V27" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
            <path d="M16 33H24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.2"/>
          </svg>
        </div>
        <p className="preview-empty-title">No preview running</p>
        <p className="preview-empty-hint">
          Enter a URL above to preview a running app, or ask Claude to set up your project
        </p>
        <button className="preview-action-pill" onClick={() => setEditing(true)}>
          Enter URL
        </button>
      </div>
    );
  }

  return (
    <div className="preview-panel preview-panel-standalone">
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
        {url && (
          <div className="preview-actions">
            <button className="preview-action-btn" onClick={handleRefresh} title="Refresh">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 8C13.5 11.04 11.04 13.5 8 13.5C4.96 13.5 2.5 11.04 2.5 8C2.5 4.96 4.96 2.5 8 2.5C9.8 2.5 11.4 3.3 12.4 4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M12 2V5H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className="preview-action-btn"
              onClick={() => window.open(url, "_blank")}
              title="Open in browser"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M6 3H3.5C2.67 3 2 3.67 2 4.5V12.5C2 13.33 2.67 14 3.5 14H11.5C12.33 14 13 13.33 13 12.5V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M9 2H14V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2L7 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}
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
