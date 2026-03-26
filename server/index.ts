import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import net from "net";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile, execFileSync } from "child_process";
import { randomUUID, randomBytes } from "crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import * as store from "./conversation-store.js";
import * as sessionManager from "./session-manager.js";
import { ChatMessage, ImageAttachment, MCPServerConfig, AgentConfig, ScheduledTask, WorkflowState, WorkflowPhase } from "./types.js";
import * as workspaceConfig from "./workspace-config.js";
import * as scheduleStore from "./schedule-store.js";
import { startScheduler, computeNextRun, onSchedulerEvent, offSchedulerEvent } from "./scheduler.js";

const app = express();

const AUTH_TOKEN = randomBytes(32).toString("hex");
const HOME_DIR = os.homedir();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARE_TOKEN_RE = /^[0-9a-f]{32}$/i;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function isPathWithinHome(resolved: string): boolean {
  return resolved === HOME_DIR || resolved.startsWith(HOME_DIR + path.sep);
}

function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);
app.use(express.json({ limit: "10mb" }));

const messageLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api/conversations/:id/messages", messageLimiter);

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api", generalLimiter);

app.get("/api/auth/session", (_req, res) => {
  res.json({ token: AUTH_TOKEN });
});

app.use("/api", (req, res, next) => {
  if (req.path === "/auth/session") return next();

  const bearer = req.headers.authorization?.replace("Bearer ", "");
  const queryToken = req.query.token as string | undefined;

  if (bearer === AUTH_TOKEN || queryToken === AUTH_TOKEN) {
    return next();
  }

  res.status(401).json({ error: "Unauthorized" });
});

const DEFAULT_MODEL = "claude-opus-4-6";

const DEFAULT_SYSTEM_PROMPT = `You are Claude, a helpful AI assistant. You can help with a wide range of tasks — answering questions, brainstorming ideas, writing, research, analysis, and general conversation — in addition to reading, writing, and editing code. Treat every question as valid and worth answering, whether it's about code or not. Be friendly, clear, and concise.

You have access to web search and web fetch tools. When a user asks about current events, weather, live data, recent news, or anything that requires up-to-date information, use the WebSearch tool to look it up. Never say you can't access the internet — you can. Always try to find the answer.`;

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
  const rawPath = (req.query.path as string) || HOME_DIR;
  const resolved = rawPath.startsWith("~")
    ? path.join(HOME_DIR, rawPath.slice(1))
    : path.resolve(rawPath);

  if (!isPathWithinHome(resolved)) {
    res.status(403).json({ error: "Access denied: path outside home directory" });
    return;
  }

  let dirToList: string;
  let prefix = "";

  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      dirToList = resolved;
    } else {
      dirToList = path.dirname(resolved);
      prefix = path.basename(resolved).toLowerCase();
    }

    if (!isPathWithinHome(dirToList)) {
      res.status(403).json({ error: "Access denied" });
      return;
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

// File tree listing for workspace explorer
app.get("/api/filetree", (req, res) => {
  const dirPath = req.query.path as string | undefined;
  if (!dirPath) {
    res.json([]);
    return;
  }

  try {
    const resolved = path.resolve(dirPath);
    if (!isPathWithinHome(resolved)) {
      res.status(403).json({ error: "Access denied: path outside home directory" });
      return;
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const results: { name: string; path: string; type: "file" | "directory" }[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      results.push({
        name: entry.name,
        path: path.join(resolved, entry.name),
        type: entry.isDirectory() ? "directory" : "file",
      });
      if (results.length >= 100) break;
    }

    results.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json(results);
  } catch {
    res.json([]);
  }
});

// Read a single file
app.get("/api/files/read", (req, res) => {
  const filePath = req.query.path as string | undefined;
  if (!filePath) {
    res.status(400).json({ error: "path is required" });
    return;
  }
  const resolved = path.resolve(filePath);
  if (!isPathWithinHome(resolved)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  try {
    const stat = fs.statSync(resolved);
    if (stat.size > 2 * 1024 * 1024) {
      res.status(413).json({ error: "File too large (max 2MB)" });
      return;
    }
    const content = fs.readFileSync(resolved, "utf-8");
    res.json({ content, path: resolved });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// Write/save a file
app.post("/api/files/write", (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || typeof content !== "string") {
    res.status(400).json({ error: "path and content are required" });
    return;
  }
  const resolved = path.resolve(filePath);
  if (!isPathWithinHome(resolved)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  try {
    fs.writeFileSync(resolved, content, "utf-8");
    res.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Write failed";
    res.status(500).json({ error: msg });
  }
});

// Recursive file search for @mentions
app.get("/api/files/search", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  const q = ((req.query.q as string) || "").toLowerCase().trim();

  if (!cwd) {
    res.json([]);
    return;
  }

  const resolved = path.resolve(cwd);
  if (!isPathWithinHome(resolved)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".cache", "coverage", ".venv", "venv"]);
  const results: string[] = [];
  const MAX_RESULTS = 15;
  const MAX_DEPTH = 5;

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) break;
        if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
        const rel = path.relative(resolved, path.join(dir, entry.name));
        if (entry.isDirectory()) {
          if (!q || rel.toLowerCase().includes(q)) {
            results.push(rel + "/");
          }
          walk(path.join(dir, entry.name), depth + 1);
        } else if (entry.isFile()) {
          if (!q || rel.toLowerCase().includes(q)) {
            results.push(rel);
          }
        }
      }
    } catch { /* permission denied, etc */ }
  }

  walk(resolved, 0);
  res.json(results);
});

