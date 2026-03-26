import { useState, useEffect, useMemo } from "react";

interface ContextStatusBarProps {
  model: string;
  contextTokens: number;
  contextWindow: number;
  sessionCost: number;
  sessionStart: string;
  isStreaming: boolean;
}

function formatModelName(model: string): string {
  const base = model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
  const match = base.match(/^(\w+)-(\d+)-(\d+)$/);
  if (match) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    return `${name} ${match[2]}.${match[3]}`;
  }
  const simple = base.match(/^(\w+)-(\d+)$/);
  if (simple) {
    const name = simple[1].charAt(0).toUpperCase() + simple[1].slice(1);
    return `${name} ${simple[2]}`;
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function formatDuration(startIso: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(startIso).getTime());
  const totalMinutes = Math.floor(elapsed / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

export function ContextStatusBar({
  model,
  contextTokens,
  contextWindow,
  sessionCost,
  sessionStart,
  isStreaming,
}: ContextStatusBarProps) {
  const [duration, setDuration] = useState(() => formatDuration(sessionStart));

  useEffect(() => {
    setDuration(formatDuration(sessionStart));
    const id = setInterval(() => setDuration(formatDuration(sessionStart)), 30000);
    return () => clearInterval(id);
  }, [sessionStart]);

  const displayModel = useMemo(() => formatModelName(model), [model]);

  const contextPercent = useMemo(
    () => (contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0),
    [contextTokens, contextWindow],
  );

  const levelClass = contextPercent > 75 ? "critical" : contextPercent >= 50 ? "warning" : "healthy";

  return (
    <div className="status-bar">
      {isStreaming && <div className="status-bar-pulse" />}

      <span className="status-bar-section">{displayModel}</span>
      <span className="status-bar-dot">·</span>

      <span className="status-bar-section">
        <span className="status-bar-track">
          <div
            className={`status-bar-fill status-bar-fill--${levelClass}`}
            style={{ width: `${Math.min(100, contextPercent)}%` }}
          />
        </span>
        <span className={`status-bar-pct status-bar-pct--${levelClass}`}>
          {contextPercent.toFixed(0)}%
        </span>
      </span>
      <span className="status-bar-dot">·</span>

      <span className="status-bar-section">{formatCost(sessionCost)}</span>
      <span className="status-bar-dot">·</span>

      <span className="status-bar-section">{duration}</span>
    </div>
  );
}
