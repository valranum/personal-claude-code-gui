import { ToolCallInfo } from "../types";

function getActivityText(toolCalls: ToolCallInfo[]): string | null {
  const running = toolCalls.filter((tc) => tc.status === "running");
  if (running.length === 0) return null;
  const tc = running[running.length - 1];
  const input = tc.input;

  switch (tc.name) {
    case "Read":
      return input.file_path || input.path
        ? `Reading ${basename(input.file_path || input.path)}`
        : "Reading file";
    case "Write":
      return input.file_path || input.path
        ? `Writing ${basename(input.file_path || input.path)}`
        : "Writing file";
    case "Edit":
    case "MultiEdit":
      return input.file_path || input.path
        ? `Editing ${basename(input.file_path || input.path)}`
        : "Editing file";
    case "Bash":
      return input.command
        ? `Running ${truncate(String(input.command), 48)}`
        : "Running command";
    case "Grep":
      return input.pattern
        ? `Searching for "${truncate(String(input.pattern), 32)}"`
        : "Searching";
    case "Glob":
      return input.pattern
        ? `Finding ${truncate(String(input.pattern), 40)}`
        : "Finding files";
    case "WebSearch":
      return input.query
        ? `Searching "${truncate(String(input.query), 36)}"`
        : "Searching the web";
    case "WebFetch":
      return "Fetching page";
    default:
      return "Working";
  }
}

function basename(p: unknown): string {
  if (typeof p !== "string") return "file";
  const parts = p.split("/");
  return parts[parts.length - 1] || p;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function StreamingIndicator({ toolCalls = [] }: { toolCalls?: ToolCallInfo[] }) {
  const activity = getActivityText(toolCalls);

  return (
    <div className="streaming-indicator">
      {activity && <div className="activity-text">{activity}</div>}
      <div className="streaming-dots">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
    </div>
  );
}
