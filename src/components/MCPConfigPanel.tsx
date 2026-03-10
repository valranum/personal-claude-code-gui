import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../utils/api";

interface MCPServer {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

interface MCPConfigPanelProps {
  cwd: string;
  onClose: () => void;
}

interface CuratedServer {
  name: string;
  description: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  envKey?: string;
  envKeyLabel?: string;
  icon: React.ReactNode;
}

const CURATED_SERVERS: CuratedServer[] = [
  {
    name: "Figma",
    description: "Access your Figma designs and components",
    transport: "sse",
    url: "https://mcp.figma.com/sse",
    envKey: "FIGMA_API_KEY",
    envKeyLabel: "Figma API Key",
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <rect x="4" y="1" width="4" height="5" rx="2" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="8" y="1" width="4" height="5" rx="2" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="4" y="5.5" width="4" height="5" rx="2" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="8" y="5.5" width="4" height="5" rx="2" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="4" y="10" width="4" height="5" rx="2" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    name: "GitHub",
    description: "Browse repos, issues, and pull requests",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envKey: "GITHUB_PERSONAL_ACCESS_TOKEN",
    envKeyLabel: "GitHub Personal Access Token",
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <path d="M8 1C4.13 1 1 4.13 1 8C1 11.1 3.05 13.7 5.86 14.6C6.23 14.67 6.36 14.44 6.36 14.24V13.04C4.42 13.47 3.99 12.16 3.99 12.16C3.65 11.37 3.17 11.14 3.17 11.14C2.49 10.68 3.22 10.69 3.22 10.69C3.97 10.74 4.36 11.46 4.36 11.46C5.04 12.6 6.14 12.3 6.38 12.1C6.45 11.6 6.65 11.26 6.87 11.1C5.34 10.94 3.73 10.33 3.73 7.72C3.73 6.97 4.01 6.37 4.37 5.9C4.29 5.73 4.04 5.04 4.45 4.1C4.45 4.1 5.09 3.92 6.35 4.8C6.97 4.64 7.49 4.56 8 4.56C8.51 4.56 9.03 4.64 9.65 4.8C10.91 3.92 11.55 4.1 11.55 4.1C11.96 5.04 11.71 5.73 11.63 5.9C12 6.37 12.27 6.97 12.27 7.72C12.27 10.34 10.66 10.94 9.12 11.1C9.39 11.33 9.64 11.78 9.64 12.47V14.24C9.64 14.44 9.77 14.68 10.15 14.6C12.95 13.7 15 11.1 15 8C15 4.13 11.87 1 8 1Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    name: "Notion",
    description: "Read and edit your Notion pages and databases",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    envKey: "NOTION_API_KEY",
    envKeyLabel: "Notion Integration Token",
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="2" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M5.5 5H10.5M5.5 7.5H10.5M5.5 10H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    name: "Filesystem",
    description: "Read and write files outside this project",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6L7.5 5H12.5C13.33 5 14 5.67 14 6.5V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    name: "Memory",
    description: "Persistent memory across conversations",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M6 5H10M6 7.5H10M6 10H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export function MCPConfigPanel({ cwd, onClose }: MCPConfigPanelProps) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKeyPrompt, setApiKeyPrompt] = useState<CuratedServer | null>(null);
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customTransport, setCustomTransport] = useState<"stdio" | "sse">("stdio");
  const [customCommand, setCustomCommand] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const loadServers = useCallback(() => {
    apiFetch(`/api/mcp-servers?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((data) => setServers(Array.isArray(data) ? data : []))
      .catch(() => setServers([]))
      .finally(() => setLoading(false));
  }, [cwd]);

  useEffect(() => { loadServers(); }, [loadServers]);

  const addServer = async (server: MCPServer) => {
    try {
      const res = await apiFetch("/api/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, server }),
      });
      const data = await res.json();
      setServers(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  };

  const handleDelete = async (serverId: string) => {
    try {
      const res = await apiFetch(`/api/mcp-servers/${serverId}?cwd=${encodeURIComponent(cwd)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      setServers(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  };

  const handleCuratedClick = (curated: CuratedServer) => {
    setApiKeyPrompt(curated);
    setApiKeyValue("");
  };

  const installCurated = (curated: CuratedServer, envValue?: string) => {
    const server: MCPServer = {
      id: crypto.randomUUID(),
      name: curated.name,
      transport: curated.transport,
      command: curated.command,
      args: curated.args,
      url: curated.url,
      ...(curated.envKey && envValue
        ? { env: { [curated.envKey]: envValue } }
        : {}),
    };
    addServer(server);
    setApiKeyPrompt(null);
    setApiKeyValue("");
  };

  const handleCustomAdd = () => {
    if (!customName.trim()) return;
    const server: MCPServer = {
      id: crypto.randomUUID(),
      name: customName.trim(),
      transport: customTransport,
      ...(customTransport === "stdio"
        ? { command: customCommand.trim(), args: customArgs.trim() ? customArgs.split(/\s+/) : [] }
        : { url: customUrl.trim() }),
    };
    addServer(server);
    setShowCustom(false);
    setCustomName("");
    setCustomCommand("");
    setCustomArgs("");
    setCustomUrl("");
  };

  const installedNames = new Set(servers.map((s) => s.name));

  return (
    <div className="mcp-overlay" onClick={onClose}>
      <div className="mcp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mcp-header">
          <div>
            <h3>Integrations</h3>
            <p className="mcp-subtitle">Connect tools and services to enhance Claude.</p>
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
              {servers.length > 0 && (
                <div className="mcp-installed-section">
                  <div className="mcp-section-label">Installed</div>
                  <div className="mcp-installed-list">
                    {servers.map((s) => (
                      <div key={s.id} className="mcp-installed-item">
                        <div className="mcp-installed-icon">
                          {CURATED_SERVERS.find((c) => c.name === s.name)?.icon || (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                              <path d="M5 8H11M8 5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                            </svg>
                          )}
                        </div>
                        <div className="mcp-installed-info">
                          <span className="mcp-installed-name">{s.name}</span>
                          {CURATED_SERVERS.find((c) => c.name === s.name)?.description && (
                            <span className="mcp-installed-desc">{CURATED_SERVERS.find((c) => c.name === s.name)!.description}</span>
                          )}
                        </div>
                        <button className="mcp-remove-btn" onClick={() => handleDelete(s.id)} title="Remove">
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {apiKeyPrompt ? (
                <div className="mcp-confirm-section">
                  <div className="mcp-confirm-card">
                    <div className="mcp-confirm-icon">{apiKeyPrompt.icon}</div>
                    <div className="mcp-confirm-info">
                      <span className="mcp-confirm-name">{apiKeyPrompt.name}</span>
                      <span className="mcp-confirm-desc">{apiKeyPrompt.description}</span>
                    </div>
                  </div>
                  {apiKeyPrompt.envKey && (
                    <>
                      <p className="mcp-apikey-hint">
                        {apiKeyPrompt.name} requires an API key to connect.
                      </p>
                      <input
                        className="mcp-input"
                        type="password"
                        placeholder={apiKeyPrompt.envKeyLabel || "API Key"}
                        value={apiKeyValue}
                        onChange={(e) => setApiKeyValue(e.target.value)}
                        autoFocus
                      />
                    </>
                  )}
                  <div className="mcp-form-actions">
                    <button className="mcp-cancel-btn" onClick={() => setApiKeyPrompt(null)}>Cancel</button>
                    <button
                      className="mcp-add-btn"
                      onClick={() => installCurated(apiKeyPrompt, apiKeyValue || undefined)}
                      disabled={!!apiKeyPrompt.envKey && !apiKeyValue.trim()}
                    >
                      Connect
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mcp-section-label">Available</div>
                  <div className="mcp-gallery">
                    {CURATED_SERVERS.filter((c) => !installedNames.has(c.name)).map((curated) => (
                      <button
                        key={curated.name}
                        className="mcp-gallery-card"
                        onClick={() => handleCuratedClick(curated)}
                      >
                        <div className="mcp-gallery-icon">{curated.icon}</div>
                        <div className="mcp-gallery-info">
                          <span className="mcp-gallery-name">{curated.name}</span>
                          <span className="mcp-gallery-desc">{curated.description}</span>
                        </div>
                        <svg className="mcp-gallery-add" width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    ))}
                  </div>

                  {showCustom ? (
                    <div className="mcp-custom-form">
                      <div className="mcp-section-label">Custom Server</div>
                      <input
                        className="mcp-input"
                        placeholder="Server name"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        autoFocus
                      />
                      <div className="mcp-transport-toggle">
                        <button
                          className={`mcp-transport-btn ${customTransport === "stdio" ? "active" : ""}`}
                          onClick={() => setCustomTransport("stdio")}
                        >Command</button>
                        <button
                          className={`mcp-transport-btn ${customTransport === "sse" ? "active" : ""}`}
                          onClick={() => setCustomTransport("sse")}
                        >URL</button>
                      </div>
                      {customTransport === "stdio" ? (
                        <>
                          <input
                            className="mcp-input"
                            placeholder="Command (e.g. npx)"
                            value={customCommand}
                            onChange={(e) => setCustomCommand(e.target.value)}
                          />
                          <input
                            className="mcp-input"
                            placeholder="Arguments (e.g. -y @my/server)"
                            value={customArgs}
                            onChange={(e) => setCustomArgs(e.target.value)}
                          />
                        </>
                      ) : (
                        <input
                          className="mcp-input"
                          placeholder="Server URL (e.g. http://localhost:3000/sse)"
                          value={customUrl}
                          onChange={(e) => setCustomUrl(e.target.value)}
                        />
                      )}
                      <div className="mcp-form-actions">
                        <button className="mcp-cancel-btn" onClick={() => setShowCustom(false)}>Cancel</button>
                        <button className="mcp-add-btn" onClick={handleCustomAdd} disabled={!customName.trim()}>Add</button>
                      </div>
                    </div>
                  ) : (
                    <button className="mcp-custom-trigger" onClick={() => setShowCustom(true)}>
                      Or add a custom server...
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
