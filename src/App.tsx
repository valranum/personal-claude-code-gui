import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  const [filesRefreshKey, setFilesRefreshKey] = useState(0);
  const openPreviewRef = useRef<(() => void) | null>(null);

  const handleStreamingEnd = useCallback(() => {
    setFilesRefreshKey((k) => k + 1);
  }, []);

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
        const newProjectDirective = [
          "\n\nNEW PROJECT CONTEXT: The user just created a brand new project in an empty directory.",
          "The user is a designer, not a developer. They don't know or care about frameworks, languages, or tooling.",
          "\n\nYour approach for new projects:",
          "\n1. FIRST, have a brief creative conversation. Ask 2-3 short questions about their vision — things like what sections they want, their style/color preferences, any reference sites they like, or what content they'll feature. Keep it casual and concise, not a long questionnaire.",
          "\n2. ONCE you have a sense of what they want, THEN scaffold the project, install dependencies, start the dev server, and build it. Choose the tech stack yourself (default to React with Vite and TypeScript) — never ask the user about technical choices.",
          "\n\nDEVICE FRAMES:",
          "When building mobile prototypes or app mockups, always use the iPhone 17 Pro as the default device frame (6.3\" display, Dynamic Island, thinner bezels). Never default to older iPhone models.",
          "\n\nIMPORTANT TONE:",
          "Keep your messages short, friendly, and non-technical.",
          "Don't mention package registries, version conflicts, config files, or internal tooling details.",
          "When installing dependencies or fixing build issues, just say something brief like \"Setting things up...\" or \"Almost ready...\"",
          "Save the technical details for code comments if needed — your chat messages should feel simple and reassuring.",
        ].join("");
        await apiFetch(`/api/conversations/${conv.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemPrompt: (conv.systemPrompt || "") + newProjectDirective }),
        });
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

  const handleGoHome = useCallback(() => {
    setActiveId(null);
  }, [setActiveId]);

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
      refreshKey={filesRefreshKey}
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
      onStreamingEnd={handleStreamingEnd}
      onOpenPreview={() => openPreviewRef.current?.()}
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
        onGoHome={handleGoHome}
        isWelcome={!activeConversation}
        chatOnly={!!activeConversation?.chatOnly}
        onToast={(msg) => addToast(msg, "info")}
        openPreviewRef={openPreviewRef}
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
