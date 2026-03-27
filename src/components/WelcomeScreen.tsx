import { useState } from "react";
import { apiFetch } from "../utils/api";
import { Conversation } from "../types";
import littleDude from "../assets/little-dude.png";

interface WelcomeScreenProps {
  onOpenFolder: (cwd?: string) => void;
  onNewProject: (cwd: string, initialPrompt: string) => void;
  conversations: Conversation[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function shortenPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~");
}

export function WelcomeScreen({
  onOpenFolder,
  onNewProject,
  conversations,
}: WelcomeScreenProps) {
  const [picking, setPicking] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [parentFolder, setParentFolder] = useState("~/Development");
  const [projectName, setProjectName] = useState("");
  const [pickingNewProjectFolder, setPickingNewProjectFolder] = useState(false);

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

  const recentProjects = conversations
    .filter((c) => c.cwd)
    .reduce<{ cwd: string; updatedAt: string }[]>((acc, c) => {
      if (!acc.find((p) => p.cwd === c.cwd)) {
        acc.push({ cwd: c.cwd, updatedAt: c.updatedAt });
      }
      return acc;
    }, [])
    .slice(0, 5);

  const sanitizedName = projectName.trim().replace(/[/\\]/g, "");
  const fullProjectPath = parentFolder.replace(/\/+$/, "") + "/" + sanitizedName;

  const handleCreateProject = () => {
    if (!sanitizedName) return;
    const prompt = "Create a new project. Set up the project structure, install dependencies, and create a basic starting point. Then start the dev server.";
    onNewProject(fullProjectPath, prompt);
  };

  if (showOnboarding) {
    return (
      <div className="chat-view">
        <div className="welcome-screen">
          <div className="welcome-onboarding">
            <div className="welcome-onboarding-header">
              <button
                className="welcome-onboarding-back"
                onClick={() => setShowOnboarding(false)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M10 4L6 8L10 12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </button>
            </div>

            <h2 className="welcome-onboarding-title">
              Name your project
            </h2>
            <p className="welcome-onboarding-subtitle">
              Give it a name and Claude will set everything up for you.
            </p>

            <input
              className="welcome-onboarding-name-input"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateProject(); }}
              placeholder="my-cool-project"
              autoFocus
              spellCheck={false}
            />

            <div className="welcome-onboarding-location">
              <span className="welcome-onboarding-location-label">Location</span>
              <button
                className="welcome-onboarding-folder-btn"
                onClick={async () => {
                  if (pickingNewProjectFolder) return;
                  setPickingNewProjectFolder(true);
                  try {
                    const res = await apiFetch("/api/pick-folder", { method: "POST" });
                    const data = await res.json();
                    if (!data.cancelled && data.path) {
                      setParentFolder(data.path);
                    }
                  } finally {
                    setPickingNewProjectFolder(false);
                  }
                }}
                disabled={pickingNewProjectFolder}
              >
                <svg className="welcome-onboarding-folder-icon" width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
                <span className="welcome-onboarding-folder-path">
                  {pickingNewProjectFolder ? "Choosing..." : shortenPath(parentFolder)}
                </span>
                <span className="welcome-onboarding-folder-change">
                  {pickingNewProjectFolder ? "" : "Change"}
                </span>
              </button>
            </div>

            {sanitizedName && (
              <div className="welcome-onboarding-full-path">
                {shortenPath(fullProjectPath)}
              </div>
            )}

            <button
              className="welcome-onboarding-next welcome-onboarding-create"
              onClick={handleCreateProject}
              disabled={!sanitizedName}
            >
              Create Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      <div className="welcome-screen">
        <img src={littleDude} alt="Claude" className="welcome-logo" />
        <h1 className="welcome-title">Claude for Designers</h1>
        <p className="welcome-subtitle">Chat and code with Claude</p>

        <div className="welcome-paths">
          <div className="welcome-path-row">
            <button
              className="welcome-path-card"
              onClick={handlePickFolder}
              disabled={picking}
            >
              <div className="welcome-path-icon">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="welcome-path-info">
                <div className="welcome-path-label">
                  {picking ? "Opening..." : "Open existing project"}
                </div>
                <div className="welcome-path-desc">
                  Browse your files and start coding
                </div>
              </div>
            </button>

            <button
              className="welcome-path-card"
              onClick={() => setShowOnboarding(true)}
            >
              <div className="welcome-path-icon">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 3V13M3 8H13"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="welcome-path-info">
                <div className="welcome-path-label">Start a new project</div>
                <div className="welcome-path-desc">
                  Get guided through setup
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="welcome-secondary-row">
          <button
            className="welcome-secondary-link"
            onClick={() => onOpenFolder(undefined)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 3.5C2 2.67 2.67 2 3.5 2H12.5C13.33 2 14 2.67 14 3.5V10.5C14 11.33 13.33 12 12.5 12H5L2 15V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
            just chat, no code needed
          </button>
        </div>

        {recentProjects.length > 0 && (
          <div className="welcome-recents">
            <div className="welcome-recents-label">Recent Projects</div>
            {recentProjects.map((project) => (
              <button
                key={project.cwd}
                className="welcome-recent-item"
                onClick={() => onOpenFolder(project.cwd)}
              >
                <svg
                  className="welcome-recent-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="welcome-recent-name">
                  {project.cwd.split("/").pop()}
                </span>
                <span className="welcome-recent-time">
                  {timeAgo(project.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
