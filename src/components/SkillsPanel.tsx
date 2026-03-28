import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../utils/api";

interface SkillEntry {
  name: string;
  description?: string;
  source: "installed" | "session";
}

interface SkillsPanelProps {
  cwd?: string;
  onClose: () => void;
}

export function SkillsPanel({ cwd = ".", onClose }: SkillsPanelProps) {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [sqAvailable, setSqAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [installName, setInstallName] = useState("");
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSkills = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/skills?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((data) => {
        setSkills(Array.isArray(data.skills) ? data.skills : []);
        setSqAvailable(!!data.sqCliAvailable);
      })
      .catch(() => {
        setSkills([]);
        setSqAvailable(false);
      })
      .finally(() => setLoading(false));
  }, [cwd]);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => { setSuccess(null); setError(null); }, 4000);
    return () => clearTimeout(t);
  }, [success, error]);

  const handleInstall = async () => {
    const name = installName.trim();
    if (!name) return;
    setInstalling(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Install failed");
      setSuccess(`Installed "${name}" successfully.`);
      setInstallName("");
      loadSkills();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to install skill");
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async (name: string) => {
    setUninstalling(name);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/skills/uninstall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Uninstall failed");
      setSuccess(`Removed "${name}".`);
      loadSkills();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove skill");
    } finally {
      setUninstalling(null);
    }
  };

  return (
    <div className="mcp-overlay" onClick={onClose}>
      <div className="mcp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mcp-header">
          <div>
            <h3>Skills</h3>
            <p className="mcp-subtitle">Extend Claude with specialized capabilities.</p>
          </div>
          <button className="mcp-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="mcp-body">
          {loading ? (
            <div className="mcp-loading">Loading...</div>
          ) : (
            <>
              {(error || success) && (
                <div className={`skills-toast ${error ? "skills-toast-error" : "skills-toast-success"}`}>
                  {error || success}
                </div>
              )}

              {skills.length > 0 && (
                <div className="mcp-installed-section">
                  <div className="mcp-section-label">Installed ({skills.length})</div>
                  <div className="mcp-installed-list">
                    {skills.map((s) => (
                      <div key={s.name} className="mcp-installed-item">
                        <div className="mcp-installed-icon">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M4.5 2L11.5 2C12.33 2 13 2.67 13 3.5L13 12.5C13 13.33 12.33 14 11.5 14L4.5 14C3.67 14 3 13.33 3 12.5L3 3.5C3 2.67 3.67 2 4.5 2Z" stroke="currentColor" strokeWidth="1.3"/>
                            <path d="M6 5.5L10 5.5M6 8L10 8M6 10.5L8.5 10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div className="mcp-installed-info">
                          <span className="mcp-installed-name">{s.name}</span>
                          {s.description && (
                            <span className="mcp-installed-desc">{s.description}</span>
                          )}
                        </div>
                        {sqAvailable && s.source === "installed" && (
                          <button
                            className="mcp-remove-btn"
                            onClick={() => handleUninstall(s.name)}
                            disabled={uninstalling === s.name}
                            title="Remove skill"
                          >
                            {uninstalling === s.name ? (
                              <span className="skills-spinner" />
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {skills.length === 0 && (
                <div className="skills-empty">
                  <svg width="32" height="32" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.3 }}>
                    <path d="M4.5 2L11.5 2C12.33 2 13 2.67 13 3.5L13 12.5C13 13.33 12.33 14 11.5 14L4.5 14C3.67 14 3 13.33 3 12.5L3 3.5C3 2.67 3.67 2 4.5 2Z" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M6 5.5L10 5.5M6 8L10 8M6 10.5L8.5 10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                  </svg>
                  <p>No skills installed yet.</p>
                  <p className="skills-empty-hint">
                    Skills add specialized knowledge and capabilities to Claude.
                  </p>
                </div>
              )}

              {sqAvailable ? (
                <div className="skills-install-section">
                  <div className="mcp-section-label">Install a Skill</div>
                  <div className="skills-install-row">
                    <input
                      className="mcp-input"
                      placeholder="Skill name (e.g. slack, linear, gdrive)"
                      value={installName}
                      onChange={(e) => setInstallName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleInstall(); }}
                      disabled={installing}
                    />
                    <button
                      className="mcp-add-btn"
                      onClick={handleInstall}
                      disabled={!installName.trim() || installing}
                    >
                      {installing ? "Installing..." : "Install"}
                    </button>
                  </div>
                  <p className="skills-install-hint">
                    Browse available skills at your organization's Skills Marketplace, then enter the name here.
                  </p>
                </div>
              ) : (
                <div className="skills-no-cli">
                  <p>
                    The <code>sq</code> CLI is not available. Skills detected from the current session are shown above.
                  </p>
                  <p>
                    To install and manage skills, set up the <code>sq</code> CLI and run <code>sq agents skills add &lt;name&gt;</code>.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