// Native OS folder picker dialog
app.post("/api/pick-folder", (_req, res) => {
  const devDir = path.join(HOME_DIR, "Development");
  const defaultDir = fs.existsSync(devDir) ? devDir : HOME_DIR;
  const sanitizedDir = defaultDir.replace(/[\\"]/g, "");
  const script = `set f to POSIX path of (choose folder with prompt "Choose a project folder" default location POSIX file "${sanitizedDir}")\nreturn f`;
  execFile("osascript", ["-e", script], (err, stdout) => {
    if (err) {
      res.json({ cancelled: true, path: null });
      return;
    }
    const picked = stdout.trim().replace(/\/$/, "");
    res.json({ cancelled: false, path: picked });
  });
});

// Detect dev server on common ports
const DEV_SERVER_PORTS = [5173, 5174, 3000, 4200, 8080, 8000, 4321];
const OWN_PORT = 3001;

async function checkPortServesHtml(port: number): Promise<boolean> {
  if (port === OWN_PORT) return false;
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 800);
      const resp = await fetch(`http://${host}:${port}`, { signal: controller.signal });
      clearTimeout(timeout);
      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("text/html")) return true;
    } catch {}
  }
  return false;
}

function detectProjectType(cwd: string): { framework: string; devScript: string | null } | null {
  try {
    const pkgPath = path.join(cwd, "package.json");
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const scripts = pkg.scripts || {};
    const devScript = scripts.dev ? "dev" : scripts.start ? "start" : scripts.serve ? "serve" : null;

    if (deps["next"]) return { framework: "Next.js", devScript };
    if (deps["nuxt"]) return { framework: "Nuxt", devScript };
    if (deps["@sveltejs/kit"]) return { framework: "SvelteKit", devScript };
    if (deps["svelte"]) return { framework: "Svelte", devScript };
    if (deps["gatsby"]) return { framework: "Gatsby", devScript };
    if (deps["astro"]) return { framework: "Astro", devScript };
    if (deps["vue"]) return { framework: "Vue", devScript };
    if (deps["react"]) return { framework: "React", devScript };
    if (deps["angular"]) return { framework: "Angular", devScript };
    if (devScript) return { framework: "Web project", devScript };
    return null;
  } catch {
    return null;
  }
}

app.get("/api/detect-dev-server", async (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  const project = cwd ? detectProjectType(cwd) : null;

  for (const port of DEV_SERVER_PORTS) {
    if (await checkPortServesHtml(port)) {
      res.json({ found: true, url: `http://localhost:${port}`, project });
      return;
    }
  }
  res.json({ found: false, url: null, project });
});

const devServerProcesses = new Map<string, { proc: ReturnType<typeof import("child_process").spawn>; port: number | null }>();

app.post("/api/start-dev-server", async (req, res) => {
  const { cwd } = req.body;
  if (!cwd || typeof cwd !== "string") {
    res.status(400).json({ error: "cwd is required" });
    return;
  }

  if (devServerProcesses.has(cwd)) {
    const existing = devServerProcesses.get(cwd)!;
    if (existing.port) {
      res.json({ url: `http://localhost:${existing.port}`, started: false });
      return;
    }
  }

  const project = detectProjectType(cwd);
  if (!project || !project.devScript) {
    res.status(400).json({ error: "No dev script found in package.json" });
    return;
  }

  const { spawn } = await import("child_process");
  const proc = spawn("npm", ["run", project.devScript], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0" },
    detached: false,
  });

  devServerProcesses.set(cwd, { proc, port: null });

  proc.on("close", () => devServerProcesses.delete(cwd));

  let resolved = false;
  const maxWait = 20_000;
  const start = Date.now();

  const pollForServer = async (): Promise<{ url: string | null }> => {
    while (Date.now() - start < maxWait) {
      for (const port of DEV_SERVER_PORTS) {
        if (await checkPortServesHtml(port)) {
          const entry = devServerProcesses.get(cwd);
          if (entry) entry.port = port;
          return { url: `http://localhost:${port}` };
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return { url: null };
  };

  try {
    const result = await pollForServer();
    resolved = true;
    if (result.url) {
      res.json({ url: result.url, started: true });
    } else {
      res.status(504).json({ error: "Dev server started but no port responded in time" });
    }
  } catch {
    if (!resolved) {
      res.status(500).json({ error: "Failed to start dev server" });
    }
  }
});

// MCP server management
app.get("/api/mcp-servers", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  if (!cwd) {
    res.json([]);
    return;
  }
  const config = workspaceConfig.getConfig(cwd);
  res.json(config.mcpServers || []);
});

app.post("/api/mcp-servers", (req, res) => {
  const { cwd, server } = req.body as { cwd: string; server: MCPServerConfig };
  if (!cwd || !server || !server.name) {
    res.status(400).json({ error: "cwd and server are required" });
    return;
  }
  const config = workspaceConfig.getConfig(cwd);
  config.mcpServers.push({ ...server, id: server.id || randomUUID() });
  workspaceConfig.saveConfig(cwd, config);
  res.json(config.mcpServers);
});

app.delete("/api/mcp-servers/:serverId", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  if (!cwd) {
    res.status(400).json({ error: "cwd is required" });
    return;
  }
  const config = workspaceConfig.getConfig(cwd);
  config.mcpServers = config.mcpServers.filter((s) => s.id !== req.params.serverId);
  workspaceConfig.saveConfig(cwd, config);
  res.json(config.mcpServers);
});

