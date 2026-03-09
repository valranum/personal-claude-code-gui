import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  children: React.ReactElement;
  side?: "bottom" | "right";
}

export function Tooltip({ text, children, side = "bottom" }: TooltipProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sideRef = useRef<"bottom" | "right">(side);

  const show = useCallback((e: React.MouseEvent) => {
    clearTimeout(timeoutRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    sideRef.current = side;

    if (side === "right" || rect.left < 80) {
      sideRef.current = "right";
      setPos({
        top: rect.top + rect.height / 2,
        left: rect.right + 8,
      });
    } else {
      setPos({
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
      });
    }
  }, [side]);

  const hide = useCallback(() => {
    timeoutRef.current = setTimeout(() => setPos(null), 50);
  }, []);

  const transform = sideRef.current === "right" ? "translateY(-50%)" : "translateX(-50%)";

  return (
    <>
      <span onMouseEnter={show} onMouseLeave={hide} style={{ display: "inline-flex" }}>
        {children}
      </span>
      {pos &&
        createPortal(
          <div
            className="custom-tooltip"
            style={{ top: pos.top, left: pos.left, transform }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
