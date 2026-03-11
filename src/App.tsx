import { useState, useEffect, useCallback, useMemo } from "react";
import { DockableLayout } from "./components/DockableLayout";
import { ChatsPanel } from "./components/ChatsPanel";
import { FilesPanel } from "./components/FilesPanel";
import { ChatView } from "./components/ChatView";
import { PreviewPanel } from "./components/PreviewPanel";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ToastContainer";
import { ToastProvider, useToast } from "./hooks/useToast";
import { useConversations } from "./hooks/useConversations";
import { apiFetch } from "./utils/api";

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
    pinConversation,
    refresh,
  } = useConversations((msg) => addToast(msg, "error"));

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === "n") {
        e.preventDefault();
        createConversation();
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
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const handleOpenFolder = useCallback(
    (cwd?: string) => {
      createConversation(cwd);
    },
    [createConversation],
  );

  const handleNewProject = useCallback(
    async (cwd: string, initialPrompt: string) => {
      const conv = await createConversation(cwd);
      if (conv) {
        setPendingPrompt(initialPrompt);
      }
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
      await apiFetch(`/api/conversations/${activeId}/clear`, { method: "POST" });
      window.location.reload();
    } catch {
      addToast("Failed to clear conversation", "error");
    }
  }, [activeId, addToast]);

  const handleCompact = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await apiFetch(`/api/conversations/${activeId}/compact`, { method: "POST" });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      addToast("Failed to compact conversation", "error");
    }
  }, [activeId, addToast]);

  const handleFork = useCallback((newConversationId: string) => {
    refresh();
    setActiveId(newConversationId);
  }, [refresh, setActiveId]);

  const handleShare = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await apiFetch(`/api/conversations/${activeId}/share`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await navigator.clipboard.writeText(data.url);
      addToast("Share link copied to clipboard!", "info");
    } catch {
      addToast("Failed to create share link", "error");
    }
  }, [activeId, addToast]);

  const handleChangeCwd = useCallback((newCwd: string) => {
    if (activeId) updateConversationCwd(activeId, newCwd);
  }, [activeId, updateConversationCwd]);

  const chatsContent = (
    <ChatsPanel
      conversations={conversations}
      activeId={activeId}
      activeCwd={activeConversation?.cwd}
      onSelect={setActiveId}
      onCreate={createConversation}
      onDelete={deleteConversation}
      onRename={renameConversation}
      onPin={pinConversation}
    />
  );

  const filesContent = activeConversation ? (
    <FilesPanel
      cwd={activeConversation.cwd}
      onChangeCwd={handleChangeCwd}
      onFileClick={setOpenFilePath}
    />
  ) : (
    <div className="sidebar-empty">Open a project folder to browse files.</div>
  );

  const mainContent = activeConversation ? (
    <ChatView
      conversationId={activeId}
      conversation={activeConversation}
      onChangeModel={updateConversationModel}
      onTitleUpdate={updateLocalTitle}
      onFork={handleFork}
      theme={theme}
      onToggleTheme={toggleTheme}
      openFilePath={openFilePath}
      onCloseFile={() => setOpenFilePath(null)}
      initialPrompt={pendingPrompt}
      onConsumePrompt={() => setPendingPrompt(null)}
    />
  ) : (
    <WelcomeScreen
      onOpenFolder={handleOpenFolder}
      onNewProject={handleNewProject}
      conversations={conversations}
    />
  );

  const previewContent = (
    <PreviewPanel cwd={activeConversation?.cwd} />
  );

  return (
    <>
      <DockableLayout
        chatsContent={chatsContent}
        filesContent={filesContent}
        mainContent={mainContent}
        previewContent={previewContent}
        theme={theme}
        onToggleTheme={toggleTheme}
        conversation={activeConversation ?? null}
      />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        conversations={conversations}
        activeId={activeId}
        onNewConversation={createConversation}
        onToggleSidebar={() => {}}
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
