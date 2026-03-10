import { query } from "@anthropic-ai/claude-agent-sdk";
import { EventEmitter } from "events";
import { ImageAttachment, ToolCallInfo, TokenUsage, MCPServerConfig } from "./types.js";

const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export class AgentSession {
  conversationId: string;
  cwd: string;
  model: string;
  systemPrompt?: string;
  sessionId?: string;
  mcpServers?: MCPServerConfig[];
  events: EventEmitter;
  private isRunning = false;
  private abortController: AbortController | null = null;

  constructor(conversationId: string, cwd: string, model: string, sessionId?: string, systemPrompt?: string, mcpServers?: MCPServerConfig[]) {
    this.conversationId = conversationId;
    this.cwd = cwd;
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.sessionId = sessionId;
    this.mcpServers = mcpServers;
    this.events = new EventEmitter();
    this.events.setMaxListeners(20);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildPrompt(
    content: string,
    images?: ImageAttachment[],
  ): any {
    if (!images || images.length === 0) {
      return content;
    }

    const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    const contentBlocks: unknown[] = [];
    for (const img of images) {
      if (!ALLOWED_MEDIA.has(img.mediaType)) continue;
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType,
          data: img.data,
        },
      });
    }
    contentBlocks.push({ type: "text", text: content });

    const message = {
      type: "user" as const,
      message: {
        role: "user" as const,
        content: contentBlocks,
      },
      parent_tool_use_id: null,
      session_id: "",
    };

    async function* generate() {
      yield message;
    }
    return generate();
  }

  async sendMessage(
    content: string,
    images?: ImageAttachment[],
  ): Promise<{ text: string; toolCalls: ToolCallInfo[]; tokenUsage: TokenUsage }> {
    if (this.isRunning) {
      throw new Error("Agent is already processing a message");
    }
    this.isRunning = true;

    let resultText = "";
    const toolCalls: ToolCallInfo[] = [];
    let totalInput = 0;
    let totalOutput = 0;

    this.abortController = new AbortController();

    const options: Record<string, unknown> = {
      model: this.model,
      allowedTools: [
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
        "WebSearch",
        "WebFetch",
      ],
      permissionMode: "acceptEdits",
      cwd: this.cwd,
      abortController: this.abortController,
      includePartialMessages: true,
    };

    if (this.systemPrompt) {
      options.systemPrompt = this.systemPrompt;
    }

    if (this.mcpServers && this.mcpServers.length > 0) {
      options.mcpServers = this.mcpServers.map((s) => {
        if (s.transport === "sse" && s.url) {
          return { name: s.name, transport: "sse" as const, url: s.url };
        }
        return {
          name: s.name,
          transport: "stdio" as const,
          command: s.command || "",
          args: s.args || [],
          env: s.env,
        };
      });
    }

    if (this.sessionId) {
      options.resume = this.sessionId;
    }

    this.emit("processing", {});

    const prompt = this.buildPrompt(content, images);

    try {
      for await (const message of query({ prompt, options })) {
        const msg = message as Record<string, unknown>;

        // Accumulate token usage from any message that carries it
        const usage = msg.usage as Record<string, number> | undefined;
        if (usage) {
          totalInput += usage.input_tokens || 0;
          totalOutput += usage.output_tokens || 0;
        }
        // Some SDK versions nest usage in message.message.usage
        const innerMsg = msg.message as Record<string, unknown> | undefined;
        const innerUsage = innerMsg?.usage as Record<string, number> | undefined;
        if (innerUsage) {
          totalInput += innerUsage.input_tokens || 0;
          totalOutput += innerUsage.output_tokens || 0;
        }

        if (msg.type === "system" && msg.subtype === "init") {
          this.sessionId = msg.session_id as string;
          this.emit("init", { sessionId: this.sessionId });
          continue;
        }

        if ("result" in msg && typeof msg.result === "string") {
          resultText = msg.result;
          this.emit("result", { text: resultText });
          continue;
        }

        if (msg.type === "tool_use" || msg.tool_name) {
          const tc: ToolCallInfo = {
            id: (msg.id as string) || crypto.randomUUID(),
            name: (msg.tool_name as string) || (msg.name as string) || "unknown",
            input: (msg.input as Record<string, unknown>) || {},
            status: "running",
          };
          toolCalls.push(tc);
          this.emit("tool_use", tc);
          continue;
        }

        if (msg.type === "tool_result") {
          const toolId = msg.tool_use_id as string;
          const tc = toolCalls.find((t) => t.id === toolId);
          if (tc) {
            tc.output =
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content);
            tc.status = "done";
            this.emit("tool_result", {
              id: tc.id,
              output: tc.output,
            });
          }
          continue;
        }

        if (msg.type === "assistant") {
          const innerMessage = msg.message as Record<string, unknown> | undefined;
          const content = innerMessage?.content ?? msg.content;
          if (typeof content === "string" && content) {
            this.emit("message", { content });
          } else if (Array.isArray(content)) {
            for (const block of content as Array<Record<string, unknown>>) {
              if (block.type === "thinking" && typeof block.thinking === "string") {
                this.emit("thinking", { content: block.thinking });
              } else if (block.type === "text" && typeof block.text === "string") {
                this.emit("message", { content: block.text });
              } else if (block.type === "tool_use") {
                const tc: ToolCallInfo = {
                  id: (block.id as string) || crypto.randomUUID(),
                  name: (block.name as string) || "unknown",
                  input: (block.input as Record<string, unknown>) || {},
                  status: "running",
                };
                toolCalls.push(tc);
                this.emit("tool_use", tc);
              }
            }
          }
          continue;
        }

        if (msg.type === "content_block_delta") {
          const delta = msg.delta as Record<string, unknown> | undefined;
          if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
            this.emit("thinking", { content: delta.thinking });
            continue;
          }
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            this.emit("message", { content: delta.text });
            continue;
          }
        }

        if (msg.type === "stream_event") {
          const event = msg.event as Record<string, unknown> | undefined;
          if (event?.type === "content_block_start") {
            const block = event.content_block as Record<string, unknown> | undefined;
            if (block?.type === "thinking" && typeof block.thinking === "string") {
              this.emit("thinking", { content: block.thinking });
              continue;
            }
          }
          if (event?.type === "content_block_delta") {
            const delta = event.delta as Record<string, unknown> | undefined;
            if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
              this.emit("thinking", { content: delta.thinking });
              continue;
            }
          }
          continue;
        }

        this.emit("message", msg);
      }
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      const isAbort =
        error instanceof Error &&
        (error.name === "AbortError" ||
          /abort/i.test(error.message) ||
          /cancel/i.test(error.message));
      if (!isAbort) {
        this.emit("error", { message: errMsg });
      }
    } finally {
      this.abortController = null;
      this.isRunning = false;
    }

    const rates = COST_PER_MILLION[this.model] || { input: 3, output: 15 };
    const tokenUsage: TokenUsage = {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      estimatedCost:
        (totalInput * rates.input + totalOutput * rates.output) / 1_000_000,
    };

    this.emit("usage", tokenUsage);
    this.emit("done", {});

    return { text: resultText, toolCalls, tokenUsage };
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isRunning = false;
  }

  private emit(type: string, data: unknown): void {
    this.events.emit("event", { type, data });
  }
}
