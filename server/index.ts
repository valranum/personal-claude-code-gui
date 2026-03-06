import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import * as store from "./conversation-store.js";
import * as sessionManager from "./session-manager.js";
import { ChatMessage, ImageAttachment } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const DEFAULT_MODEL = "claude-opus-4-6";

const AVAILABLE_MODELS = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
];

async function generateTitle(
  userMessage: string,
  assistantMessage: string,
): Promise<string> {
  try {
    const prompt = `Generate a very short title (3-6 words, no quotes) summarizing this conversation:\n\nUser: ${userMessage.slice(0, 300)}\nAssistant: ${assistantMessage.slice(0, 300)}`;
    let resultText = "";
    for await (const msg of query({
      prompt,
      options: {
        model: "claude-haiku-4-5-20251001",
        allowedTools: [],
        maxTurns: 1,
      },
    })) {
      const m = msg as Record<string, unknown>;
      if ("result" in m && typeof m.result === "string") {
        resultText = m.result;
        break;
      }
    }
    const title = resultText.trim().replace(/^["']|["']$/g, "");
    return title || userMessage.slice(0, 50);
  } catch (err) {
    console.error("Title generation failed:", err);
    return userMessage.slice(0, 50);
  }
}

// Browse directories for folder picker autocomplete
app.get("/api/browse", (req, res) => {
  const rawPath = (req.query.path as string) || os.homedir();
  const resolved = rawPath.startsWith("~")
    ? path.join(os.homedir(), rawPath.slice(1))
    : path.resolve(rawPath);

  // If the path ends with a separator or is a directory, list its contents.
  // Otherwise treat it as a partial name and list the parent filtered by prefix.
  let dirToList: string;
  let prefix = "";

  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      dirToList = resolved;
    } else {
      dirToList = path.dirname(resolved);
      prefix = path.basename(resolved).toLowerCase();
    }

    const entries = fs.readdirSync(dirToList, { withFileTypes: true });
    const dirs = entries
      .filter((e) => {
        if (!e.isDirectory()) return false;
        if (e.name.startsWith(".")) return false;
        if (prefix && !e.name.toLowerCase().startsWith(prefix)) return false;
        return true;
      })
      .slice(0, 50)
      .map((e) => ({
        name: e.name,
        path: path.join(dirToList, e.name),
      }));

    res.json({ parent: dirToList, dirs });
  } catch {
    res.json({ parent: resolved, dirs: [] });
  }
});

// Native OS folder picker dialog
app.post("/api/pick-folder", (_req, res) => {
  const script =
    'set f to POSIX path of (choose folder with prompt "Choose a project folder")\nreturn f';
  execFile("osascript", ["-e", script], (err, stdout) => {
    if (err) {
      res.json({ cancelled: true, path: null });
      return;
    }
    const picked = stdout.trim().replace(/\/$/, "");
    res.json({ cancelled: false, path: picked });
  });
});

// Available models
app.get("/api/models", (_req, res) => {
  res.json({ models: AVAILABLE_MODELS, default: DEFAULT_MODEL });
});

// List conversations
app.get("/api/conversations", (_req, res) => {
  res.json(store.listConversations());
});

// Create conversation
app.post("/api/conversations", (req, res) => {
  const { title, cwd, model } = req.body;
  const id = randomUUID();
  const file = store.createConversation(
    id,
    title || "New Chat",
    cwd || process.cwd(),
    model || DEFAULT_MODEL,
  );
  res.json(file.conversation);
});

// Update conversation (rename, change cwd, change model, etc.)
app.patch("/api/conversations/:id", (req, res) => {
  const { title, cwd, model } = req.body;
  const conv = store.getConversation(req.params.id);
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const updates: Record<string, string> = {};
  if (title !== undefined) updates.title = title;
  if (cwd !== undefined) updates.cwd = cwd;
  if (model !== undefined) updates.model = model;
  // Reset session if cwd or model changed so it picks up new settings
  if (cwd !== undefined || model !== undefined) {
    sessionManager.removeSession(req.params.id);
  }
  if (Object.keys(updates).length > 0) {
    store.updateConversation(req.params.id, updates);
  }
  const updated = store.getConversation(req.params.id);
  res.json(updated!.conversation);
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
    convFile.conversation.model || DEFAULT_MODEL,
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
  const { content, images } = req.body as {
    content: string;
    images?: ImageAttachment[];
  };
  const convFile = store.getConversation(req.params.id);
  if (!convFile) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content,
    images: images && images.length > 0 ? images : undefined,
    timestamp: new Date().toISOString(),
  };
  store.addMessage(req.params.id, userMsg);

  const session = sessionManager.getOrCreateSession(
    req.params.id,
    convFile.conversation.cwd,
    convFile.conversation.model || DEFAULT_MODEL,
    convFile.conversation.sdkSessionId,
  );

  const isFirstMessage =
    convFile.messages.filter((m) => m.role === "user").length === 0;

  // Run agent in background — events stream via SSE
  session.sendMessage(content, images).then(async ({ text, toolCalls }) => {
    if (text) {
      const assistantMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: new Date().toISOString(),
      };
      store.addMessage(req.params.id, assistantMsg);

      // Auto-generate title after first exchange
      if (isFirstMessage) {
        const title = await generateTitle(content, text);
        store.updateConversation(req.params.id, { title });
        session.events.emit("event", {
          type: "title_updated",
          data: { title },
        });
      }
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
