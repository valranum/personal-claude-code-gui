import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMessage, ImageAttachment, ToolCallInfo, StreamingState, SubagentInfo, WorkflowState } from "../types";
import { connectSSE, SSEEvent } from "../utils/sse";
import { apiFetch, getAuthToken, getAuthTokenSync } from "../utils/api";

const EMPTY_STREAMING: StreamingState = {
  isStreaming: false,
  text: "",
  thinking: "",
  toolCalls: [],
  subagents: [],
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.005) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

const CONTEXT_WINDOW = 200_000;
// ~50% of 200k context window — trigger compact suggestion (degradation begins around 50%)
const CONTEXT_TOKEN_THRESHOLD = 100_000;

const WORD_TO_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90,
};

function parseUsageQuery(input: string): { scope: "conversation" | "range"; days?: number; label: string } | null {
  if (input.startsWith("/usage")) {
    const arg = input.split(/\s+/)[1] || "";
    const num = parseInt(arg, 10);
    if (!isNaN(num) && num > 0) return { scope: "range", days: num, label: `Past ${num} day${num === 1 ? "" : "s"}` };
    if (arg === "week") return { scope: "range", days: 7, label: "Past 7 days" };
    if (arg === "month") return { scope: "range", days: 30, label: "Past 30 days" };
    return { scope: "conversation", label: "This conversation" };
  }

  const lower = input.toLowerCase();
  const usageKeywords = /\b(usage|tokens?|how much|how many|cost|spent|spending|consumed|used)\b/;
  if (!usageKeywords.test(lower)) return null;

  const thisConv = /\b(this (conversation|chat|session)|current (conversation|chat|session))\b/;
  if (thisConv.test(lower)) return { scope: "conversation", label: "This conversation" };

  const yearMatch = lower.match(/\b(?:past|last)\s+(?:a\s+)?year\b/);
  if (yearMatch) return { scope: "range", days: 365, label: "Past year" };

  const monthMatch = lower.match(/\b(?:past|last)\s+(\w+)\s+months?\b/);
  if (monthMatch) {
    const n = parseInt(monthMatch[1], 10) || WORD_TO_NUM[monthMatch[1]] || 1;
    const days = n * 30;
    return { scope: "range", days, label: `Past ${n} month${n === 1 ? "" : "s"}` };
  }
  if (/\b(?:past|last|this)\s+month\b/.test(lower)) return { scope: "range", days: 30, label: "Past month" };

  const weekMatch = lower.match(/\b(?:past|last)\s+(\w+)\s+weeks?\b/);
  if (weekMatch) {
    const n = parseInt(weekMatch[1], 10) || WORD_TO_NUM[weekMatch[1]] || 1;
    const days = n * 7;
    return { scope: "range", days, label: `Past ${n} week${n === 1 ? "" : "s"}` };
  }
  if (/\b(?:past|last|this)\s+week\b/.test(lower)) return { scope: "range", days: 7, label: "Past week" };

  const dayMatch = lower.match(/\b(?:past|last)\s+(\w+)\s+days?\b/);
  if (dayMatch) {
    const n = parseInt(dayMatch[1], 10) || WORD_TO_NUM[dayMatch[1]] || 1;
    return { scope: "range", days: n, label: `Past ${n} day${n === 1 ? "" : "s"}` };
  }

  if (/\b(today|past day|last day)\b/.test(lower)) return { scope: "range", days: 1, label: "Today" };
  if (/\byesterday\b/.test(lower)) return { scope: "range", days: 2, label: "Past 2 days" };

  if (usageKeywords.test(lower)) return { scope: "conversation", label: "This conversation" };

  return null;
}
// ~95% of 200k context window — auto-compact before sending
const AUTO_COMPACT_THRESHOLD = 190_000;

