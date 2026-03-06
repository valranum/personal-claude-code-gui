import { useState, useCallback } from "react";
import { useChat } from "../hooks/useChat";
import { useToast } from "../hooks/useToast";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { WorkspaceBar } from "./WorkspaceBar";
import { CompactSuggestionBanner } from "./CompactSuggestionBanner";
import { ArtifactPanel } from "./ArtifactPanel";
import { Conversation } from "../types";

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
}

export function ChatView({
  conversationId,
  conversation,
  onToggleSidebar,
  sidebarCollapsed,
  onChangeCwd,
  onChangeModel,
  onTitleUpdate,
}: ChatViewProps) {
  const { addToast } = useToast();
  const { messages, streaming, sendMessage, abort, retry, showCompactSuggestion, dismissCompactSuggestion } = useChat(
    conversationId,
    (title) => {
      if (conversationId) onTitleUpdate(conversationId, title);
    },
    (msg) => addToast(msg, "error"),
  );

  const [artifact, setArtifact] = useState<ArtifactState | null>(null);

  const handleOpenArtifact = useCallback((language: string, code: string) => {
    setArtifact({ language, code });
  }, []);

  const handleCloseArtifact = useCallback(() => {
    setArtifact(null);
  }, []);

  return (
    <div className={`chat-view ${artifact ? "has-artifact" : ""}`}>
      <div className="chat-main">
        <WorkspaceBar
          conversation={conversation}
          onChangeCwd={onChangeCwd}
          onChangeModel={onChangeModel}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
        />
        <MessageList
          messages={messages}
          streaming={streaming}
          conversationId={conversationId}
          onRetry={retry}
          onSendPrompt={sendMessage}
          onToast={(msg, type) => addToast(msg, type || "info")}
          onOpenArtifact={handleOpenArtifact}
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
        <ChatInput
          onSend={sendMessage}
          onAbort={abort}
          isStreaming={streaming.isStreaming}
          disabled={!conversationId}
        />
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
