import { useState } from "react";
import { ToolCallInfo } from "../types";

interface ToolCallBlockProps {
  toolCall: ToolCallInfo;
}

function ToolIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (n === "read" || n === "write" || n === "edit" || n === "strreplace")
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M9 2H4.5C3.67 2 3 2.67 3 3.5V12.5C3 13.33 3.67 14 4.5 14H11.5C12.33 14 13 13.33 13 12.5V6L9 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        <path d="M9 2V6H13" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    );
  if (n === "bash" || n === "shell")
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4 7L6 9L4 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 11H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    );
  if (n === "glob" || n === "grep")
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M10.2 10.2L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    );
  if (n === "websearch" || n === "webfetch")
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M2 8H14M8 2C6 4.67 6 11.33 8 14M8 2C10 4.67 10 11.33 8 14" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    );
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M6 2L10 8L6 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function getToolSummary(toolCall: ToolCallInfo): string | null {
  const input = toolCall.input;
  const n = toolCall.name.toLowerCase();

  if ((n === "read" || n === "write" || n === "edit" || n === "strreplace") && input.path) {
    const p = String(input.path);
    const parts = p.split("/");
    return parts.length > 2
      ? `.../${parts.slice(-2).join("/")}`
      : p;
  }
  if ((n === "bash" || n === "shell") && input.command) {
    const cmd = String(input.command);
    return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
  }
  if ((n === "glob" || n === "grep") && (input.pattern || input.glob_pattern)) {
    return String(input.pattern || input.glob_pattern);
  }
  if (n === "websearch" && input.search_term) {
    return String(input.search_term);
  }
  if (n === "webfetch" && input.url) {
    return String(input.url);
  }
  return null;
}

export function ToolCallBlock({ toolCall }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const statusClass = `tool-status-${toolCall.status}`;
  const summary = getToolSummary(toolCall);

  return (
    <div className={`tool-call-block ${statusClass}`}>
      <div
        className="tool-call-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`tool-status ${statusClass}`}>
          {toolCall.status === "running" ? (
            <span className="tool-spinner" />
          ) : toolCall.status === "done" ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </span>
        <span className="tool-icon">
          <ToolIcon name={toolCall.name} />
        </span>
        <span className="tool-name">{toolCall.name}</span>
        {summary && <span className="tool-summary">{summary}</span>}
        <span className="tool-expand">{expanded ? "\u25BC" : "\u25B6"}</span>
      </div>
      {expanded && (
        <div className="tool-call-body">
          <div className="tool-section">
            <div className="tool-section-label">Input</div>
            <pre className="tool-json">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output && (
            <div className="tool-section">
              <div className="tool-section-label">Output</div>
              <pre className="tool-json">{toolCall.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
