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

export function MCPConfigPanel({ cwd, onClose }: MCPConfigPanelProps) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "sse">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");

  const loadServers = useCallback(() => {
    apiFetch(`/api/mcp-servers?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then(setServers)
      .catch(() => setServers([]))
      .finally(() => setLoading(false));
  }, [cwd]);

  useEffect(() => { loadServers(); }, [loadServers]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    const server: MCPServer = {
      id: crypto.randomUUID(),
      name: name.trim(),
      transport,
      ...(transport === "stdio"
        ? { command: command.trim(), args: args.trim() ? args.split(/\s+/) : [] }
        : { url: url.trim() }),
    };
    try {
      const res = await apiFetch("/api/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, server }),
      });
      const data = await res.json();
      setServers(data);
      setShowForm(false);
      setName("");
      setCommand("");
      setArgs("");
      setUrl("");
    } catch { /* ignore */ }
  };

  const handleDelete = async (serverId: string) => {
    try {
      const res = await apiFetch(`/api/mcp-servers/${serverId}?cwd=${encodeURIComponent(cwd)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      setServers(data);
    } catch { /* ignore */ }
  };

  return (
    <div className="mcp-overlay" onClick={onClose}>
      <div className="mcp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mcp-header">
          <h3>MCP Servers</h3>
          <button className="mcp-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="mcp-body">
          {loading ? (
            <div className="mcp-loading">Loading...</div>
          ) : servers.length === 0 && !showForm ? (
            <div className="mcp-empty">No MCP servers configured for this workspace.</div>
          ) : (
            <div className="mcp-list">
              {servers.map((s) => (
                <div key={s.id} className="mcp-server-item">
                  <div className="mcp-server-info">
                    <span className="mcp-server-name">{s.name}</span>
                    <span className="mcp-server-transport">{s.transport}</span>
                    <span className="mcp-server-detail">
                      {s.transport === "stdio" ? `${s.command} ${(s.args || []).join(" ")}` : s.url}
                    </span>
                  </div>
                  <button className="mcp-delete-btn" onClick={() => handleDelete(s.id)}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          {showForm ? (
            <div className="mcp-form">
              <input
                className="mcp-input"
                placeholder="Server name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <div className="mcp-transport-toggle">
                <button
                  className={`mcp-transport-btn ${transport === "stdio" ? "active" : ""}`}
                  onClick={() => setTransport("stdio")}
                >stdio</button>
                <button
                  className={`mcp-transport-btn ${transport === "sse" ? "active" : ""}`}
                  onClick={() => setTransport("sse")}
                >SSE</button>
              </div>
              {transport === "stdio" ? (
                <>
                  <input
                    className="mcp-input"
                    placeholder="Command (e.g. npx)"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                  />
                  <input
                    className="mcp-input"
                    placeholder="Args (space-separated)"
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                  />
                </>
              ) : (
                <input
                  className="mcp-input"
                  placeholder="URL (e.g. http://localhost:3000/sse)"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              )}
              <div className="mcp-form-actions">
                <button className="mcp-cancel-btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="mcp-add-btn" onClick={handleAdd} disabled={!name.trim()}>Add Server</button>
              </div>
            </div>
          ) : (
            <button className="mcp-add-trigger" onClick={() => setShowForm(true)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Add MCP Server
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
