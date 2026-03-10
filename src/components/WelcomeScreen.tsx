import { useState } from "react";
import { apiFetch } from "../utils/api";
import littleDude from "../assets/little-dude.png";

interface WelcomeScreenProps {
  onOpenFolder: (cwd?: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function WelcomeScreen({
  onOpenFolder,
  sidebarCollapsed,
  onToggleSidebar,
}: WelcomeScreenProps) {
  const [picking, setPicking] = useState(false);

  const handlePickFolder = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const res = await apiFetch("/api/pick-folder", { method: "POST" });
      const data = await res.json();
      if (!data.cancelled && data.path) {
        onOpenFolder(data.path);
      }
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="chat-view">
      {sidebarCollapsed && (
        <div className="workspace-bar">
          <div className="workspace-bar-left">
            <button
              className="workspace-menu-btn"
              onClick={onToggleSidebar}
              title="Show sidebar (⌘B)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}
      <div className="welcome-screen">
        <img src={littleDude} alt="Claude" className="welcome-logo" />
        <h1 className="welcome-title">Claude Code <span style={{ fontWeight: 400, opacity: 0.6, fontSize: '0.82em' }}>(for designers)</span></h1>
        <p className="welcome-subtitle">
          Open a folder to start working with Claude.
        </p>
        <button
          className="welcome-folder-btn"
          onClick={handlePickFolder}
          disabled={picking}
        >
          <svg className="welcome-folder-icon" width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          <span className="welcome-folder-text">
            {picking ? "Opening..." : "Choose a project folder..."}
          </span>
          <svg className="welcome-folder-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className="welcome-skip-link"
          onClick={() => onOpenFolder(undefined)}
        >
          or start without a folder
        </button>
      </div>
    </div>
  );
}
