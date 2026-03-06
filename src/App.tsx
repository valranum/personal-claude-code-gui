import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { useConversations } from "./hooks/useConversations";

export function App() {
  const {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    deleteConversation,
  } = useConversations();

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={createConversation}
        onDelete={deleteConversation}
      />
      <ChatView conversationId={activeId} />
    </div>
  );
}
