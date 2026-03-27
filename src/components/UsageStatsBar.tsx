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

function Sparkline({ data, width = 120, height = 32 }: { data: number[]; width?: number; height?: number }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const barWidth = Math.max(4, Math.floor((width - (data.length - 1) * 3) / data.length));
  const gap = 3;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = new Date().getDay();
  const dayLabels = data.map((_, i) => {
    const dayIdx = (today - (data.length - 1 - i) + 7) % 7;
    return days[dayIdx === 0 ? 6 : dayIdx - 1];
  });

  return (
    <div className="usage-sparkline-container">
      <svg width={width} height={height} className="usage-sparkline">
        {data.map((val, i) => {
          const barHeight = Math.max(2, (val / max) * (height - 2));
          const x = i * (barWidth + gap);
          const y = height - barHeight;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={2}
              className="usage-sparkline-bar"
            />
          );
        })}
      </svg>
      <div className="usage-sparkline-labels" style={{ width }}>
        {dayLabels.map((label, i) => (
          <span key={i} style={{ width: barWidth + gap, textAlign: "center" }}>{i === 0 || i === data.length - 1 ? label : ""}</span>
        ))}
      </div>
    </div>
  );
}

const BLOCK_MS = 5 * 60 * 60 * 1000;

interface UsageStatsBarProps {
  onClose: () => void;
}

export function UsageStatsBar({ onClose }: UsageStatsBarProps) {
  const [stats, setStats] = useState<ClaudeStats | null>(null);
  const [blockElapsed, setBlockElapsed] = useState<number | null>(null);
  const blockBaseRef = useRef<{ serverElapsed: number; fetchedAt: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 100);
    window.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  if (!stats) return null;

  const today = new Date().toISOString().slice(0, 10);
  const todayActivity = stats.dailyActivity.find((d) => d.date === today);
  const todayMessages = todayActivity?.messageCount ?? 0;
  const todayTools = todayActivity?.toolCallCount ?? 0;
  const totalTokens = stats.todayTokens.input + stats.todayTokens.output + stats.todayTokens.cached;

  const last7: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = stats.dailyActivity.find((a) => a.date === dateStr);
    last7.push(entry?.messageCount ?? 0);
  }

  const blockPct = blockElapsed !== null ? Math.min(100, (blockElapsed / BLOCK_MS) * 100) : null;
  const blockRemaining = blockElapsed !== null ? BLOCK_MS - blockElapsed : null;

  return (
    <div className="usage-overlay">
      <div className="usage-card" ref={cardRef}>
        <div className="usage-card-header">
          <h3 className="usage-card-title">Usage</h3>
          <button className="usage-card-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="usage-card-grid">
          <div className="usage-metric-card">
            <div className="usage-metric-label">Messages today</div>
            <div className="usage-metric-value">{todayMessages.toLocaleString()}</div>
            {todayTools > 0 && (
              <div className="usage-metric-sub">{todayTools.toLocaleString()} tool calls</div>
            )}
          </div>

          <div className="usage-metric-card">
            <div className="usage-metric-label">Tokens today</div>
            <div className="usage-metric-value">{formatTokenCount(totalTokens)}</div>
            {totalTokens > 0 && (
              <div className="usage-metric-sub">
                {formatTokenCount(stats.todayTokens.input)} in · {formatTokenCount(stats.todayTokens.output)} out
              </div>
            )}
          </div>

          <div className="usage-metric-card">
            <div className="usage-metric-label">Active sessions</div>
            <div className="usage-metric-value">{stats.activeSessions.length}</div>
          </div>

          {blockElapsed !== null && (
            <div className="usage-metric-card">
              <div className="usage-metric-label">Rate limit window</div>
              <div className="usage-metric-value usage-metric-row">
                <svg width="24" height="24" viewBox="0 0 24 24" className="usage-block-ring">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="var(--border)" strokeWidth="2.5" />
                  <circle
                    cx="12" cy="12" r="10"
                    fill="none"
                    stroke={blockPct! > 80 ? "var(--warning)" : "var(--accent)"}
                    strokeWidth="2.5"
                    strokeDasharray={`${(blockPct! / 100) * 62.8} 62.8`}
                    strokeLinecap="round"
                    transform="rotate(-90 12 12)"
                  />
                </svg>
                <span>{Math.round(blockPct!)}%</span>
              </div>
              <div className="usage-metric-sub">
                {formatDuration(blockElapsed)} used · {formatDuration(blockRemaining!)} left
              </div>
            </div>
          )}
        </div>

        <div className="usage-card-section">
          <div className="usage-section-label">Last 7 days</div>
          <Sparkline data={last7} width={240} height={40} />
        </div>
      </div>
    </div>
  );
}
