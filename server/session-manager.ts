import { AgentSession } from "./agent-session.js";

const sessions = new Map<string, AgentSession>();

export function getOrCreateSession(
  conversationId: string,
  cwd: string,
  model: string,
  sessionId?: string,
): AgentSession {
  let session = sessions.get(conversationId);
  if (!session) {
    session = new AgentSession(conversationId, cwd, model, sessionId);
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
