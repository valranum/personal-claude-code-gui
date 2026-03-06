import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMessage, ToolCallInfo, StreamingState } from "../types";
import { connectSSE, SSEEvent } from "../utils/sse";

const EMPTY_STREAMING: StreamingState = {
  isStreaming: false,
  text: "",
  toolCalls: [],
};

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingState>(EMPTY_STREAMING);
  const esRef = useRef<EventSource | null>(null);
  const toolCallsRef = useRef<ToolCallInfo[]>([]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setStreaming(EMPTY_STREAMING);
      return;
    }
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((r) => r.json())
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [conversationId]);

  // Connect SSE
  useEffect(() => {
    if (!conversationId) return;

    // Close existing connection
    esRef.current?.close();

    const handleEvent = (event: SSEEvent) => {
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
              role: "assistant",
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
              // If we accumulated text but never got a result event
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
          setStreaming((prev) => ({
            ...prev,
            isStreaming: false,
            text: prev.text || `Error: ${errMsg}`,
          }));
          break;
        }

        case "message": {
          // Try to extract useful content from generic SDK messages
          const data = event.data as Record<string, unknown>;
          if (typeof data.content === "string") {
            setStreaming((prev) => ({
              ...prev,
              text: prev.text + data.content,
            }));
          }
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
    async (content: string) => {
      if (!conversationId || streaming.isStreaming) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming({ isStreaming: true, text: "", toolCalls: [] });

      await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    },
    [conversationId, streaming.isStreaming],
  );

  const abort = useCallback(async () => {
    if (!conversationId) return;
    await fetch(`/api/conversations/${conversationId}/abort`, {
      method: "POST",
    });
  }, [conversationId]);

  return { messages, streaming, sendMessage, abort };
}
