import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMessage, ImageAttachment, ToolCallInfo, StreamingState } from "../types";
import { connectSSE, SSEEvent } from "../utils/sse";

const EMPTY_STREAMING: StreamingState = {
  isStreaming: false,
  text: "",
  toolCalls: [],
};

export function useChat(
  conversationId: string | null,
  onTitleUpdate?: (title: string) => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingState>(EMPTY_STREAMING);
  const esRef = useRef<EventSource | null>(null);
  const toolCallsRef = useRef<ToolCallInfo[]>([]);

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

  useEffect(() => {
    if (!conversationId) return;

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
          const data = event.data as Record<string, unknown>;
          if (typeof data.content === "string") {
            setStreaming((prev) => ({
              ...prev,
              text: prev.text + data.content,
            }));
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

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        images: images && images.length > 0 ? images : undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming({ isStreaming: true, text: "", toolCalls: [] });

      await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, images }),
      });
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
      });

      return [
        ...withoutLast,
        { ...lastUserMsg, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
      ];
    });
  }, [conversationId, streaming.isStreaming]);

  const abort = useCallback(async () => {
    if (!conversationId) return;
    await fetch(`/api/conversations/${conversationId}/abort`, {
      method: "POST",
    });
  }, [conversationId]);

  return { messages, streaming, sendMessage, abort, retry };
}
