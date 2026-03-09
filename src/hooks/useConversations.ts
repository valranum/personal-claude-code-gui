import { useState, useEffect, useCallback, useRef } from "react";
import { Conversation } from "../types";

export function useConversations(onError?: (message: string) => void) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const refresh = useCallback(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then(setConversations)
      .catch(() => {
        setConversations([]);
        onErrorRef.current?.("Failed to load conversations");
      });
  }, []);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((convs: Conversation[]) => {
        setConversations(convs);
        if (convs.length > 0) {
          setActiveId(convs[0].id);
        }
      })
      .catch(() => {
        setConversations([]);
        onErrorRef.current?.("Failed to load conversations");
      });
  }, []);

  const createConversation = useCallback(async (cwd?: string) => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      const conv: Conversation = await res.json();
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      return conv;
    } catch {
      onErrorRef.current?.("Failed to create conversation");
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) {
          setActiveId(null);
        }
      } catch {
        onErrorRef.current?.("Failed to delete conversation");
      }
    },
    [activeId],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        const res = await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        const updated: Conversation = await res.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? updated : c)),
        );
      } catch {
        onErrorRef.current?.("Failed to rename conversation");
      }
    },
    [],
  );

  const updateConversationCwd = useCallback(
    async (id: string, cwd: string) => {
      try {
        const res = await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd }),
        });
        const updated: Conversation = await res.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? updated : c)),
        );
      } catch {
        onErrorRef.current?.("Failed to update workspace");
      }
    },
    [],
  );

  const updateLocalTitle = useCallback(
    (id: string, title: string) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c)),
      );
    },
    [],
  );

  const pinConversation = useCallback(
    async (id: string, pinned: boolean) => {
      try {
        const res = await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned }),
        });
        const updated: Conversation = await res.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? updated : c)),
        );
      } catch {
        onErrorRef.current?.("Failed to pin conversation");
      }
    },
    [],
  );

  const updateConversationModel = useCallback(
    async (id: string, model: string) => {
      try {
        const res = await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        });
        const updated: Conversation = await res.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? updated : c)),
        );
      } catch {
        onErrorRef.current?.("Failed to update model");
      }
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
    updateConversationCwd,
    updateConversationModel,
    updateLocalTitle,
    pinConversation,
    refresh,
  };
}
