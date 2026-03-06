import { useState, useEffect, useCallback } from "react";
import { Conversation } from "../types";

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then(setConversations)
      .catch(() => setConversations([]));
  }, []);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((convs: Conversation[]) => {
        setConversations(convs);
        if (convs.length > 0) {
          setActiveId(convs[0].id);
        } else {
          fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
            .then((r) => r.json())
            .then((conv: Conversation) => {
              setConversations([conv]);
              setActiveId(conv.id);
            });
        }
      })
      .catch(() => setConversations([]));
  }, []);

  const createConversation = useCallback(async (cwd?: string) => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd }),
    });
    const conv: Conversation = await res.json();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv;
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
      }
    },
    [activeId],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const updated: Conversation = await res.json();
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? updated : c)),
      );
    },
    [],
  );

  return {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    deleteConversation,
    renameConversation,
    refresh,
  };
}
