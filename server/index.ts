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
    const prompt = [
      "INSTRUCTION: Output ONLY a 3-6 word title. No explanation, no quotes, no preamble. Just the title itself.",
      "",
      `User message: ${userMessage.slice(0, 200)}`,
      `Assistant response: ${assistantMessage.slice(0, 200)}`,
      "",
      "Title:",
    ].join("\n");

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

    let title = resultText.trim();
    title = title.replace(/^["']|["']$/g, "");
    title = title.replace(/^(here'?s?\s*(a\s*)?|title:\s*|sure[,!]?\s*)/i, "");
    title = title.split("\n")[0].trim();
    if (title.length > 60) title = title.slice(0, 57) + "...";

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

// Search conversations (title + message content)
app.get("/api/conversations/search", (req, res) => {
  const q = ((req.query.q as string) || "").toLowerCase().trim();
  if (!q) {
    res.json([]);
    return;
  }

  const DATA_DIR = path.join(process.cwd(), "data", "conversations");
  if (!fs.existsSync(DATA_DIR)) {
    res.json([]);
    return;
  }

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const results: {
    conversation: { id: string; title: string; cwd: string; model: string; updatedAt: string; [key: string]: unknown };
    matchType: "title" | "message";
    matchContext?: string;
  }[] = [];

  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"));
      const conv = data.conversation;
      const messages = data.messages || [];

      const titleMatch = conv.title?.toLowerCase().includes(q);
      let messageMatch = false;
      let matchContext = "";

      if (!titleMatch) {
        for (const msg of messages) {
          const idx = (msg.content || "").toLowerCase().indexOf(q);
          if (idx !== -1) {
            messageMatch = true;
            const start = Math.max(0, idx - 30);
            const end = Math.min(msg.content.length, idx + q.length + 30);
            matchContext = (start > 0 ? "…" : "") + msg.content.slice(start, end) + (end < msg.content.length ? "…" : "");
            break;
          }
        }
      }

      if (titleMatch || messageMatch) {
        results.push({
          conversation: conv,
          matchType: titleMatch ? "title" : "message",
          matchContext: messageMatch ? matchContext : undefined,
        });
      }
    } catch { /* skip corrupt files */ }

    if (results.length >= 20) break;
  }

  results.sort((a, b) =>
    new Date(b.conversation.updatedAt).getTime() - new Date(a.conversation.updatedAt).getTime()
  );
  res.json(results);
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
  res.json({
    messages: file.messages,
    lastTurnInputTokens: file.conversation.lastTurnInputTokens ?? 0,
  });
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
    session.abort();
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
  session.sendMessage(content, images).then(async ({ text, toolCalls, tokenUsage }) => {
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

    // Accumulate token usage and emit context window utilization
    if (tokenUsage && (tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0)) {
      const current = store.getConversation(req.params.id);
      const prev = current?.conversation.tokenUsage;
      store.updateConversation(req.params.id, {
        tokenUsage: {
          inputTokens: (prev?.inputTokens || 0) + tokenUsage.inputTokens,
          outputTokens: (prev?.outputTokens || 0) + tokenUsage.outputTokens,
          estimatedCost: (prev?.estimatedCost || 0) + tokenUsage.estimatedCost,
        },
        lastTurnInputTokens: tokenUsage.inputTokens,
      });

      // Emit per-turn input tokens so frontend can detect context window pressure
      session.events.emit("event", {
        type: "context_usage",
        data: { inputTokens: tokenUsage.inputTokens },
      });
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

// Clear conversation context
app.post("/api/conversations/:id/clear", (req, res) => {
  const convFile = store.getConversation(req.params.id);
  if (!convFile) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  sessionManager.removeSession(req.params.id);
  store.updateConversation(req.params.id, { sdkSessionId: undefined });

  const file = store.getConversation(req.params.id);
  if (file) {
    file.messages = [];
    const fp = path.join(process.cwd(), "data", "conversations", `${req.params.id}.json`);
    fs.writeFileSync(fp, JSON.stringify(file, null, 2));
  }

  res.json({ ok: true });
});

// Compact conversation context
app.post("/api/conversations/:id/compact", async (req, res) => {
  const convFile = store.getConversation(req.params.id);
  if (!convFile) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const session = sessionManager.getOrCreateSession(
    req.params.id,
    convFile.conversation.cwd,
    convFile.conversation.model || DEFAULT_MODEL,
    convFile.conversation.sdkSessionId,
  );

  try {
    const { text } = await session.sendMessage(
      "Please provide a concise summary of our entire conversation so far. Include all key decisions, file changes, and current state. This summary will be used to compact the conversation context.",
    );

    sessionManager.removeSession(req.params.id);
    store.updateConversation(req.params.id, { sdkSessionId: undefined });

    const file = store.getConversation(req.params.id);
    if (file) {
      const now = new Date().toISOString();
      file.messages = [
        {
          id: randomUUID(),
          role: "assistant",
          content: `**Context Summary (compacted):**\n\n${text}`,
          timestamp: now,
        },
      ];
      const fp = path.join(process.cwd(), "data", "conversations", `${req.params.id}.json`);
      fs.writeFileSync(fp, JSON.stringify(file, null, 2));
    }

    res.json({ ok: true, summary: text });
  } catch (err) {
    console.error("Compact failed:", err);
    res.status(500).json({ error: "Failed to compact conversation" });
  }
});

// Export conversation
app.get("/api/conversations/:id/export", (req, res) => {
  const file = store.getConversation(req.params.id);
  if (!file) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const format = (req.query.format as string) || "json";
  const safeTitle = file.conversation.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);

  if (format === "md") {
    const lines: string[] = [];
    lines.push(`# ${file.conversation.title}\n`);
    lines.push(`**Model:** ${file.conversation.model}`);
    lines.push(`**Workspace:** ${file.conversation.cwd}`);
    lines.push(`**Created:** ${new Date(file.conversation.createdAt).toLocaleString()}`);
    lines.push(`**Updated:** ${new Date(file.conversation.updatedAt).toLocaleString()}`);
    if (file.conversation.tokenUsage) {
      const u = file.conversation.tokenUsage;
      lines.push(`**Tokens:** ${u.inputTokens.toLocaleString()} in / ${u.outputTokens.toLocaleString()} out (~$${u.estimatedCost.toFixed(2)})`);
    }
    lines.push("\n---\n");

    for (const msg of file.messages) {
      const role = msg.role === "user" ? "You" : "Claude";
      lines.push(`## ${role}\n`);
      lines.push(msg.content);
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        lines.push("");
        for (const tc of msg.toolCalls) {
          lines.push(`<details><summary>Tool: ${tc.name}</summary>\n`);
          lines.push("```json");
          lines.push(JSON.stringify(tc.input, null, 2));
          lines.push("```");
          if (tc.output) {
            lines.push("\n**Output:**\n");
            lines.push("```");
            lines.push(tc.output.slice(0, 2000));
            lines.push("```");
          }
          lines.push("</details>");
        }
      }
      lines.push("");
    }

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.md"`);
    res.send(lines.join("\n"));
  } else {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.json"`);
    res.send(JSON.stringify(file, null, 2));
  }
});

// Share conversation (create a read-only snapshot)
const SHARED_DIR = path.join(process.cwd(), "data", "shared");
function ensureSharedDir() {
  fs.mkdirSync(SHARED_DIR, { recursive: true });
}

app.post("/api/conversations/:id/share", (req, res) => {
  const file = store.getConversation(req.params.id);
  if (!file) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  ensureSharedDir();
  const token = randomUUID().replace(/-/g, "").slice(0, 12);
  const snapshot = {
    token,
    title: file.conversation.title,
    model: file.conversation.model,
    cwd: file.conversation.cwd,
    createdAt: file.conversation.createdAt,
    sharedAt: new Date().toISOString(),
    messages: file.messages.map((m) => ({
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      timestamp: m.timestamp,
    })),
  };
  fs.writeFileSync(
    path.join(SHARED_DIR, `${token}.json`),
    JSON.stringify(snapshot, null, 2),
  );

  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  const shareUrl = `${protocol}://${host}/shared/${token}`;

  res.json({ token, url: shareUrl });
});

app.get("/shared/:token", (req, res) => {
  ensureSharedDir();
  const fp = path.join(SHARED_DIR, `${req.params.token}.json`);
  if (!fs.existsSync(fp)) {
    res.status(404).send("Shared conversation not found.");
    return;
  }

  const snapshot = JSON.parse(fs.readFileSync(fp, "utf-8"));

  const messagesHtml = snapshot.messages
    .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
    .map((m: { role: string; content: string; toolCalls?: { name: string; input: Record<string, unknown>; output?: string }[]; timestamp: string }) => {
      const isUser = m.role === "user";
      const avatar = isUser
        ? `<div class="avatar user-av">You</div>`
        : `<div class="avatar claude-av">C</div>`;
      const escapedContent = escapeHtml(m.content);
      const time = new Date(m.timestamp).toLocaleString();

      let toolsHtml = "";
      if (m.toolCalls && m.toolCalls.length > 0) {
        toolsHtml = m.toolCalls.map((tc) => {
          const inputStr = escapeHtml(JSON.stringify(tc.input, null, 2));
          const outputStr = tc.output ? escapeHtml(tc.output.slice(0, 2000)) : "";
          return `<details class="tool-detail"><summary>Tool: ${escapeHtml(tc.name)}</summary><pre>${inputStr}</pre>${outputStr ? `<p class="tool-out-label">Output:</p><pre>${outputStr}</pre>` : ""}</details>`;
        }).join("");
      }

      return `<div class="msg ${isUser ? "msg-user" : "msg-assistant"}">${avatar}<div class="msg-body"><div class="msg-content">${escapedContent}</div>${toolsHtml}<div class="msg-time">${time}</div></div></div>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(snapshot.title)} — Shared</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0d1117;color:#e6edf3;line-height:1.6}
.container{max-width:780px;margin:0 auto;padding:24px 20px 60px}
header{border-bottom:1px solid #30363d;padding-bottom:16px;margin-bottom:24px}
h1{font-size:1.4rem;font-weight:600;color:#f0f6fc}
.meta{font-size:0.82rem;color:#8b949e;margin-top:6px;display:flex;gap:16px;flex-wrap:wrap}
.msg{display:flex;gap:12px;margin-bottom:20px}
.avatar{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0}
.user-av{background:#1f6feb;color:#fff}
.claude-av{background:#da7756;color:#fff}
.msg-body{flex:1;min-width:0}
.msg-content{white-space:pre-wrap;word-break:break-word;font-size:0.92rem}
.msg-user .msg-content{color:#e6edf3}
.msg-assistant .msg-content{color:#c9d1d9}
.msg-time{font-size:0.72rem;color:#484f58;margin-top:4px}
.tool-detail{margin:8px 0;border:1px solid #30363d;border-radius:6px;font-size:0.82rem}
.tool-detail summary{padding:6px 10px;cursor:pointer;color:#8b949e;font-weight:500}
.tool-detail pre{padding:10px;background:#161b22;border-radius:0 0 6px 6px;overflow-x:auto;font-size:0.78rem;color:#8b949e;max-height:200px;overflow-y:auto}
.tool-out-label{padding:6px 10px 0;font-size:0.78rem;color:#8b949e;font-weight:600}
.badge{display:inline-block;background:#30363d;padding:2px 8px;border-radius:10px;font-size:0.75rem;color:#8b949e}
</style>
</head>
<body>
<div class="container">
<header>
  <h1>${escapeHtml(snapshot.title)}</h1>
  <div class="meta">
    <span class="badge">${escapeHtml(snapshot.model)}</span>
    <span>Shared ${new Date(snapshot.sharedAt).toLocaleDateString()}</span>
  </div>
</header>
${messagesHtml}
</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Usage endpoint
app.get("/api/usage", (req, res) => {
  const scope = (req.query.scope as string) || "conversation";
  const convId = req.query.id as string | undefined;

  if (scope === "conversation") {
    if (!convId) {
      res.status(400).json({ error: "Missing conversation id" });
      return;
    }
    const file = store.getConversation(convId);
    if (!file) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const usage = file.conversation.tokenUsage || { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
    res.json(usage);
    return;
  }

  const daysParam = req.query.days as string | undefined;
  const days = daysParam ? parseInt(daysParam, 10) : (scope === "week" ? 7 : 30);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const all = store.listConversations();

  const totals = { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
  for (const conv of all) {
    if (new Date(conv.updatedAt).getTime() >= cutoff && conv.tokenUsage) {
      totals.inputTokens += conv.tokenUsage.inputTokens;
      totals.outputTokens += conv.tokenUsage.outputTokens;
      totals.estimatedCost += conv.tokenUsage.estimatedCost;
    }
  }
  res.json(totals);
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
