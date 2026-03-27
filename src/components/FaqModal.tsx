import { useEffect, useRef } from "react";

const FAQ_ITEMS = [
  {
    q: "What is Claude for Designers?",
    a: "It's a visual interface for chatting and coding with Claude — Anthropic's AI. Built on the Claude Agent SDK, it lets you ask Claude to read, write, and edit code in your project folder, run commands, search the web, and more.",
  },
  {
    q: "What can I ask Claude to do?",
    a: "You can ask Claude to build features, fix bugs, refactor code, explain how something works, create new files, run terminal commands, and search your codebase. Just describe what you want in plain language.",
  },
  {
    q: "What are subagents?",
    a: "Claude can spawn subagents — independent AI workers that handle focused subtasks in parallel. For example, Claude might delegate a code review to one subagent and test analysis to another, then combine their results. You'll see live activity indicators when subagents are running. Type /agents to see all available subagents.",
  },
  {
    q: "Can I create custom subagents?",
    a: "Yes! Custom agents are defined per workspace via the API. Each agent has a name, description, system prompt, optional tool restrictions (e.g., read-only), and an optional model override. Claude will automatically delegate to them when appropriate, or you can request one by name: \"Use the code-reviewer agent to check this file.\"",
  },
  {
    q: "What are skills?",
    a: "Skills extend Claude with specialized knowledge and capabilities — like interacting with Slack, managing Linear issues, searching code across repositories, or working with Google Drive. They're loaded automatically from your Claude settings and can be invoked by typing /<skill-name> in the chat. Go to Settings → Skills to see what's installed, or type /skills in the chat.",
  },
  {
    q: "How do I install or remove skills?",
    a: "Open Settings → Skills to manage your skills. If the sq CLI is available, you can install skills by name directly from the panel (e.g., type \"slack\" and click Install). You can also install from the terminal with: sq agents skills add <name>. To remove a skill, click the X next to it in the Skills panel, or run: sq agents skills remove <name>.",
  },
  {
    q: "What file types can I attach?",
    a: "You can attach images (JPG, PNG, GIF, WEBP) using the paperclip icon. Claude can analyze screenshots, mockups, and design references to help implement what you show it.",
  },
  {
    q: "What does the star icon do?",
    a: "It favorites a conversation, pinning it to the top of your chat list so you can find it quickly.",
  },
  {
    q: "How do I switch projects?",
    a: "Click the folder path at the top of the chat area to open a folder picker. Each conversation remembers its own working directory.",
  },
  {
    q: "What are the keyboard shortcuts?",
    a: "⌘N — New chat\n⌘B — Toggle sidebar\n⌘K — Command palette\n⌘Enter — Send message",
  },
  {
    q: "How do I plan and build a feature from scratch?",
    a: "Type /plan followed by a description of what you want to build — for example, /plan Add dark mode with a settings toggle. Claude will walk you through a structured workflow: first asking clarifying questions, then proposing approaches, then writing a design spec to docs/plans/. When the spec is ready, type /execute and Claude will create an implementation plan and dispatch sub-agents to build each piece. A progress banner at the top tracks which phase you're in.",
  },
  {
    q: "What do the slash commands do?",
    a: "/agents — List available subagents for this workspace\n/clear — Clear conversation history\n/compact — Manually compress context (last resort — prefer starting fresh)\n/context — Show context window usage with a visual breakdown\n/cost — Show session cost and token summary\n/diff — Show uncommitted git changes in your workspace\n/execute — Execute the current implementation plan with sub-agents\n/export — Download conversation as markdown (or /export json)\n/plan — Start a structured development workflow (brainstorm → spec → build)\n/review — Ask Claude to review your uncommitted code changes\n/skills — List installed skills\n/status — Show model, workspace, and session info\n/usage — Show token usage and cost (supports /usage week, month, or a number of days)",
  },
  {
    q: "What does /review do?",
    a: "The /review command fetches your uncommitted git changes (the full diff) and sends them to Claude for an AI-powered code review. Claude will look for bugs, security issues, code quality concerns, and suggest improvements.",
  },
  {
    q: "How do I monitor my context usage?",
    a: "The status bar below the chat shows your context percentage. Type /context for a detailed breakdown with a progress bar. When usage gets high, Claude automatically shifts to delegating work to sub-agents that each run in a fresh context window. At ~75%, a banner will suggest starting a fresh session. The /compact command is available as a manual fallback if needed.",
  },
  {
    q: "Why doesn't Claude auto-compact?",
    a: "Compacting sounds helpful but it's actually the worst of both worlds: you lose the detailed context Claude was using, while the summary still carries stale assumptions from the bloated session. Instead, Claude for Designers uses sub-agents as the primary strategy for managing context. When the context window starts filling up, Claude delegates complex tasks to sub-agents that each work in their own fresh context window and report back concise results. This keeps the main session lean and coherent. If context gets very high, the app suggests starting a fresh session rather than compacting.",
  },
  {
    q: "Why is Claude taking a long time?",
    a: "Complex tasks like full codebase reviews require reading many files. You'll see activity text (e.g., \"Reading App.tsx\") below the response showing what Claude is doing. When subagents are running, you'll see their names and current activity. Try more targeted prompts for faster results.",
  },
  {
    q: "What models are available?",
    a: "You can switch between Claude Opus, Sonnet, and Haiku models using the model selector at the bottom of the chat input. Opus is the most capable; Haiku is the fastest.",
  },
  {
    q: "Can I export my conversations?",
    a: "Yes! Type /export to download as markdown, or /export json for the raw JSON. You can also use the command palette (⌘K) to export or share conversations.",
  },
];

interface FaqModalProps {
  open: boolean;
  onClose: () => void;
}

export function FaqModal({ open, onClose }: FaqModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="faq-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="faq-modal">
        <div className="faq-header">
          <h2>FAQ</h2>
          <button className="faq-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="faq-content">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="faq-item">
              <h3 className="faq-question">{item.q}</h3>
              <p className="faq-answer">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
