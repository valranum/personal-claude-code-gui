import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  children: React.ReactElement;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((e: React.MouseEvent) => {
    clearTimeout(timeoutRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const hide = useCallback(() => {
    timeoutRef.current = setTimeout(() => setPos(null), 50);
  }, []);

  return (
    <>
      <span onMouseEnter={show} onMouseLeave={hide} style={{ display: "inline-flex" }}>
        {children}
      </span>
      {pos &&
        createPortal(
          <div
            className="custom-tooltip"
            style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
