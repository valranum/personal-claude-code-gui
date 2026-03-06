import { query } from "@anthropic-ai/claude-agent-sdk";
import { EventEmitter } from "events";
import { ToolCallInfo } from "./types.js";

export class AgentSession {
  conversationId: string;
  cwd: string;
  sessionId?: string;
  events: EventEmitter;
  private isRunning = false;

  constructor(conversationId: string, cwd: string, sessionId?: string) {
    this.conversationId = conversationId;
    this.cwd = cwd;
    this.sessionId = sessionId;
    this.events = new EventEmitter();
    this.events.setMaxListeners(20);
  }

  async sendMessage(
    content: string,
  ): Promise<{ text: string; toolCalls: ToolCallInfo[] }> {
    if (this.isRunning) {
      throw new Error("Agent is already processing a message");
    }
    this.isRunning = true;

    let resultText = "";
    const toolCalls: ToolCallInfo[] = [];

    const options: Record<string, unknown> = {
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
    };

    if (this.sessionId) {
      options.resume = this.sessionId;
    }

    this.emit("processing", {});

    try {
      for await (const message of query({ prompt: content, options })) {
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
      this.isRunning = false;
      this.emit("done", {});
    }

    return { text: resultText, toolCalls };
  }

  abort(): void {
    // The SDK doesn't expose abort directly, but we can signal
    this.isRunning = false;
  }

  private emit(type: string, data: unknown): void {
    this.events.emit("event", { type, data });
  }
}