// Custom agents management
app.get("/api/agents", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  if (!cwd) {
    res.json([]);
    return;
  }
  const config = workspaceConfig.getConfig(cwd);
  res.json(config.customAgents || []);
});

app.post("/api/agents", (req, res) => {
  const { cwd, agent } = req.body as { cwd: string; agent: AgentConfig };
  if (!cwd || !agent || !agent.name || !agent.description || !agent.prompt) {
    res.status(400).json({ error: "cwd, agent name, description, and prompt are required" });
    return;
  }
  const config = workspaceConfig.getConfig(cwd);
  if (!config.customAgents) config.customAgents = [];
  config.customAgents.push({ ...agent, id: agent.id || randomUUID() });
  workspaceConfig.saveConfig(cwd, config);
  res.json(config.customAgents);
});

app.put("/api/agents/:agentId", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  const { agent } = req.body as { agent: Partial<AgentConfig> };
  if (!cwd) {
    res.status(400).json({ error: "cwd is required" });
    return;
  }
  const config = workspaceConfig.getConfig(cwd);
  if (!config.customAgents) config.customAgents = [];
  const idx = config.customAgents.findIndex((a) => a.id === req.params.agentId);
  if (idx === -1) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  config.customAgents[idx] = { ...config.customAgents[idx], ...agent };
  workspaceConfig.saveConfig(cwd, config);
  res.json(config.customAgents);
});

app.delete("/api/agents/:agentId", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  if (!cwd) {
    res.status(400).json({ error: "cwd is required" });
    return;
  }
  const config = workspaceConfig.getConfig(cwd);
  if (!config.customAgents) config.customAgents = [];
  config.customAgents = config.customAgents.filter((a) => a.id !== req.params.agentId);
  workspaceConfig.saveConfig(cwd, config);
  res.json(config.customAgents);
});

// Workspace config
app.get("/api/workspace-config", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  if (!cwd) {
    res.status(400).json({ error: "cwd is required" });
    return;
  }
  res.json(workspaceConfig.getConfig(cwd));
});

app.patch("/api/workspace-config", (req, res) => {
  const { cwd, ...updates } = req.body;
  if (!cwd) {
    res.status(400).json({ error: "cwd is required" });
    return;
  }
  const config = workspaceConfig.getConfig(cwd);
  if (updates.defaultSystemPrompt !== undefined) {
    config.defaultSystemPrompt = updates.defaultSystemPrompt;
  }
  workspaceConfig.saveConfig(cwd, config);
  res.json(config);
});

