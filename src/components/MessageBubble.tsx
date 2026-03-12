import { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "../types";
import { formatTimestamp } from "../utils/time";
import { DiffSummary } from "./DiffSummary";

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button className={`copy-msg-btn ${className}`} onClick={handleCopy} title="Copy message">
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M11 5V3.5C11 2.67 10.33 2 9.5 2H3.5C2.67 2 2 2.67 2 3.5V9.5C2 10.33 2.67 11 3.5 11H5" stroke="currentColor" strokeWidth="1.3"/>
        </svg>
      )}
    </button>
  );
}

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

function fileNameFromPath(p: string): string {
  return p.split("/").pop() || p;
}

function CodeCard({
  language,
  code,
  title,
  fileName,
  onOpen,
}: {
  language: string;
  code: string;
  title?: string;
  fileName?: string;
  onOpen: () => void;
}) {
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const downloadName = fileName || (() => {
      const ext = language.toLowerCase() === "javascript" || language.toLowerCase() === "js" ? "js"
        : language.toLowerCase() === "typescript" || language.toLowerCase() === "ts" ? "ts"
        : language.toLowerCase() === "python" || language.toLowerCase() === "py" ? "py"
        : language.toLowerCase();
      return `code.${ext}`;
    })();
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
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
        <span className="code-card-title">{title || `${langTitle(language)} Code`}</span>
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

  const writtenFiles = useMemo(() => {
    if (message.role !== "assistant" || !message.toolCalls) return [];
    const byPath = new Map<string, { lang: string; code: string; path: string; name: string }>();
    for (const tc of message.toolCalls) {
      const tcName = tc.name.toLowerCase();
      if (tcName !== "write" && tcName !== "filewrite") continue;
      const inp = tc.input || {};
      if (!(inp.content || inp.contents) || !(inp.file_path || inp.path)) continue;
      const filePath = String(inp.file_path || inp.path);
      const code = String(inp.content || inp.contents);
      byPath.set(filePath, {
        lang: detectLangFromPath(filePath),
        code,
        path: filePath,
        name: fileNameFromPath(filePath),
      });
    }
    return Array.from(byPath.values());
  }, [message.role, message.toolCalls]);

  useEffect(() => {
    if (message.role !== "assistant" || !onOpenArtifact || autoOpened.current) return;

    if (message.toolCalls && message.toolCalls.length > 0) {
      const writes = message.toolCalls
        .filter((tc) => {
          const name = tc.name.toLowerCase();
          if (name !== "write" && name !== "filewrite") return false;
          const inp = tc.input || {};
          return (inp.content || inp.contents) && (inp.file_path || inp.path);
        })
        .map((tc) => {
          const inp = tc.input;
          const filePath = String(inp.file_path || inp.path);
          const code = String(inp.content || inp.contents);
          return { lang: detectLangFromPath(filePath), code, path: filePath };
        });

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
          <CopyButton text={message.content} className={message.role === "user" ? "copy-msg-btn-hover-only" : ""} />
        </div>
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
            <>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a({ href, children, ...props }) {
                    const safeHref = href && /^https?:\/\//i.test(href) ? href : href && !/^javascript:/i.test(href) ? href : undefined;
                    return <a href={safeHref} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
                  },
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
              {writtenFiles.length > 0 && onOpenArtifact && (
                <div className="written-files-cards">
                  {writtenFiles.map((f) => (
                    <CodeCard
                      key={f.path}
                      language={f.lang}
                      code={f.code}
                      title={f.name}
                      fileName={f.name}
                      onOpen={() => onOpenArtifact!(f.lang, f.code)}
                    />
                  ))}
                </div>
              )}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <DiffSummary toolCalls={message.toolCalls} onOpenArtifact={onOpenArtifact} />
              )}
            </>
          ) : (
            <p>{message.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}
