import { useState, useEffect, useCallback, useMemo } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ToastContainer";
import { ToastProvider, useToast } from "./hooks/useToast";
import { useConversations } from "./hooks/useConversations";

export function App() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
      <ToastContainer />
    </ToastProvider>
  );
}

function AppContent() {
  const { addToast } = useToast();
  const {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    deleteConversation,
    renameConversation,
    updateConversationCwd,
    updateConversationModel,
    updateLocalTitle,
  } = useConversations((msg) => addToast(msg, "error"));

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("theme") as "dark" | "light") || "dark";
  });

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.min(Math.max(e.clientX, 200), 480);
      setSidebarWidth(newWidth);
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === "n") {
        e.preventDefault();
        createConversation();
      }
      if (isMod && e.key === "b") {
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
      }
      if (isMod && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createConversation]);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const handleOpenFolder = useCallback(
    (cwd?: string) => {
      createConversation(cwd);
    },
    [createConversation],
  );

  const handlePaletteChangeModel = useCallback(
    (model: string) => {
      if (activeId) updateConversationModel(activeId, model);
    },
    [activeId, updateConversationModel],
  );

  const handleClear = useCallback(async () => {
    if (!activeId) return;
    try {
      await fetch(`/api/conversations/${activeId}/clear`, { method: "POST" });
      window.location.reload();
    } catch {
      addToast("Failed to clear conversation", "error");
    }
  }, [activeId, addToast]);

  const handleCompact = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/conversations/${activeId}/compact`, { method: "POST" });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      addToast("Failed to compact conversation", "error");
    }
  }, [activeId, addToast]);

  const handleShare = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/conversations/${activeId}/share`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await navigator.clipboard.writeText(data.url);
      addToast("Share link copied to clipboard!", "info");
    } catch {
      addToast("Failed to create share link", "error");
    }
  }, [activeId, addToast]);

  return (
    <>
      <div className="app">
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={createConversation}
          onDelete={deleteConversation}
          onRename={renameConversation}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          width={sidebarWidth}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        {!sidebarCollapsed && (
          <div
            className="sidebar-resize-handle"
            onMouseDown={() => setIsResizing(true)}
          />
        )}
        {activeConversation ? (
          <ChatView
            conversationId={activeId}
            conversation={activeConversation}
            onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
            sidebarCollapsed={sidebarCollapsed}
            onChangeCwd={updateConversationCwd}
            onChangeModel={updateConversationModel}
            onTitleUpdate={updateLocalTitle}
          />
        ) : (
          <WelcomeScreen
            onOpenFolder={handleOpenFolder}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          />
        )}
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        conversations={conversations}
        activeId={activeId}
        onNewConversation={createConversation}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        onToggleTheme={toggleTheme}
        onSelectConversation={setActiveId}
        onChangeModel={handlePaletteChangeModel}
        onClear={activeId ? handleClear : undefined}
        onCompact={activeId ? handleCompact : undefined}
        onShare={activeId ? handleShare : undefined}
      />
    </>
  );
}
