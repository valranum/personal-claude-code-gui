import { useCallback, ReactNode } from "react";
import { Tooltip } from "./Tooltip";

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_WIDTH = 160;
const MIN_HEIGHT = 120;

const PANEL_ICONS: Record<string, ReactNode> = {
  chats: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 3.5C2 2.67 2.67 2 3.5 2H12.5C13.33 2 14 2.67 14 3.5V10.5C14 11.33 13.33 12 12.5 12H5L2 15V3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  files: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  main: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5Z" fill="currentColor"/>
    </svg>
  ),
};

export function getPanelIcon(id: string): ReactNode {
  return PANEL_ICONS[id] ?? null;
}

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloatingPanelProps {
  id: string;
  title: string;
  rect: PanelRect;
  visible: boolean;
  zIndex: number;
  containerBounds: { width: number; height: number };
  onUpdate: (id: string, rect: PanelRect) => void;
  onBringToFront: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onPin: (id: string) => void;
  onPopOut?: (id: string) => void;
  children: React.ReactNode;
}

export function FloatingPanel({
  id,
  title,
  rect,
  visible,
  zIndex,
  containerBounds,
  onUpdate,
  onBringToFront,
  onToggleVisible,
  onDragStart,
  onPin,
  onPopOut,
  children,
}: FloatingPanelProps) {
  const { x, y, width, height } = rect;

  const handleResizeStart = useCallback(
    (edge: ResizeEdge, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startRect = { x, y, width, height };

      const cursorMap: Record<ResizeEdge, string> = {
        n: "ns-resize", s: "ns-resize",
        e: "ew-resize", w: "ew-resize",
        ne: "nesw-resize", sw: "nesw-resize",
        nw: "nwse-resize", se: "nwse-resize",
      };

      const handleMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let nx = startRect.x;
        let ny = startRect.y;
        let nw = startRect.width;
        let nh = startRect.height;

        if (edge.includes("e")) nw = Math.max(MIN_WIDTH, startRect.width + dx);
        if (edge.includes("w")) {
          nw = Math.max(MIN_WIDTH, startRect.width - dx);
          nx = startRect.x + startRect.width - nw;
        }
        if (edge.includes("s")) nh = Math.max(MIN_HEIGHT, startRect.height + dy);
        if (edge.includes("n")) {
          nh = Math.max(MIN_HEIGHT, startRect.height - dy);
          ny = startRect.y + startRect.height - nh;
        }

        nx = Math.max(0, nx);
        ny = Math.max(0, ny);
        if (nx + nw > containerBounds.width) nw = containerBounds.width - nx;
        if (ny + nh > containerBounds.height) nh = containerBounds.height - ny;

        onUpdate(id, { x: nx, y: ny, width: nw, height: nh });
      };

      const handleUp = () => {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = cursorMap[edge];
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
      onBringToFront(id);
    },
    [id, x, y, width, height, containerBounds, onUpdate, onBringToFront],
  );

  if (!visible) return null;

  return (
    <div
      className="fp"
      style={{ left: x, top: y, width, height, zIndex }}
      onPointerDown={() => onBringToFront(id)}
    >
      <div className="fp-edge fp-edge-n" onPointerDown={(e) => handleResizeStart("n", e)} />
      <div className="fp-edge fp-edge-s" onPointerDown={(e) => handleResizeStart("s", e)} />
      <div className="fp-edge fp-edge-e" onPointerDown={(e) => handleResizeStart("e", e)} />
      <div className="fp-edge fp-edge-w" onPointerDown={(e) => handleResizeStart("w", e)} />
      <div className="fp-corner fp-corner-nw" onPointerDown={(e) => handleResizeStart("nw", e)} />
      <div className="fp-corner fp-corner-ne" onPointerDown={(e) => handleResizeStart("ne", e)} />
      <div className="fp-corner fp-corner-sw" onPointerDown={(e) => handleResizeStart("sw", e)} />
      <div className="fp-corner fp-corner-se" onPointerDown={(e) => handleResizeStart("se", e)} />

      <div
        className="fp-header"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          onDragStart(id, e);
        }}
      >
        <span className="fp-icon">{PANEL_ICONS[id]}</span>
        <span className="fp-title">{title}</span>
        {onPopOut && (
          <Tooltip text="Pop out to window">
            <button
              className="fp-popout-btn"
              onClick={(e) => { e.stopPropagation(); onPopOut(id); }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M9 2H14V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M12 9V13H3V4H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </Tooltip>
        )}
        <Tooltip text={`Hide ${title}`}>
          <button
            className="fp-close"
            onClick={(e) => { e.stopPropagation(); onToggleVisible(id); }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </Tooltip>
      </div>
      <div className="fp-body">{children}</div>
    </div>
  );
}
