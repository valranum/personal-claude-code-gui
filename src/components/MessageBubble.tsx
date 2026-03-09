import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "../types";
import { ToolCallBlock } from "./ToolCallBlock";
import { formatTimestamp } from "../utils/time";

interface MessageBubbleProps {
  message: ChatMessage;
  onOpenArtifact?: (language: string, code: string) => void;
}

const LANG_LABELS: Record<string, string> = {
  python: "PY", py: "PY", javascript: "JS", js: "JS", typescript: "TS", ts: "TS",
  java: "JAVA", cpp: "C++", c: "C", csharp: "C#", cs: "C#", go: "GO", rust: "RS",
  ruby: "RB", php: "PHP", swift: "SWIFT", kotlin: "KT", html: "HTML", css: "CSS",
  sql: "SQL", bash: "SH", sh: "SH", shell: "SH", json: "JSON", yaml: "YAML",
  yml: "YAML", xml: "XML", markdown: "MD", md: "MD", text: "TXT", r: "R",
};

function langLabel(lang: string): string {
  return LANG_LABELS[lang.toLowerCase()] || lang.toUpperCase();
}

function langTitle(lang: string): string {
  const titles: Record<string, string> = {
    python: "Python", py: "Python", javascript: "JavaScript", js: "JavaScript",
    typescript: "TypeScript", ts: "TypeScript", java: "Java", cpp: "C++", c: "C",
    csharp: "C#", cs: "C#", go: "Go", rust: "Rust", ruby: "Ruby", php: "PHP",
    swift: "Swift", kotlin: "Kotlin", html: "HTML", css: "CSS", sql: "SQL",
    bash: "Shell", sh: "Shell", shell: "Shell", json: "JSON", yaml: "YAML",
    yml: "YAML", xml: "XML", r: "R",
  };
  return titles[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1);
}

function CodeCard({
  language,
  code,
  onOpen,
}: {
  language: string;
  code: string;
  onOpen: () => void;
}) {
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const ext = language.toLowerCase() === "javascript" || language.toLowerCase() === "js" ? "js"
      : language.toLowerCase() === "typescript" || language.toLowerCase() === "ts" ? "ts"
      : language.toLowerCase() === "python" || language.toLowerCase() === "py" ? "py"
      : language.toLowerCase();
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `code.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="code-card" onClick={onOpen} role="button" tabIndex={0}>
      <div className="code-card-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M14 2V8H20" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="code-card-info">
        <span className="code-card-title">{langTitle(language)} Code</span>
        <span className="code-card-meta">{langLabel(language)}</span>
      </div>
      <button className="code-card-download" onClick={handleDownload} type="button">
        Download
      </button>
    </div>
  );
}

const CODE_BLOCK_RE = /```(\w+)\n([\s\S]*?)```/g;

const EXT_TO_LANG: Record<string, string> = {
  py: "python", js: "javascript", ts: "typescript", jsx: "javascript",
  tsx: "typescript", rb: "ruby", go: "go", rs: "rust", java: "java",
  cpp: "cpp", c: "c", cs: "csharp", php: "php", swift: "swift",
  kt: "kotlin", html: "html", css: "css", sql: "sql", sh: "bash",
  bash: "bash", json: "json", yaml: "yaml", yml: "yaml", xml: "xml",
  md: "markdown", r: "r", toml: "toml",
};

function detectLangFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_LANG[ext] || ext || "text";
}

export function MessageBubble({ message, onOpenArtifact }: MessageBubbleProps) {
  const autoOpened = useRef(false);

  useEffect(() => {
    if (message.role !== "assistant" || !onOpenArtifact || autoOpened.current) return;

    // Check for file writes in tool calls first (highest priority)
    if (message.toolCalls && message.toolCalls.length > 0) {
      const writes = message.toolCalls
        .filter((tc) => tc.name.toLowerCase() === "write" && tc.input?.contents && tc.input?.path)
        .map((tc) => ({
          lang: detectLangFromPath(String(tc.input.path)),
          code: String(tc.input.contents),
          path: String(tc.input.path),
        }));

      if (writes.length > 0) {
        const largest = writes.reduce((a, b) => (b.code.length > a.code.length ? b : a));
        autoOpened.current = true;
        onOpenArtifact(largest.lang, largest.code);
        return;
      }
    }

    // Fall back to code blocks in the message text
    const blocks: { lang: string; code: string }[] = [];
    let m;
    while ((m = CODE_BLOCK_RE.exec(message.content)) !== null) {
      blocks.push({ lang: m[1], code: m[2].replace(/\n$/, "") });
    }
    CODE_BLOCK_RE.lastIndex = 0;

    if (blocks.length === 0) return;

    const largest = blocks.reduce((a, b) => (b.code.length > a.code.length ? b : a));
    autoOpened.current = true;
    onOpenArtifact(largest.lang, largest.code);
  }, [message.content, message.role, message.toolCalls, onOpenArtifact]);

  if (message.role === "system") {
    return (
      <div className="message-bubble system msg-enter">
        <div className="system-message-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className={`message-bubble ${message.role} msg-enter`}>
      {message.role === "user" && (
        <div className="message-avatar user-avatar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M2.5 14C2.5 11.24 4.96 9 8 9C11.04 9 13.5 11.24 13.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      )}
      <div className="message-body">
        <div className="message-header">
          <span className="message-role">
            {message.role === "user" ? "You" : "Claude"}
          </span>
          <span className="message-time">{formatTimestamp(message.timestamp)}</span>
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="message-tools">
            {message.toolCalls.map((tc) => (
              <ToolCallBlock key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        <div className="message-content">
          {message.role === "user" && message.images && message.images.length > 0 && (
            <div className="message-images">
              {message.images.map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name}
                  className="message-image"
                />
              ))}
            </div>
          )}
          {message.role === "assistant" ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match;
                  if (isInline) {
                    return (
                      <code className="inline-code" {...props}>
                        {children}
                      </code>
                    );
                  }
                  const codeStr = String(children).replace(/\n$/, "");
                  const lang = match[1];
                  if (onOpenArtifact) {
                    return (
                      <CodeCard
                        language={lang}
                        code={codeStr}
                        onOpen={() => onOpenArtifact(lang, codeStr)}
                      />
                    );
                  }
                  return <pre><code className={className} {...props}>{children}</code></pre>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <p>{message.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}
