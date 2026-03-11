import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ArtifactPanelProps {
  language: string;
  code: string;
  onClose: () => void;
  widthPercent?: number;
}

export function ArtifactPanel({ language, code, onClose, widthPercent = 45 }: ArtifactPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="artifact-panel" style={{ flex: `0 0 ${widthPercent}%`, maxWidth: `${widthPercent}%` }}>
      <div className="artifact-header">
        <div className="artifact-title">
          <span className="artifact-lang">{language.charAt(0).toUpperCase() + language.slice(1)} Code</span>
          <span className="artifact-lines">{language.toUpperCase()}</span>
        </div>
        <div className="artifact-actions">
          <button
            className={`artifact-copy-btn ${copied ? "copied" : ""}`}
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M11 5V3.5C11 2.67 10.33 2 9.5 2H3.5C2.67 2 2 2.67 2 3.5V9.5C2 10.33 2.67 11 3.5 11H5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                Copy
              </>
            )}
          </button>
          <button className="artifact-close-btn" onClick={onClose} title="Close panel">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="artifact-body">
        <SyntaxHighlighter
          language={language || "text"}
          style={oneDark}
          showLineNumbers
          wrapLongLines
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "13px",
            background: "transparent",
            minHeight: "100%",
          }}
          lineNumberStyle={{
            minWidth: "3em",
            paddingRight: "1em",
            color: "rgba(139, 148, 158, 0.4)",
            userSelect: "none",
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
