import { ToolCallInfo, SubagentInfo } from "../types";

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
    case "Agent":
    case "Task":
      return input.description
        ? `Agent: ${truncate(String(input.description), 48)}`
        : "Running subagent";
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

export function StreamingIndicator({ toolCalls = [], subagents = [] }: { toolCalls?: ToolCallInfo[]; subagents?: SubagentInfo[] }) {
  const activity = getActivityText(toolCalls);
  const runningAgents = subagents.filter((s) => s.status === "running");

  return (
    <div className="streaming-indicator">
      {runningAgents.length > 0 && (
        <div className="subagent-activity">
          {runningAgents.map((sa) => (
            <div key={sa.id} className="subagent-activity-item">
              <span className="subagent-activity-icon">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
                  <circle cx="8" cy="8" r="2" fill="currentColor"/>
                </svg>
              </span>
              <span className="subagent-activity-name">{sa.agentName}</span>
              {sa.toolActivity.length > 0 && (
                <span className="subagent-activity-tool">
                  {sa.toolActivity[sa.toolActivity.length - 1].toolName}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {activity && <div className="activity-text">{activity}</div>}
      <div className="streaming-dots">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
    </div>
  );
}
