import { useState } from "react";
import { FolderPicker } from "./FolderPicker";
import littleDude from "../assets/little-dude.png";

interface WelcomeScreenProps {
  onOpenFolder: (cwd: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function WelcomeScreen({
  onOpenFolder,
  sidebarCollapsed,
  onToggleSidebar,
}: WelcomeScreenProps) {
  const [folderPath, setFolderPath] = useState("");

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
        <h1 className="welcome-title">Claude Code</h1>
        <p className="welcome-subtitle">
          Open a folder to start working with Claude.
        </p>
        <div className="welcome-picker">
          <FolderPicker
            value={folderPath}
            onChange={setFolderPath}
            onCommit={(path) => {
              if (path.trim()) onOpenFolder(path.trim());
            }}
            placeholder="Choose a project folder..."
            large
          />
        </div>
        <div className="welcome-hint">
          Navigate to a project folder, then press Enter or click the arrow to open it.
        </div>
      </div>
    </div>
  );
}
