import { useState, useEffect, useCallback, useRef } from "react";
import { useChat } from "../hooks/useChat";
import { useToast } from "../hooks/useToast";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

import { CompactSuggestionBanner } from "./CompactSuggestionBanner";
import { ContextStatusBar } from "./ContextStatusBar";
import { ArtifactPanel } from "./ArtifactPanel";
import { FileEditorPanel } from "./FileEditorPanel";
import { Conversation } from "../types";
import { apiFetch } from "../utils/api";

interface ArtifactState {
  language: string;
  code: string;
}

interface ChatViewProps {
  conversationId: string | null;
  conversation: Conversation | null;
  onChangeModel: (id: string, model: string) => void;
  onTitleUpdate: (conversationId: string, title: string) => void;
  onFork?: (newConversationId: string) => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  openFilePath?: string | null;
  onCloseFile?: () => void;
  initialPrompt?: string | null;
  onConsumePrompt?: () => void;
}

export function ChatView({
  conversationId,
  conversation,
  onChangeModel,
  onTitleUpdate,
  onFork,
  theme,
  onToggleTheme,
  openFilePath,
  onCloseFile,
  initialPrompt,
  onConsumePrompt,
}: ChatViewProps) {
  const { addToast } = useToast();
  const { messages, streaming, sendMessage, abort, retry, showCompactSuggestion, dismissCompactSuggestion, contextTokens, sessionCost } = useChat(
    conversationId,
    (title) => {
      if (conversationId) onTitleUpdate(conversationId, title);
    },
    (msg) => addToast(msg, "error"),
    (msg) => addToast(msg, "info"),
    conversation?.cwd,
    conversation?.model,
  );

  const promptSentRef = useRef(false);

  useEffect(() => {
    if (!initialPrompt) {
      promptSentRef.current = false;
      return;
    }
    if (!promptSentRef.current && sendMessage && !streaming.isStreaming) {
      promptSentRef.current = true;
      sendMessage(initialPrompt);
      onConsumePrompt?.();
    }
  }, [initialPrompt]);

  const isEmpty = messages.length === 0 && !streaming.isStreaming;
  const [artifact, setArtifact] = useState<ArtifactState | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [artifactWidth, setArtifactWidth] = useState(45);
  const isResizingArtifact = useRef(false);

  useEffect(() => {
    setArtifact(null);
  }, [conversationId]);

  useEffect(() => {
    apiFetch("/api/models")
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => {});
  }, []);

  const handleEditMessage = useCallback(async (messageId: string) => {
    if (!conversationId || !onFork) return;
    try {
      const res = await apiFetch(`/api/conversations/${conversationId}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      if (!res.ok) throw new Error("Fork failed");
      const newConv = await res.json();
      onFork(newConv.id);
    } catch {
      addToast("Failed to branch conversation", "error");
    }
  }, [conversationId, onFork, addToast]);

  const handleOpenArtifact = useCallback((language: string, code: string) => {
    setArtifact({ language, code });
  }, []);

  const handleCloseArtifact = useCallback(() => {
    setArtifact(null);
  }, []);

  const handleArtifactResizeStart = useCallback(() => {
    isResizingArtifact.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingArtifact.current) return;
      const containerWidth = document.querySelector(".chat-view")?.clientWidth || window.innerWidth;
      const pct = ((containerWidth - e.clientX + (document.querySelector(".chat-view")?.getBoundingClientRect().left || 0)) / containerWidth) * 100;
      setArtifactWidth(Math.min(Math.max(pct, 15), 85));
    };

    const onMouseUp = () => {
      isResizingArtifact.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const hasRightPanel = !!(artifact || openFilePath);
  const chatViewClass = [
    "chat-view",
    hasRightPanel ? "has-artifact" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={chatViewClass}>
      <div className="chat-main">
        <MessageList
          messages={messages}
          streaming={streaming}
          conversationId={conversationId}
          onRetry={retry}
          onSendPrompt={sendMessage}
          onToast={(msg, type) => addToast(msg, type || "info")}
          onOpenArtifact={handleOpenArtifact}
          onEditMessage={onFork ? handleEditMessage : undefined}
          chatOnly={!!conversation?.chatOnly}
          renderInput={isEmpty ? () => (
            <ChatInput
              onSend={sendMessage}
              onAbort={abort}
              isStreaming={streaming.isStreaming}
              disabled={!conversationId}
              placeholder="What would you like to work on?"
              models={models}
              currentModel={conversation?.model}
              onChangeModel={conversation ? (modelId) => onChangeModel(conversation.id, modelId) : undefined}
              tokenUsage={conversation?.tokenUsage}
              contextTokens={contextTokens}
              cwd={conversation?.cwd}
            />
          ) : undefined}
        />
        {showCompactSuggestion && (
          <CompactSuggestionBanner
            onCompact={() => {
              dismissCompactSuggestion();
              sendMessage("/compact");
            }}
            onDismiss={dismissCompactSuggestion}
          />
        )}
        {!isEmpty && conversation && (
          <ContextStatusBar
            model={conversation.model || ""}
            contextTokens={contextTokens}
            contextWindow={200_000}
            sessionCost={sessionCost}
            sessionStart={conversation.createdAt}
            isStreaming={streaming.isStreaming}
          />
        )}
        {!isEmpty && (
          <ChatInput
            onSend={sendMessage}
            onAbort={abort}
            isStreaming={streaming.isStreaming}
            disabled={!conversationId}
            models={models}
            currentModel={conversation?.model}
            onChangeModel={conversation ? (modelId) => onChangeModel(conversation.id, modelId) : undefined}
            tokenUsage={conversation?.tokenUsage}
            contextTokens={contextTokens}
            cwd={conversation?.cwd}
          />
        )}
      </div>
      {hasRightPanel && (
        <>
          <div
            className="artifact-resize-handle"
            onMouseDown={handleArtifactResizeStart}
          />
          {artifact ? (
            <ArtifactPanel
              language={artifact.language}
              code={artifact.code}
              onClose={handleCloseArtifact}
              widthPercent={artifactWidth}
            />
          ) : openFilePath ? (
            <FileEditorPanel
              filePath={openFilePath}
              onClose={() => onCloseFile?.()}
              widthPercent={artifactWidth}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
