import { useState } from "react";
import { apiFetch } from "../utils/api";
import { Conversation } from "../types";
import { FolderPicker } from "./FolderPicker";
import littleDude from "../assets/little-dude.png";

interface WelcomeScreenProps {
  onOpenFolder: (cwd?: string) => void;
  onNewProject: (cwd: string, initialPrompt: string) => void;
  conversations: Conversation[];
}

type OnboardingStep = "type" | "framework" | "location";

const PROJECT_TYPES = [
  { id: "website", label: "Website", emoji: "\u{1F310}" },
  { id: "webapp", label: "Web App", emoji: "\u26A1" },
  { id: "landing", label: "Landing Page", emoji: "\u{1F4C4}" },
  { id: "component", label: "Components", emoji: "\u{1F9E9}" },
  { id: "api", label: "API / Backend", emoji: "\u{1F527}" },
  { id: "other", label: "Other", emoji: "\u2726" },
];

const FRAMEWORKS: Record<string, { id: string; label: string }[]> = {
  website: [
    { id: "react", label: "React" },
    { id: "vue", label: "Vue" },
    { id: "nextjs", label: "Next.js" },
    { id: "astro", label: "Astro" },
    { id: "vanilla", label: "Vanilla" },
    { id: "auto", label: "Let Claude decide" },
  ],
  webapp: [
    { id: "react", label: "React" },
    { id: "vue", label: "Vue" },
    { id: "nextjs", label: "Next.js" },
    { id: "remix", label: "Remix" },
    { id: "auto", label: "Let Claude decide" },
  ],
  landing: [
    { id: "react", label: "React" },
    { id: "html", label: "HTML / CSS" },
    { id: "astro", label: "Astro" },
    { id: "auto", label: "Let Claude decide" },
  ],
  component: [
    { id: "react", label: "React" },
    { id: "vue", label: "Vue" },
    { id: "svelte", label: "Svelte" },
    { id: "auto", label: "Let Claude decide" },
  ],
  api: [
    { id: "express", label: "Express" },
    { id: "fastify", label: "Fastify" },
    { id: "hono", label: "Hono" },
    { id: "python", label: "Python / Flask" },
    { id: "auto", label: "Let Claude decide" },
  ],
  other: [{ id: "auto", label: "Let Claude decide" }],
};

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
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("type");
  const [projectType, setProjectType] = useState<string | null>(null);
  const [framework, setFramework] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState("~/Development/");

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

  const handleCreateProject = () => {
    const type = PROJECT_TYPES.find((t) => t.id === projectType);
    const fw = (FRAMEWORKS[projectType || ""] || FRAMEWORKS.other).find(
      (f) => f.id === framework,
    );

    let prompt = `Create a new ${type?.label || "project"}`;
    if (fw && fw.id !== "auto") {
      prompt += ` using ${fw.label}`;
    }
    prompt +=
      ". Set up the project structure, install dependencies, and create a basic starting point. Then start the dev server.";

    onNewProject(projectPath, prompt);
  };

  const handleOnboardingBack = () => {
    if (onboardingStep === "location") {
      setOnboardingStep("framework");
    } else if (onboardingStep === "framework") {
      setOnboardingStep("type");
    } else {
      setShowOnboarding(false);
      setProjectType(null);
      setFramework(null);
      setOnboardingStep("type");
    }
  };

  const stepNumber =
    onboardingStep === "type" ? 1 : onboardingStep === "framework" ? 2 : 3;

  if (showOnboarding) {
    return (
      <div className="chat-view">
        <div className="welcome-screen">
          <div className="welcome-onboarding">
            <div className="welcome-onboarding-header">
              <button
                className="welcome-onboarding-back"
                onClick={handleOnboardingBack}
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
              <span className="welcome-onboarding-step">
                Step {stepNumber} of 3
              </span>
            </div>

            {onboardingStep === "type" && (
              <>
                <h2 className="welcome-onboarding-title">
                  What are you building?
                </h2>
                <div className="welcome-onboarding-grid">
                  {PROJECT_TYPES.map((type) => (
                    <button
                      key={type.id}
                      className={`welcome-pill ${projectType === type.id ? "active" : ""}`}
                      onClick={() => setProjectType(type.id)}
                    >
                      <span className="welcome-pill-emoji">{type.emoji}</span>
                      {type.label}
                    </button>
                  ))}
                </div>
                <button
                  className="welcome-onboarding-next"
                  disabled={!projectType}
                  onClick={() => setOnboardingStep("framework")}
                >
                  Next
                </button>
              </>
            )}

            {onboardingStep === "framework" && projectType && (
              <>
                <h2 className="welcome-onboarding-title">Pick a framework</h2>
                <div className="welcome-onboarding-grid">
                  {(FRAMEWORKS[projectType] || FRAMEWORKS.other).map((fw) => (
                    <button
                      key={fw.id}
                      className={`welcome-pill ${framework === fw.id ? "active" : ""}`}
                      onClick={() => setFramework(fw.id)}
                    >
                      {fw.label}
                    </button>
                  ))}
                </div>
                <button
                  className="welcome-onboarding-next"
                  disabled={!framework}
                  onClick={() => setOnboardingStep("location")}
                >
                  Next
                </button>
              </>
            )}

            {onboardingStep === "location" && (
              <>
                <h2 className="welcome-onboarding-title">
                  Where should we create it?
                </h2>
                <div className="welcome-onboarding-folder">
                  <FolderPicker
                    value={projectPath}
                    onChange={setProjectPath}
                    onCommit={() => handleCreateProject()}
                    large
                    placeholder="~/Development/my-project"
                  />
                </div>
                <button
                  className="welcome-onboarding-next welcome-onboarding-create"
                  onClick={handleCreateProject}
                >
                  Create Project
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      <div className="welcome-screen">
        <img src={littleDude} alt="Claude" className="welcome-logo" />
        <h1 className="welcome-title">
          Claude Code{" "}
          <span style={{ fontWeight: 400, opacity: 0.6, fontSize: "0.82em" }}>
            (for designers)
          </span>
        </h1>
        <p className="welcome-subtitle">What would you like to do?</p>

        <div className="welcome-paths">
          <button
            className="welcome-path-card welcome-path-primary"
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
                {picking ? "Opening..." : "Open an existing project"}
              </div>
              <div className="welcome-path-desc">
                Browse your files and start coding
              </div>
            </div>
            <svg
              className="welcome-path-arrow"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M6 4L10 8L6 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            className="welcome-path-card welcome-path-secondary"
            onClick={() => setShowOnboarding(true)}
          >
            <div className="welcome-path-icon">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 2L9.5 6.5L14 8L9.5 9.5L8 14L6.5 9.5L2 8L6.5 6.5L8 2Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
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

        <button
          className="welcome-skip-link"
          onClick={() => onOpenFolder(undefined)}
        >
          or start without a folder
        </button>

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
                <span className="welcome-recent-path">
                  {shortenPath(project.cwd)}
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
