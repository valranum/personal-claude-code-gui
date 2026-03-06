import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMessage, ImageAttachment, ToolCallInfo, StreamingState } from "../types";
import { connectSSE, SSEEvent } from "../utils/sse";

const EMPTY_STREAMING: StreamingState = {
  isStreaming: false,
  text: "",
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
  const [streaming, setStreaming] = useState<StreamingState>(EMPTY_STREAMING);
  const [showCompactSuggestion, setShowCompactSuggestion] = useState(false);
  const dismissedRef = useRef<Set<string>>(new Set());
  const esRef = useRef<EventSource | null>(null);
  const toolCallsRef = useRef<ToolCallInfo[]>([]);
  const effectIdRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setStreaming(EMPTY_STREAMING);
      setShowCompactSuggestion(false);
      return;
    }
    setMessages([]);
    setStreaming(EMPTY_STREAMING);
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((r) => r.json())
      .then((data: { messages: ChatMessage[]; lastTurnInputTokens: number }) => {
        setMessages(data.messages);
        if (
          data.lastTurnInputTokens >= CONTEXT_TOKEN_THRESHOLD &&
          !dismissedRef.current.has(conversationId)
        ) {
          setShowCompactSuggestion(true);
        } else {
          setShowCompactSuggestion(false);
        }
      })
      .catch(() => {
        setMessages([]);
        onErrorRef.current?.("Failed to load messages");
      });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    esRef.current?.close();
    toolCallsRef.current = [];
    const currentEffectId = ++effectIdRef.current;

    const handleEvent = (event: SSEEvent) => {
      if (currentEffectId !== effectIdRef.current) return;
      switch (event.type) {
        case "processing":
          setStreaming({ isStreaming: true, text: "", toolCalls: [] });
          toolCallsRef.current = [];
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
            if (prev.isStreaming && prev.text) {
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

        case "message": {
          const data = event.data as Record<string, unknown>;
          if (typeof data.content === "string") {
            setStreaming((prev) => ({
              ...prev,
              text: prev.text + data.content,
            }));
          }
          break;
        }

        case "context_usage": {
          const { inputTokens } = event.data as { inputTokens: number };
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

    const es = connectSSE(
      `/api/conversations/${conversationId}/stream`,
      handleEvent,
    );
    esRef.current = es;

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [conversationId]);

  const sendMessage = useCallback(
    async (content: string, images?: ImageAttachment[]) => {
      if (!conversationId || streaming.isStreaming) return;

      if (content.trim() === "/clear") {
        try {
          await fetch(`/api/conversations/${conversationId}/clear`, { method: "POST" });
          setMessages([]);
        } catch {
          onErrorRef.current?.("Failed to clear conversation");
        }
        return;
      }
      if (content.trim() === "/compact") {
        setStreaming({ isStreaming: true, text: "", toolCalls: [] });
        try {
          const res = await fetch(`/api/conversations/${conversationId}/compact`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          const reloaded = await fetch(`/api/conversations/${conversationId}/messages`);
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
          const res = await fetch(`/api/usage?${params}`);
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
      setStreaming({ isStreaming: true, text: "", toolCalls: [] });

      try {
        await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, images }),
        });
      } catch {
        onErrorRef.current?.("Failed to send message");
      }
    },
    [conversationId, streaming.isStreaming],
  );

  const retry = useCallback(async () => {
    if (!conversationId || streaming.isStreaming) return;

    setMessages((prev) => {
      const lastUserIdx = prev.findLastIndex((m) => m.role === "user");
      if (lastUserIdx === -1) return prev;

      const lastUserMsg = prev[lastUserIdx];
      const withoutLast = prev.slice(0, lastUserIdx);

      setStreaming({ isStreaming: true, text: "", toolCalls: [] });
      fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: lastUserMsg.content }),
      }).catch(() => {
        onErrorRef.current?.("Failed to retry message");
      });

      return [
        ...withoutLast,
        { ...lastUserMsg, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
      ];
    });
  }, [conversationId, streaming.isStreaming]);

  const abort = useCallback(async () => {
    if (!conversationId) return;
    try {
      await fetch(`/api/conversations/${conversationId}/abort`, {
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

  return { messages, streaming, sendMessage, abort, retry, showCompactSuggestion, dismissCompactSuggestion };
}
