import { query } from "@anthropic-ai/claude-agent-sdk";
import { EventEmitter } from "events";
import { ImageAttachment, ToolCallInfo } from "./types.js";

export class AgentSession {
  conversationId: string;
  cwd: string;
  model: string;
  sessionId?: string;
  events: EventEmitter;
  private isRunning = false;
  private abortController: AbortController | null = null;

  constructor(conversationId: string, cwd: string, model: string, sessionId?: string) {
    this.conversationId = conversationId;
    this.cwd = cwd;
    this.model = model;
    this.sessionId = sessionId;
    this.events = new EventEmitter();
    this.events.setMaxListeners(20);
  }

  private buildPrompt(
    content: string,
    images?: ImageAttachment[],
  ): string | AsyncIterable<unknown> {
    if (!images || images.length === 0) {
      return content;
    }

    const contentBlocks: unknown[] = [];
    for (const img of images) {
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
  ): Promise<{ text: string; toolCalls: ToolCallInfo[] }> {
    if (this.isRunning) {
      throw new Error("Agent is already processing a message");
    }
    this.isRunning = true;

    let resultText = "";
    const toolCalls: ToolCallInfo[] = [];

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
    };

    if (this.sessionId) {
      options.resume = this.sessionId;
    }

    this.emit("processing", {});

    const prompt = this.buildPrompt(content, images);

    try {
      for await (const message of query({ prompt, options })) {
        const msg = message as Record<string, unknown>;

        // Capture session ID from init message
        if (msg.type === "system" && msg.subtype === "init") {
          this.sessionId = msg.session_id as string;
          this.emit("init", { sessionId: this.sessionId });
          continue;
        }

        // Final result
        if ("result" in msg && typeof msg.result === "string") {
          resultText = msg.result;
          this.emit("result", { text: resultText });
          continue;
        }

        // Try to detect tool use messages
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

        // Try to detect tool results
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

        // Forward any other message types
        this.emit("message", msg);
      }
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      this.emit("error", { message: errMsg });
    } finally {
      this.abortController = null;
      this.isRunning = false;
      this.emit("done", {});
    }

    return { text: resultText, toolCalls };
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
