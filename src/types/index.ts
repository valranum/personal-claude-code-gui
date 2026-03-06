export interface Conversation {
  id: string;
  title: string;
  cwd: string;
  sdkSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  timestamp: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: "running" | "done" | "error";
}

export interface StreamingState {
  isStreaming: boolean;
  text: string;
  toolCalls: ToolCallInfo[];
}
