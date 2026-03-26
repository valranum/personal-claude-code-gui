import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../utils/api";

interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

interface ClaudeStats {
  dailyActivity: DailyActivity[];
  activeSessions: { pid: number; sessionId: string; cwd: string; startedAt: number }[];
  blockElapsedMs: number | null;
  todayTokens: { input: number; output: number; cached: number };
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function Sparkline({ data, width = 84, height = 20 }: { data: number[]; width?: number; height?: number }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const barWidth = Math.max(2, Math.floor((width - (data.length - 1) * 2) / data.length));
  const gap = 2;

  return (
    <svg width={width} height={height} className="usage-sparkline">
      {data.map((val, i) => {
        const barHeight = Math.max(1, (val / max) * (height - 2));
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={1}
            className="usage-sparkline-bar"
          />
        );
      })}
    </svg>
  );
}

const BLOCK_MS = 5 * 60 * 60 * 1000;

export function UsageStatsBar() {
  const [stats, setStats] = useState<ClaudeStats | null>(null);
  const [blockElapsed, setBlockElapsed] = useState<number | null>(null);
  const blockBaseRef = useRef<{ serverElapsed: number; fetchedAt: number } | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch("/api/claude-stats");
      if (res.ok) {
        const data: ClaudeStats = await res.json();
        setStats(data);
        if (data.blockElapsedMs !== null) {
          blockBaseRef.current = { serverElapsed: data.blockElapsedMs, fetchedAt: Date.now() };
          setBlockElapsed(data.blockElapsedMs);
        } else {
          blockBaseRef.current = null;
          setBlockElapsed(null);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Client-side tick for block timer
  useEffect(() => {
    if (blockBaseRef.current === null) return;
    const tick = setInterval(() => {
      if (blockBaseRef.current) {
        const drift = Date.now() - blockBaseRef.current.fetchedAt;
        setBlockElapsed((blockBaseRef.current.serverElapsed + drift) % BLOCK_MS);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [stats]);

  if (!stats) return null;

  const today = new Date().toISOString().slice(0, 10);
  const todayActivity = stats.dailyActivity.find((d) => d.date === today);
  const todayMessages = todayActivity?.messageCount ?? 0;
  const todayTools = todayActivity?.toolCallCount ?? 0;

  // Build last 7 days of message counts for sparkline
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = stats.dailyActivity.find((a) => a.date === dateStr);
    last7.push(entry?.messageCount ?? 0);
  }

  const blockPct = blockElapsed !== null ? Math.min(100, (blockElapsed / BLOCK_MS) * 100) : null;
  const totalTokens = stats.todayTokens.input + stats.todayTokens.output + stats.todayTokens.cached;

  return (
    <div className="usage-stats-bar">
      {blockElapsed !== null && (
        <div className="usage-stat-item usage-stat-block">
          <svg width="18" height="18" viewBox="0 0 18 18" className="usage-block-ring">
            <circle cx="9" cy="9" r="7" fill="none" stroke="var(--border)" strokeWidth="2" />
            <circle
              cx="9"
              cy="9"
              r="7"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray={`${(blockPct! / 100) * 44} 44`}
              strokeLinecap="round"
              transform="rotate(-90 9 9)"
            />
          </svg>
          <span className="usage-stat-label">Block</span>
          <span className="usage-stat-value">{formatDuration(blockElapsed)} / 5h</span>
        </div>
      )}

      <div className="usage-stat-item">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 3.5C2 2.67 2.67 2 3.5 2H12.5C13.33 2 14 2.67 14 3.5V10.5C14 11.33 13.33 12 12.5 12H5L2 15V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>
        <span className="usage-stat-label">Today</span>
        <span className="usage-stat-value">{todayMessages.toLocaleString()} msgs</span>
        {todayTools > 0 && (
          <span className="usage-stat-secondary">{todayTools.toLocaleString()} tools</span>
        )}
      </div>

      {totalTokens > 0 && (
        <div className="usage-stat-item">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 2V14M8 4V14M12 6V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="usage-stat-label">Tokens</span>
          <span className="usage-stat-value">{formatTokenCount(totalTokens)}</span>
        </div>
      )}

      <div className="usage-stat-item">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M5 8H11M8 5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <span className="usage-stat-label">Sessions</span>
        <span className="usage-stat-value">{stats.activeSessions.length} active</span>
      </div>

      <div className="usage-stat-item usage-stat-sparkline">
        <span className="usage-stat-label">7d</span>
        <Sparkline data={last7} />
      </div>
    </div>
  );
}
