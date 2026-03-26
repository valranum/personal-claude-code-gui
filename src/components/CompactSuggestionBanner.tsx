interface CompactSuggestionBannerProps {
  onCompact: () => void;
  onDismiss: () => void;
  onForkWithSummary?: () => void;
  contextPercent: number;
}

export function CompactSuggestionBanner({
  onCompact,
  onDismiss,
  onForkWithSummary,
  contextPercent,
}: CompactSuggestionBannerProps) {
  const isCritical = contextPercent > 75;

  return (
    <div
      className={`context-banner compact-suggestion-banner ${isCritical ? "context-banner--critical" : "context-banner--warning"}`}
    >
      <div className="context-banner-icon">
        {isCritical ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11" r="0.75" fill="currentColor" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1.5L14.5 13.5H1.5L8 1.5Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path d="M8 6V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="8" cy="11" r="0.65" fill="currentColor" />
          </svg>
        )}
      </div>
      <span className="context-banner-text">
        {isCritical
          ? "Context is almost full. Start a fresh session to avoid degradation."
          : "Context is getting full — Claude will prefer sub-agents to keep responses sharp."}
      </span>
      <div className="context-banner-actions">
        {isCritical && onForkWithSummary && (
          <button
            className="context-banner-btn context-banner-btn--primary"
            onClick={onForkWithSummary}
          >
            Start fresh
          </button>
        )}
        {isCritical && (
          <button className="context-banner-btn context-banner-btn--secondary" onClick={onCompact}>
            Compact
          </button>
        )}
        <button className="context-banner-dismiss" onClick={onDismiss} title="Dismiss">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
