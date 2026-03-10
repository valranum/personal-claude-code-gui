import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../utils/api";

interface GitFile {
  status: string;
  path: string;
}

interface GitCommit {
  hash: string;
  short: string;
  subject: string;
  author: string;
  date: string;
}

interface GitPanelProps {
  cwd: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  M: { label: "M", color: "var(--warning)" },
  A: { label: "A", color: "var(--success)" },
  D: { label: "D", color: "var(--error)" },
  "??": { label: "?", color: "var(--text-muted)" },
  R: { label: "R", color: "var(--accent)" },
  MM: { label: "M", color: "var(--warning)" },
  AM: { label: "A", color: "var(--success)" },
};

export function GitPanel({ cwd }: GitPanelProps) {
  const [isRepo, setIsRepo] = useState(false);
  const [branch, setBranch] = useState("");
  const [files, setFiles] = useState<GitFile[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, logRes] = await Promise.all([
        apiFetch(`/api/git/status?cwd=${encodeURIComponent(cwd)}`),
        apiFetch(`/api/git/log?cwd=${encodeURIComponent(cwd)}&count=20`),
      ]);
      const statusData = await statusRes.json();
      const logData = await logRes.json();

      setIsRepo(statusData.isRepo);
      setBranch(statusData.branch || "");
      setFiles(statusData.files || []);
      setCommits(logData || []);
    } catch {
      setIsRepo(false);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="git-panel"><div className="git-loading">Loading...</div></div>;
  }

  if (!isRepo) {
    return (
      <div className="git-panel">
        <div className="git-empty">Not a git repository.</div>
      </div>
    );
  }

  return (
    <div className="git-panel">
      <div className="git-header">
        <div className="git-branch">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M5 3V10M11 3V7C11 8.66 9.66 10 8 10H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="5" cy="12" r="2" stroke="currentColor" strokeWidth="1.3"/>
            <circle cx="5" cy="3" r="1.5" fill="currentColor"/>
            <circle cx="11" cy="3" r="1.5" fill="currentColor"/>
          </svg>
          {branch}
        </div>
        <button className="git-refresh" onClick={load} title="Refresh">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 8C2 4.69 4.69 2 8 2C10.22 2 12.16 3.21 13.2 5M14 8C14 11.31 11.31 14 8 14C5.78 14 3.84 12.79 2.8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M10 5H13.5V1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {files.length > 0 && (
        <div className="git-section">
          <div className="git-section-title">Changes ({files.length})</div>
          <div className="git-files">
            {files.map((f, i) => {
              const info = STATUS_LABELS[f.status] || { label: f.status, color: "var(--text-muted)" };
              return (
                <div key={i} className="git-file">
                  <span className="git-file-status" style={{ color: info.color }}>{info.label}</span>
                  <span className="git-file-path">{f.path}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {commits.length > 0 && (
        <div className="git-section">
          <div className="git-section-title">Recent Commits</div>
          <div className="git-commits">
            {commits.map((c) => (
              <div key={c.hash} className="git-commit">
                <span className="git-commit-hash">{c.short}</span>
                <span className="git-commit-subject">{c.subject}</span>
                <span className="git-commit-date">{c.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
