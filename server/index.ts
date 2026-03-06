import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import * as store from "./conversation-store.js";
import * as sessionManager from "./session-manager.js";
import { ChatMessage } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json());

// List conversations
app.get("/api/conversations", (_req, res) => {
  res.json(store.listConversations());
});

// Create conversation
app.post("/api/conversations", (req, res) => {
  const { title, cwd } = req.body;
  const id = randomUUID();
  const file = store.createConversation(
    id,
    title || "New Chat",
    cwd || process.cwd(),
  );
  res.json(file.conversation);
});

// Delete conversation
app.delete("/api/conversations/:id", (req, res) => {
  sessionManager.removeSession(req.params.id);
  store.deleteConversation(req.params.id);
  res.json({ ok: true });
});

// Get messages
app.get("/api/conversations/:id/messages", (req, res) => {
  const file = store.getConversation(req.params.id);
  if (!file) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(file.messages);
});

// SSE stream
app.get("/api/conversations/:id/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const convFile = store.getConversation(req.params.id);
  if (!convFile) {
    res.write(
      `data: ${JSON.stringify({ type: "error", data: { message: "Conversation not found" } })}\n\n`,
    );
    res.end();
    return;
  }

  const session = sessionManager.getOrCreateSession(
    req.params.id,
    convFile.conversation.cwd,
    convFile.conversation.sdkSessionId,
  );

  const onEvent = (event: { type: string; data: unknown }) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    // Persist session ID
    if (
      event.type === "init" &&
      typeof event.data === "object" &&
      event.data !== null &&
      "sessionId" in event.data
    ) {
      store.updateConversation(req.params.id, {
        sdkSessionId: (event.data as { sessionId: string }).sessionId,
      });
    }
  };

  session.events.on("event", onEvent);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  // Send connected event
  res.write(`data: ${JSON.stringify({ type: "connected", data: {} })}\n\n`);

  req.on("close", () => {
    session.events.off("event", onEvent);
    clearInterval(heartbeat);
  });
});

// Send message
app.post("/api/conversations/:id/messages", (req, res) => {
  const { content } = req.body;
  const convFile = store.getConversation(req.params.id);
  if (!convFile) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
  store.addMessage(req.params.id, userMsg);

  const session = sessionManager.getOrCreateSession(
    req.params.id,
    convFile.conversation.cwd,
    convFile.conversation.sdkSessionId,
  );

  // Run agent in background — events stream via SSE
  session.sendMessage(content).then(({ text, toolCalls }) => {
    if (text) {
      const assistantMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: new Date().toISOString(),
      };
      store.addMessage(req.params.id, assistantMsg);
    }
  });

  res.json({ ok: true, message: userMsg });
});

// Abort
app.post("/api/conversations/:id/abort", (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (session) session.abort();
  res.json({ ok: true });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Claude Code GUI server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  sessionManager.closeAllSessions();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  sessionManager.closeAllSessions();
  process.exit(0);
});
