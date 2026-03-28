import { useEffect, useRef } from "react";

const STEPS = [
  {
    number: 1,
    title: "Get your API key",
    body: (
      <>
        <p>
          To use this app, you need an <strong>Anthropic API key</strong>. Think of it
          as a password that lets the app talk to Claude on your behalf. Everyone at
          the company has free credits, so there's no cost to you.
        </p>
        <ol>
          <li>
            Go to{" "}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>{" "}
            and sign in with your work account.
          </li>
          <li>Navigate to <strong>API Keys</strong> and click <strong>Create Key</strong>.</li>
          <li>Copy the key — it starts with <code>sk-ant-</code>.</li>
        </ol>
      </>
    ),
  },
  {
    number: 2,
    title: "Install and run the app",
    body: (
      <>
        <p>
          You need <strong>Node.js 18 or newer</strong> installed on your computer.
          If you don't have it, download it from{" "}
          <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">
            nodejs.org
          </a>
          .
        </p>
        <p>Then open <strong>Terminal</strong> and run these three commands:</p>
        <div className="gs-code-block">
          <code>git clone https://github.com/valranum/personal-claude-code-gui.git</code>
          <code>cd personal-claude-code-gui</code>
          <code>./setup.sh</code>
        </div>
        <p>
          The setup script installs everything and asks for your API key. Once it's
          done, start the app with:
        </p>
        <div className="gs-code-block">
          <code>npm run dev</code>
        </div>
        <p>
          Then open{" "}
          <a href="http://localhost:5173" target="_blank" rel="noopener noreferrer">
            localhost:5173
          </a>{" "}
          in your browser. That's it!
        </p>
      </>
    ),
  },
  {
    number: 3,
    title: "Pick a project",
    body: (
      <>
        <p>
          When you open the app, you'll see two options on the welcome screen:
        </p>
        <ul>
          <li>
            <strong>Open existing project</strong> — Point Claude at a folder on your
            computer. It can read and edit the files inside.
          </li>
          <li>
            <strong>Start a new project</strong> — Tell Claude what you want to build
            and it'll create the project from scratch.
          </li>
        </ul>
        <p>
          You can also click <strong>"just chat"</strong> if you want to ask Claude
          questions without connecting it to any files.
        </p>
      </>
    ),
  },
  {
    number: 4,
    title: "Talk to Claude",
    body: (
      <>
        <p>
          Just describe what you want in plain language. Claude can read your files,
          write code, run commands, and search the web. Some examples:
        </p>
        <div className="gs-examples">
          <span className="gs-example">"Build me a landing page with a hero section and contact form"</span>
          <span className="gs-example">"Make the header sticky and add a drop shadow"</span>
          <span className="gs-example">"Add a dark mode toggle to the settings page"</span>
          <span className="gs-example">"What does this component do?"</span>
          <span className="gs-example">"The login button isn't working — can you fix it?"</span>
        </div>
        <p>
          You can also <strong>attach images</strong> (screenshots, mockups, design
          references) using the paperclip icon. Claude will look at them and help
          implement what you show it.
        </p>
      </>
    ),
  },
  {
    number: 5,
    title: "Key features to know",
    body: (
      <>
        <ul>
          <li>
            <strong>Panels</strong> — The app has movable panels for your chat,
            files, and preview. Drag them around, dock them to edges, or pop them
            out into separate windows.
          </li>
          <li>
            <strong>Slash commands</strong> — Type <code>/</code> in the chat to see
            available commands. Try <code>/plan</code> to start a structured build
            workflow, or <code>/review</code> to get a code review.
          </li>
          <li>
            <strong>Model selector</strong> — Switch between Claude models at the
            bottom of the chat input. Opus is the most capable, Haiku is the fastest.
          </li>
          <li>
            <strong>Command palette</strong> — Press <code>⌘K</code> for quick
            access to actions like new chat, export, and theme switching.
          </li>
          <li>
            <strong>FAQ</strong> — Check Settings → FAQ for answers to common
            questions about subagents, skills, MCP servers, and more.
          </li>
        </ul>
      </>
    ),
  },
];

interface GettingStartedModalProps {
  open: boolean;
  onClose: () => void;
}

export function GettingStartedModal({ open, onClose }: GettingStartedModalProps) {
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
      <div className="faq-modal gs-modal">
        <div className="faq-header">
          <h2>Getting Started</h2>
          <button className="faq-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="faq-content">
          {STEPS.map((step) => (
            <div key={step.number} className="gs-step">
              <div className="gs-step-header">
                <span className="gs-step-number">{step.number}</span>
                <h3 className="gs-step-title">{step.title}</h3>
              </div>
              <div className="gs-step-body">{step.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
