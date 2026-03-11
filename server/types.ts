export interface Conversation {
  id: string;
  title: string;
  cwd: string;
  model: string;
  systemPrompt?: string;
  sdkSessionId?: string;
  tokenUsage?: TokenUsage;
  lastTurnInputTokens?: number;
  pinned?: boolean;
  forkedFrom?: { conversationId: string; messageId: string };
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
  role: "user" | "assistant";
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

export interface ConversationFile {
  conversation: Conversation;
  messages: ChatMessage[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface SSEEvent {
  type: string;
  data: unknown;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: "sonnet" | "opus" | "haiku" | "inherit";
}

export interface WorkspaceConfig {
  mcpServers: MCPServerConfig[];
  customAgents?: AgentConfig[];
  defaultSystemPrompt?: string;
}
