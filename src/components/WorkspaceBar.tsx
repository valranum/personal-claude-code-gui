import { useState } from "react";
import { Conversation } from "../types";

interface WorkspaceBarProps {
  conversation: Conversation | null;
  onChangeCwd: (id: string, cwd: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
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
}: WorkspaceBarProps) {
  const [picking, setPicking] = useState(false);

  if (!conversation) return null;

  const { dir, name } = shortenPath(conversation.cwd);

  const handleChangeCwd = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const res = await fetch("/api/pick-folder", { method: "POST" });
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
        {sidebarCollapsed && (
          <button
            className="workspace-menu-btn"
            onClick={onToggleSidebar}
            title="Show sidebar (⌘B)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        <button
          className="workspace-path-btn"
          onClick={handleChangeCwd}
          disabled={picking}
          title="Change working directory"
        >
          <svg className="workspace-folder-icon" width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          <span className="workspace-path-dir">{dir}</span>
          <span className="workspace-path-name">{picking ? "Opening..." : name}</span>
        </button>
      </div>
    </div>
  );
}
