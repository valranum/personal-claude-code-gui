export interface Conversation {
  id: string;
  title: string;
  cwd: string;
  model: string;
  systemPrompt?: string;
  sdkSessionId?: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImageAttachment {
  data: string;
  mediaType: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  images?: ImageAttachment[];
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

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface StreamingState {
  isStreaming: boolean;
  text: string;
  thinking: string;
  toolCalls: ToolCallInfo[];
}
