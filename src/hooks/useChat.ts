import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMessage, ImageAttachment, ToolCallInfo, StreamingState } from "../types";
import { connectSSE, SSEEvent } from "../utils/sse";
import { apiFetch, getAuthToken } from "../utils/api";

const EMPTY_STREAMING: StreamingState = {
  isStreaming: false,
  text: "",
  thinking: "",
  toolCalls: [],
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

// ~75% of 200k context window — trigger compact suggestion
const CONTEXT_TOKEN_THRESHOLD = 150_000;

export function useChat(
  conversationId: string | null,
  onTitleUpdate?: (title: string) => void,
  onError?: (message: string) => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, _setStreaming] = useState<StreamingState>(EMPTY_STREAMING);
  const [showCompactSuggestion, setShowCompactSuggestion] = useState(false);
  const [contextTokens, setContextTokens] = useState(0);

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
  const fetchAbortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const resultHandledRef = useRef(false);
  onErrorRef.current = onError;

  useEffect(() => {
    fetchAbortRef.current?.abort();
    if (!conversationId) {
      setMessages([]);
      setStreaming(EMPTY_STREAMING);
      setShowCompactSuggestion(false);
      setContextTokens(0);
      return;
    }
    setMessages([]);
    setStreaming(EMPTY_STREAMING);
    setContextTokens(0);
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    apiFetch(`/api/conversations/${conversationId}/messages`)
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
          setStreaming({ isStreaming: true, text: "", thinking: "", toolCalls: [] });
          toolCallsRef.current = [];
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

        case "title_updated": {
          const { title } = event.data as { title: string };
          onTitleUpdate?.(title);
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
        setStreaming({ isStreaming: true, text: "", thinking: "", toolCalls: [] });
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
      if (content.trim().startsWith("/usage")) {
        const arg = content.trim().split(/\s+/)[1] || "";
        const customDays = parseInt(arg, 10);
        const isCustom = !isNaN(customDays) && customDays > 0;
        const scope = arg === "week" || arg === "month" || isCustom ? "range" : "conversation";
        try {
          const params = new URLSearchParams();
          if (scope === "conversation") {
            params.set("scope", "conversation");
            params.set("id", conversationId);
          } else {
            params.set("scope", arg === "week" ? "week" : arg === "month" ? "month" : "week");
            if (isCustom) params.set("days", String(customDays));
          }
          const res = await apiFetch(`/api/usage?${params}`);
          const data = await res.json();
          const label = isCustom
            ? `Past ${customDays} day${customDays === 1 ? "" : "s"}`
            : arg === "week" ? "Past 7 days"
            : arg === "month" ? "Past 30 days"
            : "This conversation";
          const systemMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "system",
            content: `**${label}** — ${formatTokens(data.inputTokens)} input tokens · ${formatTokens(data.outputTokens)} output tokens · ${formatCost(data.estimatedCost)}`,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, systemMsg]);
        } catch {
          onErrorRef.current?.("Failed to fetch usage data");
        }
        return;
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        images: images && images.length > 0 ? images : undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming({ isStreaming: true, text: "", thinking: "", toolCalls: [] });

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

    setStreaming({ isStreaming: true, text: "", thinking: "", toolCalls: [] });
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

  return { messages, streaming, sendMessage, abort, retry, showCompactSuggestion, dismissCompactSuggestion, contextTokens };
}
