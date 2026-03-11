import { AgentSession } from "./agent-session.js";
import { MCPServerConfig, AgentConfig } from "./types.js";

const sessions = new Map<string, AgentSession>();

export function getOrCreateSession(
  conversationId: string,
  cwd: string,
  model: string,
  sessionId?: string,
  systemPrompt?: string,
  mcpServers?: MCPServerConfig[],
  customAgents?: AgentConfig[],
): AgentSession {
  let session = sessions.get(conversationId);
  if (!session) {
    session = new AgentSession(conversationId, cwd, model, sessionId, systemPrompt, mcpServers, customAgents);
    sessions.set(conversationId, session);
  }
  return session;
}

export function getSession(
  conversationId: string,
): AgentSession | undefined {
  return sessions.get(conversationId);
}

export function removeSession(conversationId: string): void {
  const session = sessions.get(conversationId);
  if (session) {
    session.abort();
    sessions.delete(conversationId);
  }
}

export function closeAllSessions(): void {
  for (const [id, session] of sessions) {
    session.abort();
    sessions.delete(id);
  }
}
