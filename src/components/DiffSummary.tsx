import { useState, useMemo } from "react";
import { ToolCallInfo } from "../types";

interface FileChange {
  path: string;
  type: "created" | "edited";
  name: string;
}

interface DiffSummaryProps {
  toolCalls: ToolCallInfo[];
  onOpenArtifact?: (language: string, code: string) => void;
}

function fileNameFromPath(p: string): string {
  return p.split("/").pop() || p;
}

const EXT_TO_LANG: Record<string, string> = {
  py: "python", js: "javascript", ts: "typescript", jsx: "javascript",
  tsx: "typescript", rb: "ruby", go: "go", rs: "rust", java: "java",
  html: "html", css: "css", json: "json", yaml: "yaml", yml: "yaml",
  md: "markdown", sh: "bash", sql: "sql",
};

function detectLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_LANG[ext] || ext || "text";
}

export function DiffSummary({ toolCalls, onOpenArtifact }: DiffSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const fileChanges = useMemo(() => {
    const byPath = new Map<string, FileChange>();
    for (const tc of toolCalls) {
      const name = tc.name.toLowerCase();
      if (name === "write" || name === "filewrite") {
        const inp = tc.input || {};
        const filePath = String(inp.file_path || inp.path || "");
        if (filePath) {
          byPath.set(filePath, {
            path: filePath,
            type: "created",
            name: fileNameFromPath(filePath),
          });
        }
      } else if (name === "edit" || name === "fileedit") {
        const inp = tc.input || {};
        const filePath = String(inp.file_path || inp.path || "");
        if (filePath && !byPath.has(filePath)) {
          byPath.set(filePath, {
            path: filePath,
            type: "edited",
            name: fileNameFromPath(filePath),
          });
        }
      }
    }
    return Array.from(byPath.values());
  }, [toolCalls]);

  if (fileChanges.length < 2) return null;

  const created = fileChanges.filter((f) => f.type === "created").length;
  const edited = fileChanges.filter((f) => f.type === "edited").length;

  return (
    <div className="diff-summary">
      <button
        className="diff-summary-header"
        onClick={() => setExpanded(!expanded)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M9 2H4.5C3.67 2 3 2.67 3 3.5V12.5C3 13.33 3.67 14 4.5 14H11.5C12.33 14 13 13.33 13 12.5V6L9 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          <path d="M9 2V6H13" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        </svg>
        <span className="diff-summary-count">{fileChanges.length} files changed</span>
        {created > 0 && <span className="diff-badge created">{created} created</span>}
        {edited > 0 && <span className="diff-badge edited">{edited} edited</span>}
        <svg
          className={`diff-summary-chevron ${expanded ? "expanded" : ""}`}
          width="12" height="12" viewBox="0 0 16 16" fill="none"
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {expanded && (
        <div className="diff-summary-files">
          {fileChanges.map((f) => (
            <div
              key={f.path}
              className="diff-summary-file"
              onClick={() => {
                if (!onOpenArtifact) return;
                const tc = toolCalls.find((t) => {
                  const inp = t.input || {};
                  return String(inp.file_path || inp.path) === f.path &&
                    (inp.content || inp.contents);
                });
                if (tc) {
                  const code = String(tc.input.content || tc.input.contents);
                  onOpenArtifact(detectLang(f.path), code);
                }
              }}
              role={onOpenArtifact ? "button" : undefined}
            >
              <span className={`diff-file-badge ${f.type}`}>
                {f.type === "created" ? "C" : "E"}
              </span>
              <span className="diff-file-name" title={f.path}>{f.path}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
