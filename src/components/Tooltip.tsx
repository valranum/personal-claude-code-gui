import { useState, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  children: React.ReactElement;
  side?: "bottom" | "right" | "top";
}

export function Tooltip({ text, children, side = "bottom" }: TooltipProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sideRef = useRef<"bottom" | "right" | "top">(side);
  const tooltipRef = useRef<HTMLDivElement>(null);

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
    } else if (side === "top") {
      setPos({
        top: rect.top - 6,
        left: rect.left + rect.width / 2,
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

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el || !pos) return;

    const rect = el.getBoundingClientRect();
    const pad = 8;

    if (rect.right > window.innerWidth - pad) {
      el.style.left = `${window.innerWidth - rect.width - pad}px`;
      el.style.transform = sideRef.current === "top" ? "translateY(-100%)" : "none";
    }
    if (rect.left < pad) {
      el.style.left = `${pad}px`;
      el.style.transform = sideRef.current === "top" ? "translateY(-100%)" : "none";
    }
    if (rect.bottom > window.innerHeight - pad) {
      el.style.top = `${window.innerHeight - rect.height - pad}px`;
    }
    if (rect.top < pad) {
      el.style.top = `${pad}px`;
    }
  }, [pos]);

  const transform = sideRef.current === "right"
    ? "translateY(-50%)"
    : sideRef.current === "top"
      ? "translateX(-50%) translateY(-100%)"
      : "translateX(-50%)";

  return (
    <>
      <span onMouseEnter={show} onMouseLeave={hide} style={{ display: "inline-flex" }}>
        {children}
      </span>
      {pos &&
        createPortal(
          <div
            ref={tooltipRef}
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
