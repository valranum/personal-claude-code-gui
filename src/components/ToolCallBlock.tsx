import { useState } from "react";
import { ToolCallInfo } from "../types";

interface ToolCallBlockProps {
  toolCall: ToolCallInfo;
}

export function ToolCallBlock({ toolCall }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon =
    toolCall.status === "running"
      ? "\u25F7"
      : toolCall.status === "done"
        ? "\u2713"
        : "\u2717";

  const statusClass = `tool-status-${toolCall.status}`;

  return (
    <div className="tool-call-block">
      <div
        className="tool-call-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`tool-status ${statusClass}`}>{statusIcon}</span>
        <span className="tool-name">{toolCall.name}</span>
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
