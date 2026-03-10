import { useState, useRef, useEffect } from "react";
import { Conversation } from "../types";
import { apiFetch } from "../utils/api";
import { Tooltip } from "./Tooltip";
import { FaqModal } from "./FaqModal";

interface WorkspaceBarProps {
  conversation: Conversation | null;
  onChangeCwd: (id: string, cwd: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

function shortenPath(fullPath: string): { dir: string; name: string } {
  const home = fullPath.replace(/^\/Users\/[^/]+/, "~");
  const parts = home.split("/");
  const name = parts.pop() || home;
  const dir = parts.join("/");
  return { dir: dir ? dir + "/" : "", name };
}

export function WorkspaceBar({
  conversation,
  onChangeCwd,
  sidebarCollapsed,
  onToggleSidebar,
  theme,
  onToggleTheme,
}: WorkspaceBarProps) {
  const [picking, setPicking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSettings]);


  if (!conversation) return null;

  const { dir, name } = shortenPath(conversation.cwd);

  const handleChangeCwd = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const res = await apiFetch("/api/pick-folder", { method: "POST" });
      const data = await res.json();
      if (!data.cancelled && data.path && data.path !== conversation.cwd) {
        onChangeCwd(conversation.id, data.path);
      }
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="workspace-bar">
      <div className="workspace-bar-left">
        <Tooltip text="Change working directory">
          <button
            className="workspace-path-btn"
            onClick={handleChangeCwd}
            disabled={picking}
          >
          <svg className="workspace-folder-icon" width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          <span className="workspace-path-dir">{dir}</span>
          <span className="workspace-path-name">{picking ? "Opening..." : name}</span>
        </button>
        </Tooltip>
      </div>
      <div className="workspace-bar-right" ref={settingsRef}>
        <Tooltip text="Settings">
          <button
            className="settings-btn"
            onClick={() => setShowSettings((s) => !s)}
          >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6.86 1.5H9.14L9.6 3.42L11.18 4.15L13.02 3.24L14.76 5.26L13.52 6.92L13.68 8.7L15.36 9.62L14.64 11.86L12.72 11.82L11.58 13.14L11.88 15.08L9.64 15.58L8.6 13.92H7.4L6.36 15.58L4.12 15.08L4.42 13.14L3.28 11.82L1.36 11.86L0.64 9.62L2.32 8.7L2.48 6.92L1.24 5.26L2.98 3.24L4.82 4.15L6.4 3.42L6.86 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" transform="scale(0.88) translate(1.1, 0.8)"/>
            <circle cx="8" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>
        </Tooltip>
        {showSettings && (
          <div className="settings-dropdown">
            <button
              className="settings-option"
              onClick={() => {
                onToggleTheme();
                setShowSettings(false);
              }}
            >
              {theme === "dark" ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8 2V3.5M8 12.5V14M2 8H3.5M12.5 8H14M3.76 3.76L4.82 4.82M11.18 11.18L12.24 12.24M12.24 3.76L11.18 4.82M4.82 11.18L3.76 12.24" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 9.5a5.5 5.5 0 1 1-7-7 4.5 4.5 0 0 0 7 7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
              )}
              <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>
            <button
              className="settings-option"
              onClick={() => {
                setShowFaq(true);
                setShowSettings(false);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M6 6.5C6 5.4 6.9 4.5 8 4.5C9.1 4.5 10 5.4 10 6.5C10 7.3 9.5 8 8.8 8.3C8.3 8.5 8 8.9 8 9.4V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <circle cx="8" cy="11.5" r="0.7" fill="currentColor"/>
              </svg>
              <span>FAQ</span>
            </button>
            <div className="settings-divider" />
            <a
              className="settings-option"
              href="https://github.com/valranum/personal-claude-code-gui"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowSettings(false)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1C4.13 1 1 4.13 1 8c0 3.1 2 5.7 4.8 6.6.35.07.48-.15.48-.34V13c-1.95.42-2.36-.94-2.36-.94-.32-.81-.78-1.03-.78-1.03-.64-.44.05-.43.05-.43.7.05 1.07.72 1.07.72.63 1.07 1.65.76 2.05.58.06-.45.24-.76.44-.94-1.56-.18-3.2-.78-3.2-3.47 0-.77.28-1.4.72-1.89-.07-.18-.31-.9.07-1.87 0 0 .59-.19 1.93.72a6.7 6.7 0 0 1 3.5 0c1.34-.91 1.93-.72 1.93-.72.38.97.14 1.69.07 1.87.45.49.72 1.12.72 1.89 0 2.7-1.65 3.29-3.22 3.46.25.22.48.65.48 1.31v1.94c0 .19.13.41.48.34C13 13.7 15 11.1 15 8c0-3.87-3.13-7-7-7Z" fill="currentColor"/>
              </svg>
              <span>GitHub</span>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ marginLeft: "auto" }}>
                <path d="M5 3H13V11M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        )}
      </div>
      <FaqModal open={showFaq} onClose={() => setShowFaq(false)} />
    </div>
  );
}