export function useChat(
  conversationId: string | null,
  onTitleUpdate?: (title: string) => void,
  onError?: (message: string) => void,
  onInfo?: (message: string) => void,
  cwd?: string,
  model?: string,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, _setStreaming] = useState<StreamingState>(EMPTY_STREAMING);
  const [showCompactSuggestion, setShowCompactSuggestion] = useState(false);
  const [contextTokens, _setContextTokens] = useState(0);
  const [sessionCost, setSessionCost] = useState(0);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const setContextTokens = useCallback((v: number) => {
    _setContextTokens(v);
    contextTokensRef.current = v;
  }, []);

  const setStreaming = useCallback((val: StreamingState | ((prev: StreamingState) => StreamingState)) => {
    _setStreaming((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      isStreamingRef.current = next.isStreaming;
      return next;
    });
  }, []);
  const dismissedRef = useRef<Set<string>>(new Set());
  const esRef = useRef<EventSource | null>(null);
  const toolCallsRef = useRef<ToolCallInfo[]>([]);
  const effectIdRef = useRef(0);
  const onErrorRef = useRef(onError);
  const onInfoRef = useRef(onInfo);
  const contextTokensRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const resultHandledRef = useRef(false);
  const subagentsRef = useRef<SubagentInfo[]>([]);
  const cwdRef = useRef(cwd);
  const modelRef = useRef(model || "");
  cwdRef.current = cwd;
  modelRef.current = model || "";
  onErrorRef.current = onError;
  onInfoRef.current = onInfo;

  useEffect(() => {
    fetchAbortRef.current?.abort();
    if (!conversationId) {
      setMessages([]);
      setStreaming(EMPTY_STREAMING);
      setShowCompactSuggestion(false);
      setContextTokens(0);
      setSessionCost(0);
      setWorkflowState(null);
      return;
    }
    setMessages([]);
    setStreaming(EMPTY_STREAMING);
    setContextTokens(0);
    setSessionCost(0);
    setWorkflowState(null);
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    // Load messages and workflow state in parallel
    const loadMessages = apiFetch(`/api/conversations/${conversationId}/messages`)
      .then((r) => {
        if (controller.signal.aborted) return;
        return r.json();
      })
      .then((data: { messages: ChatMessage[]; lastTurnInputTokens: number } | undefined) => {
        if (!data || controller.signal.aborted) return;
        setMessages(data.messages);
        setContextTokens(data.lastTurnInputTokens || 0);
        if (
          data.lastTurnInputTokens >= CONTEXT_TOKEN_THRESHOLD &&
          !dismissedRef.current.has(conversationId)
        ) {
          setShowCompactSuggestion(true);
        } else {
          setShowCompactSuggestion(false);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMessages([]);
        onErrorRef.current?.("Failed to load messages");
      });

    const loadWorkflow = apiFetch(`/api/conversations/${conversationId}/workflow`)
      .then((r) => {
        if (controller.signal.aborted) return;
        return r.json();
      })
      .then((data: WorkflowState | null | undefined) => {
        if (controller.signal.aborted) return;
        setWorkflowState(data || null);
      })
      .catch(() => {});

    Promise.all([loadMessages, loadWorkflow]);
    return () => controller.abort();
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    esRef.current?.close();
    toolCallsRef.current = [];
    const currentEffectId = ++effectIdRef.current;
    let cancelled = false;

    const handleEvent = (event: SSEEvent) => {
      if (currentEffectId !== effectIdRef.current) return;
      switch (event.type) {
        case "processing":
          setStreaming({ isStreaming: true, text: "", thinking: "", toolCalls: [], subagents: [] });
          toolCallsRef.current = [];
          subagentsRef.current = [];
          resultHandledRef.current = false;
          break;

        case "result": {
          const text = (event.data as { text?: string }).text || "";
          const finalToolCalls = [...toolCallsRef.current];
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              content: text,
              toolCalls:
                finalToolCalls.length > 0 ? finalToolCalls : undefined,
              timestamp: new Date().toISOString(),
            },
          ]);
          setStreaming(EMPTY_STREAMING);
          toolCallsRef.current = [];
          resultHandledRef.current = true;
          break;
        }

        case "tool_use": {
          const tc = event.data as unknown as ToolCallInfo;
          toolCallsRef.current = [...toolCallsRef.current, tc];
          setStreaming((prev) => ({
            ...prev,
            isStreaming: true,
            toolCalls: [...toolCallsRef.current],
          }));
          break;
        }

        case "tool_result": {
          const { id: toolId, output } = event.data as {
            id: string;
            output: string;
          };
          toolCallsRef.current = toolCallsRef.current.map((tc) =>
            tc.id === toolId ? { ...tc, output, status: "done" as const } : tc,
          );
          setStreaming((prev) => ({
            ...prev,
            toolCalls: [...toolCallsRef.current],
          }));
          break;
        }

        case "done":
          setStreaming((prev) => {
            if (!resultHandledRef.current && prev.isStreaming && prev.text) {
              setMessages((msgs) => [
                ...msgs,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: prev.text,
                  toolCalls:
                    toolCallsRef.current.length > 0
                      ? [...toolCallsRef.current]
                      : undefined,
                  timestamp: new Date().toISOString(),
                },
              ]);
            }
            toolCallsRef.current = [];
            subagentsRef.current = [];
            resultHandledRef.current = false;
            return EMPTY_STREAMING;
          });
          break;

        case "error": {
          const errMsg =
            (event.data as { message?: string }).message || "An error occurred";
          onErrorRef.current?.(errMsg);
          setStreaming((prev) => ({
            ...prev,
            isStreaming: false,
            text: prev.text || `Error: ${errMsg}`,
          }));
          break;
        }

        case "thinking": {
          const data = event.data as Record<string, unknown>;
          if (typeof data.content === "string") {
            setStreaming((prev) => ({
              ...prev,
              thinking: prev.thinking + data.content,
            }));
          }
          break;
        }

        case "message": {
          const data = event.data as Record<string, unknown>;
          if (typeof data.content === "string") {
            setStreaming((prev) => ({
              ...prev,
              thinking: "",
              text: prev.text + data.content,
            }));
          }
          break;
        }

        case "subagent_start": {
          const { id, agentName, description } = event.data as { id: string; agentName: string; description: string };
          const sa: SubagentInfo = { id, agentName, description, status: "running", toolActivity: [] };
          subagentsRef.current = [...subagentsRef.current, sa];
          setStreaming((prev) => ({
            ...prev,
            subagents: [...subagentsRef.current],
          }));
          break;
        }

        case "subagent_tool": {
          const { parentId, toolName, input } = event.data as { parentId: string; toolName: string; input: Record<string, unknown> };
          subagentsRef.current = subagentsRef.current.map((sa) =>
            sa.id === parentId
              ? { ...sa, toolActivity: [...sa.toolActivity, { toolName, input }] }
              : sa,
          );
          setStreaming((prev) => ({
            ...prev,
            subagents: [...subagentsRef.current],
          }));
          break;
        }

        case "subagent_end": {
          const { id, output } = event.data as { id: string; output: string };
          subagentsRef.current = subagentsRef.current.map((sa) =>
            sa.id === id ? { ...sa, status: "done" as const, output } : sa,
          );
          setStreaming((prev) => ({
            ...prev,
            subagents: [...subagentsRef.current],
          }));
          break;
        }

        case "context_usage": {
          const { inputTokens } = event.data as { inputTokens: number };
          setContextTokens(inputTokens);
          if (
            inputTokens >= CONTEXT_TOKEN_THRESHOLD &&
            conversationId &&
            !dismissedRef.current.has(conversationId)
          ) {
            setShowCompactSuggestion(true);
          }
          break;
        }

        case "usage": {
          const { estimatedCost } = event.data as { estimatedCost: number };
          if (estimatedCost > 0) {
            setSessionCost((prev) => prev + estimatedCost);
          }
          break;
        }

        case "title_updated": {
          const { title } = event.data as { title: string };
          onTitleUpdate?.(title);
          break;
        }

        case "workflow_update": {
          const update = event.data as Partial<WorkflowState>;
          setWorkflowState((prev) => prev ? { ...prev, ...update } : null);
          break;
        }
      }
    };

    getAuthToken().then(() => {
      if (cancelled) return;
      const es = connectSSE(
        `/api/conversations/${conversationId}/stream`,
        handleEvent,
      );
      esRef.current = es;
    });

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [conversationId]);

  const sendMessage = useCallback(
    async (content: string, images?: ImageAttachment[]) => {
      if (!conversationId || isStreamingRef.current) return;

      if (content.trim() === "/clear") {
        try {
          await apiFetch(`/api/conversations/${conversationId}/clear`, { method: "POST" });
          setMessages([]);
        } catch {
          onErrorRef.current?.("Failed to clear conversation");
        }
        return;
      }
      if (content.trim() === "/compact") {
        setStreaming({ isStreaming: true, text: "", thinking: "", toolCalls: [], subagents: [] });
        try {
          const res = await apiFetch(`/api/conversations/${conversationId}/compact`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          const reloaded = await apiFetch(`/api/conversations/${conversationId}/messages`);
          const reloadedData = await reloaded.json();
          setMessages(reloadedData.messages);
        } catch {
          onErrorRef.current?.("Failed to compact conversation");
        } finally {
          setStreaming(EMPTY_STREAMING);
        }
        return;
      }
      const usageQuery = parseUsageQuery(content.trim());
      if (usageQuery) {
        try {
          const params = new URLSearchParams();
          if (usageQuery.scope === "conversation") {
            params.set("scope", "conversation");
            params.set("id", conversationId);
          } else {
            params.set("scope", "week");
            if (usageQuery.days) params.set("days", String(usageQuery.days));
          }
          const res = await apiFetch(`/api/usage?${params}`);
          const data = await res.json();
          const systemMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "system",
            content: `**${usageQuery.label}** — ${formatTokens(data.inputTokens)} input tokens · ${formatTokens(data.outputTokens)} output tokens · ${formatCost(data.estimatedCost)}`,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, systemMsg]);
        } catch {
          onErrorRef.current?.("Failed to fetch usage data");
        }
        return;
      }

      if (content.trim() === "/agents") {
        try {
          const lines: string[] = ["**Available Subagents**", ""];
          lines.push("**Built-in:**");
          lines.push("- `general-purpose` — Capable agent for complex, multi-step tasks");
          lines.push("- `explore` — Fast, read-only agent for codebase search and analysis");
          if (cwdRef.current) {
            const res = await apiFetch(`/api/agents?cwd=${encodeURIComponent(cwdRef.current)}`);
            const agents = await res.json();
            if (agents.length > 0) {
              lines.push("");
              lines.push("**Custom:**");
              for (const a of agents) {
                const tools = a.tools ? ` (${a.tools.join(", ")})` : "";
                const model = a.model && a.model !== "inherit" ? ` [${a.model}]` : "";
                lines.push(`- \`${a.name}\` — ${a.description}${tools}${model}`);
              }
            }
          }
          lines.push("");
          lines.push("Claude will automatically delegate to subagents when appropriate, or you can request one by name: *\"Use the code-reviewer agent to...\"*");
          const systemMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "system",
            content: lines.join("\n"),
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, systemMsg]);
        } catch {
          onErrorRef.current?.("Failed to fetch agents");
        }
        return;
      }

      // /plan <description> — start structured workflow
      if (content.trim().startsWith("/plan")) {
        const description = content.trim().slice(5).trim();
        if (!description) {
          const systemMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "system",
            content: "**Usage:** `/plan <description>`\n\nDescribe what you want to build. Example:\n`/plan Add user authentication with OAuth and session management`",
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, systemMsg]);
          return;
        }
        if (!cwdRef.current) {
          onErrorRef.current?.("No workspace selected — /plan requires a workspace");
          return;
        }

        try {
          // Start workflow on server
          const res = await apiFetch(`/api/conversations/${conversationId}/workflow`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phase: "brainstorming", description }),
          });
          const workflow = await res.json();
          setWorkflowState(workflow);

          // Send the brainstorming prompt as a regular message (the system prompt augmentation will guide Claude)
          const brainstormPrompt = `I want to build: ${description}\n\nPlease start the structured development workflow — ask me clarifying questions first, then propose approaches, and we'll create a spec before writing any code.`;

          const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: brainstormPrompt,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, userMsg]);
          setStreaming({ isStreaming: true, text: "", thinking: "", toolCalls: [], subagents: [] });

          await apiFetch(`/api/conversations/${conversationId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: brainstormPrompt }),
          });
        } catch {
          onErrorRef.current?.("Failed to start workflow");
        }
        return;
      }

      // /execute — execute the current workflow plan
      if (content.trim() === "/execute") {
        if (!cwdRef.current) {
          onErrorRef.current?.("No workspace selected");
          return;
        }

        try {
          // Get current workflow state
          const wfRes = await apiFetch(`/api/conversations/${conversationId}/workflow`);
          const workflow = await wfRes.json();

          if (!workflow) {
            const systemMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "system",
              content: "**No active workflow.** Start one with `/plan <description>`.",
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, systemMsg]);
            return;
          }

          let executePrompt: string;

          if (workflow.planPath) {
            // Plan file exists — execute it
            try {
              const planRes = await apiFetch(`/api/conversations/${conversationId}/workflow/plan-file`);
              const planData = await planRes.json();

              // Transition to executing phase
              const updateRes = await apiFetch(`/api/conversations/${conversationId}/workflow`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phase: "executing" }),
              });
              const updated = await updateRes.json();
              setWorkflowState(updated);

              executePrompt = `Execute this implementation plan using sub-agents. Dispatch one sub-agent per task, in order.\n\n**Implementation Plan:**\n\`\`\`\n${planData.content}\n\`\`\`\n\nStart with the first task and work through each one sequentially. Report progress after each task completes.`;
            } catch {
              onErrorRef.current?.("Failed to read plan file");
              return;
            }
          } else if (workflow.specPath) {
            // Spec exists but no plan yet — generate the plan first
            const updateRes = await apiFetch(`/api/conversations/${conversationId}/workflow`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phase: "planning" }),
            });
            const updated = await updateRes.json();
            setWorkflowState(updated);

            executePrompt = `The spec document has been written. Now create an implementation plan from it. Read the spec at \`${workflow.specPath}\` and write a detailed implementation plan with numbered tasks that can each be dispatched to a sub-agent.`;
          } else {
            // No spec or plan — we're still brainstorming
            const systemMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "system",
              content: "**Workflow in progress.** The spec hasn't been written yet. Continue the brainstorming conversation, or approve an approach so Claude can write the spec.",
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, systemMsg]);
            return;
          }

          const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: executePrompt,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, userMsg]);
          setStreaming({ isStreaming: true, text: "", thinking: "", toolCalls: [], subagents: [] });

          await apiFetch(`/api/conversations/${conversationId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: executePrompt }),
          });
        } catch {
          onErrorRef.current?.("Failed to execute plan");
        }
        return;
      }

      if (content.trim() === "/context") {
        const tokens = contextTokensRef.current;
        const pct = Math.min(tokens / CONTEXT_WINDOW, 1);
        const pctStr = (pct * 100).toFixed(1);
        const barLen = 30;
        const filled = Math.round(pct * barLen);
        const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
        const available = CONTEXT_WINDOW - tokens;
        let status = "🟢 Healthy";
        if (pct >= 0.9) status = "🔴 Critical — consider /compact";
        else if (pct >= 0.75) status = "🟡 Getting full — consider /compact";
        const systemMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "system",
          content: [
            `**Context Window Usage**`,
            `\`${bar}\` ${pctStr}%`,
            `**Used:** ${formatTokens(tokens)} / ${formatTokens(CONTEXT_WINDOW)} tokens`,
            `**Available:** ${formatTokens(available)} tokens`,
            `**Status:** ${status}`,
          ].join("\n"),
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, systemMsg]);
        return;
      }

      if (content.trim() === "/cost") {
        try {
          const params = new URLSearchParams({ scope: "conversation", id: conversationId });
          const res = await apiFetch(`/api/usage?${params}`);
          const data = await res.json();
          const convRes = await apiFetch(`/api/conversations/${conversationId}/messages`);
          const convData = await convRes.json();
          const msgCount = (convData.messages || []).length;
          const systemMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "system",
            content: [
              `**Session Cost Summary**`,
              `**Input:** ${formatTokens(data.inputTokens)} tokens`,
              `**Output:** ${formatTokens(data.outputTokens)} tokens`,
              `**Total:** ${formatTokens(data.inputTokens + data.outputTokens)} tokens`,
              `**Estimated cost:** ${formatCost(data.estimatedCost)}`,
              `**Messages:** ${msgCount}`,
            ].join("\n"),
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, systemMsg]);
        } catch {
          onErrorRef.current?.("Failed to fetch cost data");
        }
        return;
      }

      if (content.trim().startsWith("/export")) {
        try {
          const arg = content.trim().split(/\s+/)[1] || "md";
          const format = arg === "json" ? "json" : "md";
          const token = getAuthTokenSync();
          const url = `/api/conversations/${conversationId}/export?format=${format}&token=${token}`;
          const a = document.createElement("a");
          a.href = url;
          a.download = "";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          const systemMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "system",
            content: `**Exported** conversation as \`.${format}\` — check your downloads.`,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, systemMsg]);
        } catch {
          onErrorRef.current?.("Failed to export conversation");
        }
        return;
      }

      if (content.trim() === "/diff") {
        if (!cwdRef.current) {
          onErrorRef.current?.("No workspace selected");
          return;
        }
        try {
          const statusRes = await apiFetch(`/api/git/status?cwd=${encodeURIComponent(cwdRef.current)}`);
          const statusData = await statusRes.json();
          if (!statusData.isRepo) {
            const systemMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "system",
              content: "**Not a git repository** — `/diff` requires a git workspace.",
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, systemMsg]);
            return;
          }
          const diffRes = await apiFetch(`/api/git/diff?cwd=${encodeURIComponent(cwdRef.current)}`);
          const diffData = await diffRes.json();
          const stat = diffData.stat?.trim();
          const lines: string[] = [`**Git Changes** (branch: \`${statusData.branch}\`)`];
          if (statusData.files && statusData.files.length > 0) {
            lines.push("");
            for (const f of statusData.files) {
              const statusIcon = f.status === "M" ? "modified" : f.status === "A" ? "added" : f.status === "D" ? "deleted" : f.status === "?" || f.status === "??" ? "untracked" : f.status;
              lines.push(`- \`${f.path}\` — ${statusIcon}`);
            }
          }
          if (stat) {
            lines.push("");
            lines.push("```");
            lines.push(stat);
            lines.push("```");
          }
          if (!stat && (!statusData.files || statusData.files.length === 0)) {
            lines.push("\nNo uncommitted changes.");
          }
          const systemMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "system",
            content: lines.join("\n"),
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, systemMsg]);
        } catch {
          onErrorRef.current?.("Failed to fetch git diff");
        }
        return;
      }

      if (content.trim() === "/status") {
        try {
          const convRes = await apiFetch(`/api/conversations/${conversationId}/messages`);
          const convData = await convRes.json();
          const msgCount = (convData.messages || []).length;
          const tokens = contextTokensRef.current;
          const pct = (Math.min(tokens / CONTEXT_WINDOW, 1) * 100).toFixed(1);
          const lines: string[] = [
            `**Session Status**`,
            `**Model:** ${modelRef.current || "unknown"}`,
          ];
          if (cwdRef.current) lines.push(`**Workspace:** \`${cwdRef.current}\``);
          lines.push(`**Messages:** ${msgCount}`);
          lines.push(`**Context:** ${pct}% used (${formatTokens(tokens)} / ${formatTokens(CONTEXT_WINDOW)})`);

          if (cwdRef.current) {
            try {
              const gitRes = await apiFetch(`/api/git/status?cwd=${encodeURIComponent(cwdRef.current)}`);
              const gitData = await gitRes.json();
              if (gitData.isRepo) {
                lines.push(`**Git branch:** \`${gitData.branch}\``);
                const changed = gitData.files?.length || 0;
                lines.push(`**Uncommitted files:** ${changed}`);
              }
            } catch { /* skip git info */ }
          }
          const systemMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "system",
            content: lines.join("\n"),
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, systemMsg]);
        } catch {
          onErrorRef.current?.("Failed to fetch status");
        }
        return;
      }

      if (content.trim() === "/review") {
        if (!cwdRef.current) {
          onErrorRef.current?.("No workspace selected");
          return;
        }
        try {
          const statusRes = await apiFetch(`/api/git/status?cwd=${encodeURIComponent(cwdRef.current)}`);
          const statusData = await statusRes.json();
          if (!statusData.isRepo || !statusData.files || statusData.files.length === 0) {
            const systemMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "system",
              content: "**No changes to review** — working tree is clean.",
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, systemMsg]);
            return;
          }
          const diffRes = await apiFetch(`/api/git/diff?cwd=${encodeURIComponent(cwdRef.current)}&full=true`);
          const diffData = await diffRes.json();
          const changedFiles = statusData.files.map((f: { status: string; path: string }) => `${f.status} ${f.path}`).join("\n");
          const reviewPrompt = [
            "Please review the current uncommitted changes in this repository.",
            "Focus on: potential bugs, code quality, security issues, and suggestions for improvement.",
            "",
            "Changed files:",
            changedFiles,
            "",
            diffData.stat ? `Diff stats:\n${diffData.stat}` : "",
            diffData.diff ? `\nFull diff:\n\`\`\`diff\n${diffData.diff}\n\`\`\`` : "",
          ].filter(Boolean).join("\n");
          content = reviewPrompt;
        } catch {
          onErrorRef.current?.("Failed to get changes for review");
          return;
        }
      }

      if (contextTokensRef.current >= AUTO_COMPACT_THRESHOLD) {
        try {
          const res = await apiFetch(`/api/conversations/${conversationId}/compact`, { method: "POST" });
          if (res.ok) {
            const reloaded = await apiFetch(`/api/conversations/${conversationId}/messages`);
            const reloadedData = await reloaded.json();
            setMessages(reloadedData.messages);
            setContextTokens(0);
            setSessionCost(0);
            setShowCompactSuggestion(false);
            onInfoRef.current?.("Conversation was automatically compacted to free up context.");
          }
        } catch {
          // compact failed — continue with send anyway
        }
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        images: images && images.length > 0 ? images : undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming({ isStreaming: true, text: "", thinking: "", toolCalls: [], subagents: [] });

      try {
        await apiFetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, images }),
        });
      } catch {
        onErrorRef.current?.("Failed to send message");
      }
    },
    [conversationId, setStreaming],
  );

  const retry = useCallback(async () => {
    if (!conversationId || isStreamingRef.current) return;

    let lastContent: string | undefined;
    let lastImages: ImageAttachment[] | undefined;

    setMessages((prev) => {
      const lastUserIdx = prev.findLastIndex((m) => m.role === "user");
      if (lastUserIdx === -1) return prev;

      const lastUserMsg = prev[lastUserIdx];
      lastContent = lastUserMsg.content;
      lastImages = lastUserMsg.images;
      const withoutLast = prev.slice(0, lastUserIdx);

      return [
        ...withoutLast,
        { ...lastUserMsg, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
      ];
    });

    if (!lastContent) return;

    setStreaming({ isStreaming: true, text: "", thinking: "", toolCalls: [], subagents: [] });
    toolCallsRef.current = [];

    try {
      await apiFetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: lastContent, images: lastImages }),
      });
    } catch {
      onErrorRef.current?.("Failed to retry message");
    }
  }, [conversationId, setStreaming]);

  const abort = useCallback(async () => {
    if (!conversationId) return;
    try {
      await apiFetch(`/api/conversations/${conversationId}/abort`, {
        method: "POST",
      });
    } catch {
      onErrorRef.current?.("Failed to abort");
    }
  }, [conversationId]);

  const dismissCompactSuggestion = useCallback(() => {
    setShowCompactSuggestion(false);
    if (conversationId) dismissedRef.current.add(conversationId);
  }, [conversationId]);

  return { messages, streaming, sendMessage, abort, retry, showCompactSuggestion, dismissCompactSuggestion, contextTokens, sessionCost, workflowState };
}