// Git status
app.get("/api/git/status", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  if (!cwd) {
    res.json({ isRepo: false });
    return;
  }
  const resolved = path.resolve(cwd);
  if (!isPathWithinHome(resolved)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  try {
    const output = execFileSync("git", ["status", "--porcelain", "-b"], { cwd: resolved, encoding: "utf-8", timeout: 5000 });
    const lines = output.split("\n").filter(Boolean);
    const branchLine = lines[0] || "";
    const branchMatch = branchLine.match(/^## (.+?)(?:\.{3}|$)/);
    const branch = branchMatch ? branchMatch[1] : "unknown";
    const files = lines.slice(1).map((l) => ({
      status: l.slice(0, 2).trim(),
      path: l.slice(3),
    }));
    res.json({ isRepo: true, branch, files });
  } catch {
    res.json({ isRepo: false });
  }
});

// Git log
app.get("/api/git/log", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  const count = parseInt((req.query.count as string) || "20", 10);
  if (!cwd) {
    res.json([]);
    return;
  }
  const resolved = path.resolve(cwd);
  if (!isPathWithinHome(resolved)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  try {
    const output = execFileSync(
      "git", ["log", `--format=%H|%h|%s|%an|%ar`, `-${Math.min(count, 50)}`],
      { cwd: resolved, encoding: "utf-8", timeout: 5000 },
    );
    const commits = output.split("\n").filter(Boolean).map((line) => {
      const [hash, short, subject, author, date] = line.split("|");
      return { hash, short, subject, author, date };
    });
    res.json(commits);
  } catch {
    res.json([]);
  }
});

// Git diff stat (optionally with full diff for /review)
app.get("/api/git/diff", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  const full = req.query.full === "true";
  if (!cwd) {
    res.json({ stat: "" });
    return;
  }
  const resolved = path.resolve(cwd);
  if (!isPathWithinHome(resolved)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  try {
    const stat = execFileSync("git", ["diff", "--stat"], { cwd: resolved, encoding: "utf-8", timeout: 5000 });
    let diff = "";
    if (full) {
      try {
        const rawDiff = execFileSync("git", ["diff"], { cwd: resolved, encoding: "utf-8", timeout: 10000 });
        diff = rawDiff.slice(0, 50_000);
      } catch { /* skip if diff too large */ }
    }
    res.json({ stat, diff });
  } catch {
    res.json({ stat: "", diff: "" });
  }
});

// CLAUDE.md read
app.get("/api/claude-md", (req, res) => {
  const cwd = req.query.cwd as string | undefined;
  if (!cwd) {
    res.status(400).json({ error: "cwd is required" });
    return;
  }
  const resolved = path.resolve(cwd);
  if (!isPathWithinHome(resolved)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const fp = path.join(resolved, "CLAUDE.md");
  if (fs.existsSync(fp)) {
    res.json({ exists: true, content: fs.readFileSync(fp, "utf-8") });
  } else {
    res.json({ exists: false, content: "" });
  }
});

// CLAUDE.md write
app.put("/api/claude-md", (req, res) => {
  const { cwd, content } = req.body;
  if (!cwd || typeof content !== "string") {
    res.status(400).json({ error: "cwd and content are required" });
    return;
  }
  const resolved = path.resolve(cwd);
  if (!isPathWithinHome(resolved)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  fs.writeFileSync(path.join(resolved, "CLAUDE.md"), content, "utf-8");
  res.json({ ok: true });
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

  const isChatOnly = !cwd;
  const resolvedCwd = cwd ? path.resolve(cwd) : HOME_DIR;
  if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
    res.status(400).json({ error: "Invalid workspace path" });
    return;
  }

  const id = randomUUID();
  const file = store.createConversation(
    id,
    title || "New Chat",
    resolvedCwd,
    model || DEFAULT_MODEL,
  );

  if (isChatOnly) {
    store.updateConversation(id, { chatOnly: true });
    file.conversation.chatOnly = true;
  }

  // Apply system prompt: workspace config overrides the default
  const wsConfig = workspaceConfig.getConfig(resolvedCwd);
  const prompt = wsConfig.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT;
  store.updateConversation(id, { systemPrompt: prompt });
  file.conversation.systemPrompt = prompt;

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

// UUID validation middleware for :id param routes
app.param("id", (req, res, next, id) => {
  if (!isValidUUID(id)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }
  next();
});

// Update conversation (rename, change cwd, change model, etc.)
app.patch("/api/conversations/:id", (req, res) => {
  const { title, cwd, model, pinned, systemPrompt } = req.body;
  const conv = store.getConversation(req.params.id);
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (cwd !== undefined) {
    const resolvedCwd = path.resolve(cwd);
    if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
      res.status(400).json({ error: "Invalid workspace path" });
      return;
    }
  }

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (cwd !== undefined) updates.cwd = cwd;
  if (model !== undefined) updates.model = model;
  if (pinned !== undefined) updates.pinned = pinned;
  if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
  if (cwd !== undefined || model !== undefined || systemPrompt !== undefined) {
    sessionManager.removeSession(req.params.id);
  }
  if (Object.keys(updates).length > 0) {
    store.updateConversation(req.params.id, updates);
  }
  const updated = store.getConversation(req.params.id);
  res.json(updated!.conversation);
});

// Workflow: get state
app.get("/api/conversations/:id/workflow", (req, res) => {
  const convFile = store.getConversation(req.params.id);
  if (!convFile) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(convFile.conversation.workflow || null);
});

// Workflow: start or update
app.patch("/api/conversations/:id/workflow", (req, res) => {
  const convFile = store.getConversation(req.params.id);
  if (!convFile) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const updates = req.body as Partial<WorkflowState>;
  const current = convFile.conversation.workflow;

  if (!current && !updates.phase) {
    res.status(400).json({ error: "phase is required to start a workflow" });
    return;
  }

  const workflow: WorkflowState = current
    ? { ...current, ...updates }
    : {
        phase: updates.phase || "brainstorming",
        description: updates.description || "",
        planId: updates.planId || randomUUID().slice(0, 8),
        startedAt: new Date().toISOString(),
        ...updates,
      };

  store.updateConversation(req.params.id, { workflow });
  res.json(workflow);
});

// Workflow: read plan file from workspace
app.get("/api/conversations/:id/workflow/plan-file", (req, res) => {
  const convFile = store.getConversation(req.params.id);
  if (!convFile) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const workflow = convFile.conversation.workflow;
  if (!workflow?.planPath) {
    res.status(404).json({ error: "No plan file path set" });
    return;
  }

  const planFullPath = path.resolve(convFile.conversation.cwd, workflow.planPath);
  if (!isPathWithinHome(planFullPath)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    const content = fs.readFileSync(planFullPath, "utf-8");
    res.json({ path: workflow.planPath, content });
  } catch {
    res.status(404).json({ error: "Plan file not found" });
  }
});

// Delete conversation
app.delete("/api/conversations/:id", (req, res) => {
  sessionManager.removeSession(req.params.id);
  store.deleteConversation(req.params.id);
  res.json({ ok: true });
});

// Fork conversation (branch from a specific message)
app.post("/api/conversations/:id/fork", (req, res) => {
  const { messageId } = req.body;
  if (!messageId) {
    res.status(400).json({ error: "messageId is required" });
    return;
  }

  const convFile = store.getConversation(req.params.id);
  if (!convFile) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const msgIndex = convFile.messages.findIndex((m) => m.id === messageId);
  if (msgIndex === -1) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  const newId = randomUUID();
  const now = new Date().toISOString();
  const messagesUpTo = convFile.messages.slice(0, msgIndex);
  store.createConversation(
    newId,
    convFile.conversation.title + " (branch)",
    convFile.conversation.cwd,
    convFile.conversation.model,
  );
  const file = store.getConversation(newId)!;
  file.messages = messagesUpTo;
  file.conversation.forkedFrom = { conversationId: req.params.id, messageId };
  file.conversation.systemPrompt = convFile.conversation.systemPrompt;
  file.conversation.updatedAt = now;
  const fp = path.join(process.cwd(), "data", "conversations", `${newId}.json`);
  fs.writeFileSync(fp, JSON.stringify(file, null, 2));

  res.json(file.conversation);
});

// Fork conversation with AI-generated summary (fresh context)
app.post("/api/conversations/:id/fork-with-summary", async (req, res) => {
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
      "Summarize the key context from this conversation: what we're building, decisions made, current state of the codebase, and any pending tasks. Be concise but comprehensive — this summary will seed a new conversation.",
    );

    const newId = randomUUID();
    const now = new Date().toISOString();
    store.createConversation(
      newId,
      convFile.conversation.title + " (continued)",
      convFile.conversation.cwd,
      convFile.conversation.model,
    );
    const file = store.getConversation(newId)!;
    file.messages = [
      {
        id: randomUUID(),
        role: "assistant",
        content: `**Continuing from previous session:**\n\n${text}`,
        timestamp: now,
      },
    ];
    file.conversation.forkedFrom = { conversationId: req.params.id, messageId: "" };
    file.conversation.systemPrompt = convFile.conversation.systemPrompt;
    file.conversation.updatedAt = now;
    const fp = path.join(process.cwd(), "data", "conversations", `${newId}.json`);
    fs.writeFileSync(fp, JSON.stringify(file, null, 2));

    res.json(file.conversation);
  } catch (err) {
    console.error("Fork with summary failed:", err);
    res.status(500).json({ error: "Failed to create summary for new session" });
  }
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

  const wsConfig = workspaceConfig.getConfig(convFile.conversation.cwd);
  const session = sessionManager.getOrCreateSession(
    req.params.id,
    convFile.conversation.cwd,
    convFile.conversation.model || DEFAULT_MODEL,
    convFile.conversation.sdkSessionId,
    convFile.conversation.systemPrompt,
    wsConfig.mcpServers.length > 0 ? wsConfig.mcpServers : undefined,
    wsConfig.customAgents && wsConfig.customAgents.length > 0 ? wsConfig.customAgents : undefined,
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

function getWorkflowSystemPromptHint(workflow: WorkflowState): string | null {
  const plansDir = "docs/plans";
  const specFile = `${plansDir}/${workflow.planId}-spec.md`;
  const planFile = `${plansDir}/${workflow.planId}-plan.md`;

  switch (workflow.phase) {
    case "brainstorming":
      return `\n\n--- WORKFLOW MODE: BRAINSTORMING ---
You are in a structured development workflow. The user wants to build: "${workflow.description}"

Your job in this phase:
1. Ask 3-5 targeted clarifying questions to understand scope, constraints, and preferences
2. Once the user answers, propose 2-3 distinct implementation approaches with trade-offs
3. When the user approves an approach, write a design spec document to \`${specFile}\`

The spec document should include:
- **Overview**: What we're building and why
- **Requirements**: Functional and non-functional requirements
- **Architecture**: Chosen approach with rationale
- **Data Model**: Key data structures (if applicable)
- **Components/Modules**: High-level breakdown
- **Open Questions**: Anything still to be decided

After writing the spec, tell the user: "Spec saved. When you're ready, run \`/execute\` to generate an implementation plan and start building."
Do NOT start coding yet. This phase is about understanding and documenting.`;

    case "planning":
      return `\n\n--- WORKFLOW MODE: PLANNING ---
You are creating an implementation plan from the spec at \`${workflow.specPath || specFile}\`.

Read the spec document, then write an implementation plan to \`${planFile}\`.

The plan should contain numbered tasks, each with:
- **Task title**: Clear, action-oriented name
- **Description**: What needs to be done
- **Files**: Which files to create or modify
- **Acceptance criteria**: How to verify it's done

Design each task to be independently executable by a sub-agent. Tasks should be ordered by dependency (foundational first).
Keep tasks focused — each should be completable in one sub-agent session.

After writing the plan, tell the user it's ready and they can run \`/execute\` to start building.`;

    case "executing":
      return `\n\n--- WORKFLOW MODE: EXECUTING ---
You are executing an implementation plan. Use the Agent tool to dispatch sub-agents for each task.

For each task:
1. Dispatch a sub-agent with the task description, relevant file paths, and acceptance criteria
2. Wait for the sub-agent to complete before moving to the next task
3. Report progress after each task completes

If a sub-agent fails or produces incomplete work, retry once with more specific instructions before flagging it to the user.
Keep the user informed of progress: which task is running, what was completed, and what's next.`;

    case "completed":
    case "ready":
    case "spec-review":
      return null;

    default:
      return null;
  }
}

// Send message
app.post("/api/conversations/:id/messages", (req, res) => {
  const { content, images } = req.body as {
    content: string;
    images?: ImageAttachment[];
  };

  if (typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }
  if (content.length > 100_000) {
    res.status(400).json({ error: "Message too long" });
    return;
  }

  if (images && images.length > 0) {
    for (const img of images) {
      if (!ALLOWED_IMAGE_TYPES.has(img.mediaType)) {
        res.status(400).json({ error: `Invalid image type: ${img.mediaType}` });
        return;
      }
    }
  }

  const convFile = store.getConversation(req.params.id);
  if (!convFile) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Extract @file mentions and prepend file contents
  const mentionRe = /@([\w./_-]+[\w./_-])/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = mentionRe.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  let augmentedContent = content;
  if (mentions.length > 0) {
    const fileBlocks: string[] = [];
    for (const mention of mentions) {
      const filePath = path.resolve(convFile.conversation.cwd, mention);
      if (!isPathWithinHome(filePath)) continue;
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const fileContent = fs.readFileSync(filePath, "utf-8").slice(0, 50_000);
          fileBlocks.push(`<file path="${mention}">\n${fileContent}\n</file>`);
        }
      } catch { /* skip unreadable files */ }
    }
    if (fileBlocks.length > 0) {
      augmentedContent = fileBlocks.join("\n\n") + "\n\n" + content;
    }
  }

  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content,
    images: images && images.length > 0 ? images : undefined,
    timestamp: new Date().toISOString(),
  };
  store.addMessage(req.params.id, userMsg);

  const lastTurnTokens = convFile.conversation.lastTurnInputTokens || 0;
  if (lastTurnTokens >= 100_000) {
    const hint = "\n\nIMPORTANT: Context usage is high. For any complex or multi-step task, prefer delegating to sub-agents (using the Agent tool) so work happens in a fresh context window. Keep your direct responses concise and focused.";
    if (convFile.conversation.systemPrompt && !convFile.conversation.systemPrompt.includes("Context usage is high")) {
      convFile.conversation.systemPrompt += hint;
    }
  }

  // Augment system prompt based on active workflow phase
  let sessionSystemPrompt = convFile.conversation.systemPrompt;
  const workflow = convFile.conversation.workflow;
  if (workflow && sessionSystemPrompt) {
    const workflowHint = getWorkflowSystemPromptHint(workflow);
    if (workflowHint && !sessionSystemPrompt.includes("WORKFLOW MODE")) {
      sessionSystemPrompt += workflowHint;
    }
  }

  const msgWsConfig = workspaceConfig.getConfig(convFile.conversation.cwd);
  const session = sessionManager.getOrCreateSession(
    req.params.id,
    convFile.conversation.cwd,
    convFile.conversation.model || DEFAULT_MODEL,
    convFile.conversation.sdkSessionId,
    sessionSystemPrompt,
    msgWsConfig.mcpServers.length > 0 ? msgWsConfig.mcpServers : undefined,
    msgWsConfig.customAgents && msgWsConfig.customAgents.length > 0 ? msgWsConfig.customAgents : undefined,
  );

  const isFirstMessage =
    convFile.messages.filter((m) => m.role === "user").length === 0;

  // Run agent in background — events stream via SSE
  session.sendMessage(augmentedContent, images).then(async ({ text, toolCalls, tokenUsage }) => {
    if (text) {
      const assistantMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: new Date().toISOString(),
      };
      store.addMessage(req.params.id, assistantMsg);

      // Auto-detect workflow phase transitions from tool calls
      const currentConv = store.getConversation(req.params.id);
      const activeWorkflow = currentConv?.conversation.workflow;
      if (activeWorkflow && toolCalls.length > 0) {
        const getWritePath = (tc: { name: string; input: Record<string, unknown> }): string | null => {
          if (tc.name !== "Write" && tc.name !== "Edit" && tc.name !== "write" && tc.name !== "edit") return null;
          const p = tc.input.file_path || tc.input.path || tc.input.file;
          return typeof p === "string" ? p : null;
        };

        for (const tc of toolCalls) {
          const writtenPath = getWritePath(tc);
          if (!writtenPath) continue;

          if (activeWorkflow.phase === "brainstorming" && writtenPath.includes(`${activeWorkflow.planId}-spec`)) {
            store.updateConversation(req.params.id, {
              workflow: { ...activeWorkflow, phase: "ready" as WorkflowPhase, specPath: writtenPath },
            });
            session.events.emit("event", {
              type: "workflow_update",
              data: { phase: "ready", specPath: writtenPath },
            });
          } else if (activeWorkflow.phase === "planning" && writtenPath.includes(`${activeWorkflow.planId}-plan`)) {
            store.updateConversation(req.params.id, {
              workflow: { ...activeWorkflow, phase: "ready" as WorkflowPhase, planPath: writtenPath },
            });
            session.events.emit("event", {
              type: "workflow_update",
              data: { phase: "ready", planPath: writtenPath },
            });
          }
        }
      }

      if (isFirstMessage) {
        const title = await generateTitle(content, text);
        store.updateConversation(req.params.id, { title });
        session.events.emit("event", {
          type: "title_updated",
          data: { title },
        });
      }
    }

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

      session.events.emit("event", {
        type: "context_usage",
        data: { inputTokens: tokenUsage.inputTokens },
      });

      session.events.emit("event", {
        type: "usage",
        data: { estimatedCost: tokenUsage.estimatedCost },
      });
    }
  }).catch((err) => {
    console.error("Message processing failed:", err);
    session.events.emit("event", {
      type: "error",
      data: { message: err instanceof Error ? err.message : "Message processing failed" },
    });
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
  const token = randomBytes(16).toString("hex");
  const snapshot = {
    token,
    title: file.conversation.title,
    model: file.conversation.model,
    workspace: path.basename(file.conversation.cwd),
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
  if (!SHARE_TOKEN_RE.test(req.params.token)) {
    res.status(400).send("Invalid share token.");
    return;
  }

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
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'");
  res.send(html);
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

// --- Claude Code Stats (reads ~/.claude/) ---

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME_DIR, ".claude");

function readClaudeStats() {
  const result: {
    dailyActivity: { date: string; messageCount: number; sessionCount: number; toolCallCount: number }[];
    activeSessions: { pid: number; sessionId: string; cwd: string; startedAt: number }[];
    blockElapsedMs: number | null;
    todayTokens: { input: number; output: number; cached: number };
  } = {
    dailyActivity: [],
    activeSessions: [],
    blockElapsedMs: null,
    todayTokens: { input: 0, output: 0, cached: 0 },
  };

  // 1. Daily activity from stats-cache.json
  try {
    const statsPath = path.join(CLAUDE_DIR, "stats-cache.json");
    if (fs.existsSync(statsPath)) {
      const stats = JSON.parse(fs.readFileSync(statsPath, "utf-8"));
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);
      result.dailyActivity = (stats.dailyActivity || []).filter(
        (d: { date: string }) => d.date >= cutoff,
      );
    }
  } catch { /* ignore corrupt stats */ }

  // 2. Active sessions
  try {
    const sessDir = path.join(CLAUDE_DIR, "sessions");
    if (fs.existsSync(sessDir)) {
      const files = fs.readdirSync(sessDir).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        try {
          const sess = JSON.parse(fs.readFileSync(path.join(sessDir, f), "utf-8"));
          if (sess.pid && sess.sessionId && sess.startedAt) {
            let alive = false;
            try { process.kill(sess.pid, 0); alive = true; } catch { /* not running */ }
            if (alive) {
              result.activeSessions.push({
                pid: sess.pid,
                sessionId: sess.sessionId,
                cwd: sess.cwd || "",
                startedAt: sess.startedAt,
              });
            }
          }
        } catch { /* skip bad session files */ }
      }
    }
  } catch { /* ignore */ }

  // 3. Block timer — earliest active session determines block start
  if (result.activeSessions.length > 0) {
    const earliest = Math.min(...result.activeSessions.map((s) => s.startedAt));
    const BLOCK_MS = 5 * 60 * 60 * 1000;
    const elapsed = Date.now() - earliest;
    result.blockElapsedMs = elapsed % BLOCK_MS;
  }

  // 4. Today's token totals from transcript JSONL files
  const today = new Date().toISOString().slice(0, 10);
  try {
    const projectsDir = path.join(CLAUDE_DIR, "projects");
    if (fs.existsSync(projectsDir)) {
      const projFolders = fs.readdirSync(projectsDir);
      for (const folder of projFolders) {
        const projPath = path.join(projectsDir, folder);
        try {
          if (!fs.statSync(projPath).isDirectory()) continue;
          const jsonlFiles = fs.readdirSync(projPath).filter((f) => f.endsWith(".jsonl") && !f.startsWith("agent-"));
          for (const jf of jsonlFiles) {
            try {
              const fp = path.join(projPath, jf);
              const stat = fs.statSync(fp);
              if (stat.mtime.toISOString().slice(0, 10) < today) continue;
              const content = fs.readFileSync(fp, "utf-8");
              const lines = content.split("\n").filter(Boolean);
              for (const line of lines) {
                try {
                  const entry = JSON.parse(line);
                  if (entry.timestamp && entry.timestamp.startsWith(today) && entry.message?.usage) {
                    const u = entry.message.usage;
                    result.todayTokens.input += u.input_tokens || 0;
                    result.todayTokens.output += u.output_tokens || 0;
                    result.todayTokens.cached += (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
                  }
                } catch { /* skip bad lines */ }
              }
            } catch { /* skip unreadable files */ }
          }
        } catch { /* skip bad folders */ }
      }
    }
  } catch { /* ignore */ }

  return result;
}

app.get("/api/claude-stats", (_req, res) => {
  try {
    res.json(readClaudeStats());
  } catch (err) {
    console.error("Failed to read Claude stats:", err);
    res.status(500).json({ error: "Failed to read Claude stats" });
  }
});

// --- Scheduled Tasks API ---

app.get("/api/schedules", (_req, res) => {
  res.json(scheduleStore.listTasks());
});

app.post("/api/schedules", (req, res) => {
  const { name, prompt, frequency, timeOfDay, dayOfWeek, cwd, model } = req.body;
  if (!name || !prompt || !frequency) {
    res.status(400).json({ error: "name, prompt, and frequency are required" });
    return;
  }

  const task: ScheduledTask = {
    id: randomUUID(),
    name,
    prompt,
    frequency,
    timeOfDay: timeOfDay || "09:00",
    dayOfWeek: dayOfWeek !== undefined ? dayOfWeek : undefined,
    cwd: cwd || undefined,
    model: model || undefined,
    enabled: true,
    nextRunAt: computeNextRun({ frequency, timeOfDay: timeOfDay || "09:00", dayOfWeek }),
    createdAt: new Date().toISOString(),
  };

  scheduleStore.createTask(task);
  res.json(task);
});

app.get("/api/schedules/events/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const handler = (event: { type: string; data: unknown }) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  onSchedulerEvent(handler);
  res.write(`data: ${JSON.stringify({ type: "connected", data: {} })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    offSchedulerEvent(handler);
    clearInterval(heartbeat);
  });
});

app.get("/api/schedules/:taskId", (req, res) => {
  const file = scheduleStore.getTask(req.params.taskId);
  if (!file) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(file);
});

app.patch("/api/schedules/:taskId", (req, res) => {
  const updates = req.body;
  if (updates.frequency || updates.timeOfDay !== undefined || updates.dayOfWeek !== undefined) {
    const existing = scheduleStore.getTask(req.params.taskId);
    if (existing) {
      const freq = updates.frequency || existing.task.frequency;
      const tod = updates.timeOfDay !== undefined ? updates.timeOfDay : existing.task.timeOfDay;
      const dow = updates.dayOfWeek !== undefined ? updates.dayOfWeek : existing.task.dayOfWeek;
      updates.nextRunAt = computeNextRun({ frequency: freq, timeOfDay: tod, dayOfWeek: dow });
    }
  }
  const updated = scheduleStore.updateTask(req.params.taskId, updates);
  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(updated);
});

app.delete("/api/schedules/:taskId", (req, res) => {
  scheduleStore.deleteTask(req.params.taskId);
  res.json({ ok: true });
});

app.get("/api/schedules/:taskId/runs", (req, res) => {
  const limit = parseInt((req.query.limit as string) || "20", 10);
  res.json(scheduleStore.getTaskRuns(req.params.taskId, limit));
});

const PORT = 3001;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Claude Code GUI server running on http://localhost:${PORT}`);
  console.log(`Auth token: ${AUTH_TOKEN}`);
  startScheduler();
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
