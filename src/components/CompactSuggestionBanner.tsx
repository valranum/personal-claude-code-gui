interface CompactSuggestionBannerProps {
  onCompact: () => void;
  onDismiss: () => void;
}

export function CompactSuggestionBanner({ onCompact, onDismiss }: CompactSuggestionBannerProps) {
  return (
    <div className="compact-suggestion-banner">
      <span className="compact-suggestion-text">
        This conversation is getting long. Consider compacting to free up context.
      </span>
      <button className="compact-suggestion-btn" onClick={onCompact}>
        Compact now
      </button>
      <button className="compact-suggestion-dismiss" onClick={onDismiss} title="Dismiss">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}
