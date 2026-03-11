import { useState, useEffect, useCallback, useRef } from "react";
import { Conversation } from "../types";
import { apiFetch } from "../utils/api";

export function useConversations(onError?: (message: string) => void) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const refresh = useCallback(() => {
    apiFetch("/api/conversations")
      .then((r) => {
        if (!r.ok) throw new Error("Server error");
        return r.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("Invalid response");
        setConversations(data);
      })
      .catch(() => {
        setConversations([]);
        onErrorRef.current?.("Failed to load conversations");
      });
  }, []);

  useEffect(() => {
    apiFetch("/api/conversations")
      .then((r) => {
        if (!r.ok) throw new Error("Server error");
        return r.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("Invalid response");
        const convs: Conversation[] = data;
        setConversations(convs);
      })
      .catch(() => {
        setConversations([]);
        onErrorRef.current?.("Failed to load conversations");
      });
  }, []);

  const createConversation = useCallback(async (cwd?: string) => {
    try {
      const res = await apiFetch("/api/conversations", {
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
        await apiFetch(`/api/conversations/${id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setActiveId((current) => (current === id ? null : current));
      } catch {
        onErrorRef.current?.("Failed to delete conversation");
      }
    },
    [],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        const res = await apiFetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) throw new Error("Server error");
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
        const res = await apiFetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd }),
        });
        if (!res.ok) throw new Error("Server error");
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
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, pinned } : c)),
      );
      try {
        const res = await apiFetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned }),
        });
        if (!res.ok) throw new Error("Server error");
        const updated: Conversation = await res.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? updated : c)),
        );
      } catch {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, pinned: !pinned } : c)),
        );
        onErrorRef.current?.("Failed to pin conversation");
      }
    },
    [],
  );

  const updateConversationModel = useCallback(
    async (id: string, model: string) => {
      try {
        const res = await apiFetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        });
        if (!res.ok) throw new Error("Server error");
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
