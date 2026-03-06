import { useMemo } from "react";

interface DiffLine {
  type: "added" | "removed" | "context" | "hunk";
  content: string;
  oldNum?: number;
  newNum?: number;
}

interface DiffViewerProps {
  patch: string;
  filePath?: string;
}

function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      lines.push({ type: "hunk", content: raw });
    } else if (raw.startsWith("+")) {
      lines.push({ type: "added", content: raw.slice(1), newNum: newLine });
      newLine++;
    } else if (raw.startsWith("-")) {
      lines.push({ type: "removed", content: raw.slice(1), oldNum: oldLine });
      oldLine++;
    } else if (raw.startsWith("\\")) {
      continue;
    } else {
      const content = raw.startsWith(" ") ? raw.slice(1) : raw;
      if (raw === "" && oldLine === 0 && newLine === 0) continue;
      lines.push({ type: "context", content, oldNum: oldLine, newNum: newLine });
      oldLine++;
      newLine++;
    }
  }

  return lines;
}

function shortenPath(p: string): string {
  const parts = p.split("/");
  return parts.length > 3
    ? `.../${parts.slice(-3).join("/")}`
    : p;
}

export function DiffViewer({ patch, filePath }: DiffViewerProps) {
  const lines = useMemo(() => parsePatch(patch), [patch]);

  if (lines.length === 0) return null;

  return (
    <div className="diff-viewer">
      {filePath && (
        <div className="diff-header">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M9 2H4.5C3.67 2 3 2.67 3 3.5V12.5C3 13.33 3.67 14 4.5 14H11.5C12.33 14 13 13.33 13 12.5V6L9 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M9 2V6H13" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          {shortenPath(filePath)}
        </div>
      )}
      <table className="diff-table">
        <tbody>
          {lines.map((line, i) => {
            if (line.type === "hunk") {
              return (
                <tr key={i} className="diff-line diff-hunk">
                  <td colSpan={4}>{line.content}</td>
                </tr>
              );
            }

            const cls = `diff-line diff-${line.type}`;
            const marker = line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";

            return (
              <tr key={i} className={cls}>
                <td className="diff-line-number">{line.oldNum ?? ""}</td>
                <td className="diff-line-number">{line.newNum ?? ""}</td>
                <td className="diff-line-marker">{marker}</td>
                <td className="diff-line-content">{line.content}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
