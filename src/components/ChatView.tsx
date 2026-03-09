import { useState, useEffect, useCallback } from "react";
import { useChat } from "../hooks/useChat";
import { useToast } from "../hooks/useToast";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { WorkspaceBar } from "./WorkspaceBar";
import { CompactSuggestionBanner } from "./CompactSuggestionBanner";
import { ArtifactPanel } from "./ArtifactPanel";
import { Conversation } from "../types";
import { apiFetch } from "../utils/api";

interface ArtifactState {
  language: string;
  code: string;
}

interface ChatViewProps {
  conversationId: string | null;
  conversation: Conversation | null;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  onChangeCwd: (id: string, cwd: string) => void;
  onChangeModel: (id: string, model: string) => void;
  onTitleUpdate: (conversationId: string, title: string) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function ChatView({
  conversationId,
  conversation,
  onToggleSidebar,
  sidebarCollapsed,
  onChangeCwd,
  onChangeModel,
  onTitleUpdate,
  theme,
  onToggleTheme,
}: ChatViewProps) {
  const { addToast } = useToast();
  const { messages, streaming, sendMessage, abort, retry, showCompactSuggestion, dismissCompactSuggestion } = useChat(
    conversationId,
    (title) => {
      if (conversationId) onTitleUpdate(conversationId, title);
    },
    (msg) => addToast(msg, "error"),
  );

  const isEmpty = messages.length === 0 && !streaming.isStreaming;
  const [artifact, setArtifact] = useState<ArtifactState | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    apiFetch("/api/models")
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => {});
  }, []);

  const handleOpenArtifact = useCallback((language: string, code: string) => {
    setArtifact({ language, code });
  }, []);

  const handleCloseArtifact = useCallback(() => {
    setArtifact(null);
  }, []);

  const chatViewClass = [
    "chat-view",
    artifact ? "has-artifact" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={chatViewClass}>
      <div className="chat-main">
        <WorkspaceBar
          conversation={conversation}
          onChangeCwd={onChangeCwd}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
        <MessageList
          messages={messages}
          streaming={streaming}
          conversationId={conversationId}
          onRetry={retry}
          onSendPrompt={sendMessage}
          onToast={(msg, type) => addToast(msg, type || "info")}
          onOpenArtifact={handleOpenArtifact}
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
        {!isEmpty && (
          <ChatInput
            onSend={sendMessage}
            onAbort={abort}
            isStreaming={streaming.isStreaming}
            disabled={!conversationId}
          />
        )}
      </div>
      {artifact && (
        <ArtifactPanel
          language={artifact.language}
          code={artifact.code}
          onClose={handleCloseArtifact}
        />
      )}
    </div>
  );
}
