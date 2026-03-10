import { useEffect, useRef } from "react";

const FAQ_ITEMS = [
  {
    q: "What is Claude Code for Designers?",
    a: "It's a visual interface for Claude Code — Anthropic's AI coding agent. You can ask Claude to read, write, and edit code in your project folder, run commands, search the web, and more.",
  },
  {
    q: "What can I ask Claude to do?",
    a: "You can ask Claude to build features, fix bugs, refactor code, explain how something works, create new files, run terminal commands, and search your codebase. Just describe what you want in plain language.",
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
    q: "What do the slash commands do?",
    a: "/clear — Clear conversation history\n/compact — Compress context to free up token space\n/usage — Show token usage and cost for this conversation\n/usage week — Show usage for the past 7 days",
  },
  {
    q: "Why is Claude taking a long time?",
    a: "Complex tasks like full codebase reviews require reading many files. You'll see activity text (e.g., \"Reading App.tsx\") below the response showing what Claude is doing. Try more targeted prompts for faster results.",
  },
  {
    q: "What models are available?",
    a: "You can switch between Claude Opus, Sonnet, and Haiku models using the model selector at the bottom of the chat input. Opus is the most capable; Haiku is the fastest.",
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
