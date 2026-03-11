import { useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { FloatingPanel, PanelRect, getPanelIcon } from "./DockPanel";
import { PopoutWindow } from "./PopoutWindow";
import { Tooltip } from "./Tooltip";

type DockPosition = "left" | "right" | "top" | "bottom";
type DropZone = DockPosition | "center";
type PanelId = "chats" | "files" | "main";

const ALL_PANEL_IDS: PanelId[] = ["chats", "files", "main"];

interface PanelConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  pinned: boolean;
  pinnedPosition: DockPosition;
  pinnedSize: number;
  isCenter: boolean;
}

export interface LayoutState {
  chats: PanelConfig;
  files: PanelConfig;
  main: PanelConfig;
  zOrder: PanelId[];
}

const STORAGE_KEY = "dock-layout";

function getDefaults(): LayoutState {
  const h = window.innerHeight;
  return {
    chats: {
      x: 16, y: 16, width: 280, height: Math.max(300, h - 80),
      visible: true, pinned: true, pinnedPosition: "left", pinnedSize: 280,
      isCenter: false,
    },
    files: {
      x: 16, y: 16, width: 280, height: Math.max(300, h - 80),
      visible: true, pinned: true, pinnedPosition: "right", pinnedSize: 280,
      isCenter: false,
    },
    main: {
      x: 0, y: 0, width: 600, height: Math.max(300, h - 80),
      visible: true, pinned: false, pinnedPosition: "left", pinnedSize: 400,
      isCenter: true,
    },
    zOrder: ["chats", "files", "main"],
  };
}

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.main && parsed.chats && parsed.files && parsed.zOrder) {
        return parsed;
      }
    }
  } catch {}
  return getDefaults();
}

function saveLayout(state: LayoutState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

interface PanelDef {
  id: PanelId;
  title: string;
  content: ReactNode;
}

interface DockableLayoutProps {
  chatsContent: ReactNode;
  filesContent: ReactNode;
  mainContent: ReactNode;
}

export function DockableLayout({
  chatsContent,
  filesContent,
  mainContent,
}: DockableLayoutProps) {
  const [layout, setLayout] = useState<LayoutState>(loadLayout);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const [activeZone, setActiveZone] = useState<DropZone | null>(null);
  const [resizingEdge, setResizingEdge] = useState<DockPosition | null>(null);
  const [poppedOut, setPoppedOut] = useState<Set<PanelId>>(new Set());

  const layoutRef = useRef<HTMLDivElement>(null);
  const layoutStateRef = useRef(layout);
  const activeZoneRef = useRef(activeZone);
  const containerSizeRef = useRef(containerSize);

  useEffect(() => { layoutStateRef.current = layout; }, [layout]);
  useEffect(() => { activeZoneRef.current = activeZone; }, [activeZone]);
  useEffect(() => { containerSizeRef.current = containerSize; }, [containerSize]);
  useEffect(() => { saveLayout(layout); }, [layout]);

  useEffect(() => {
    if (!layoutRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(layoutRef.current);
    return () => observer.disconnect();
  }, []);

  const panelDefs: PanelDef[] = [
    { id: "chats", title: "Convos", content: chatsContent },
    { id: "files", title: "Files", content: filesContent },
    { id: "main", title: "Chat", content: mainContent },
  ];

  /* ── Unified drag handler ── */
  const handleDragStart = useCallback((panelId: string, e: React.PointerEvent) => {
    const pid = panelId as PanelId;
    const panel = layoutStateRef.current[pid];
    const wasPinned = panel.pinned;
    const wasCenter = panel.isCenter;

    const startPos = { x: e.clientX, y: e.clientY };
    let active = false;
    let dragOffset: { x: number; y: number } | null = null;
    const detachedWidth = wasPinned ? (panel.pinnedSize || 280) : (wasCenter ? 400 : panel.width);
    const detachedHeight = wasCenter ? 350 : panel.height;

    setLayout((prev) => {
      const zOrder = prev.zOrder.filter((p) => p !== pid);
      zOrder.push(pid);
      return { ...prev, zOrder };
    });

    const handleMove = (ev: PointerEvent) => {
      const dx = Math.abs(ev.clientX - startPos.x);
      const dy = Math.abs(ev.clientY - startPos.y);

      if (!active && (dx > 5 || dy > 5)) {
        active = true;
        setDragging(pid);

        const containerRect = layoutRef.current?.getBoundingClientRect();
        if (!containerRect) return;

        if (wasPinned || wasCenter) {
          dragOffset = { x: Math.min(detachedWidth / 2, 140), y: 16 };
          const newX = Math.max(0, ev.clientX - containerRect.left - dragOffset.x);
          const newY = Math.max(0, ev.clientY - containerRect.top - dragOffset.y);
          setLayout((prev) => ({
            ...prev,
            [pid]: {
              ...prev[pid],
              pinned: false,
              isCenter: false,
              x: newX,
              y: newY,
              width: detachedWidth,
              height: detachedHeight,
            },
          }));
        } else {
          dragOffset = {
            x: ev.clientX - containerRect.left - panel.x,
            y: ev.clientY - containerRect.top - panel.y,
          };
        }
      }

      if (active && dragOffset) {
        const containerRect = layoutRef.current?.getBoundingClientRect();
        if (!containerRect) return;

        const cBounds = containerSizeRef.current;
        let newX = ev.clientX - containerRect.left - dragOffset.x;
        let newY = ev.clientY - containerRect.top - dragOffset.y;
        newX = Math.max(0, Math.min(newX, cBounds.width - 100));
        newY = Math.max(0, Math.min(newY, cBounds.height - 32));

        setLayout((prev) => ({
          ...prev,
          [pid]: { ...prev[pid], x: newX, y: newY },
        }));

        const x = ev.clientX - containerRect.left;
        const y = ev.clientY - containerRect.top;
        const edgePx = 60;

        if (x < edgePx) setActiveZone("left");
        else if (x > containerRect.width - edgePx) setActiveZone("right");
        else if (y < edgePx) setActiveZone("top");
        else if (y > containerRect.height - edgePx) setActiveZone("bottom");
        else {
          const cx = containerRect.width / 2;
          const cy = containerRect.height / 2;
          if (Math.abs(x - cx) < 100 && Math.abs(y - cy) < 80) {
            setActiveZone("center");
          } else {
            setActiveZone(null);
          }
        }
      }
    };

    const handleUp = () => {
      if (active) {
        const zone = activeZoneRef.current;
        if (zone === "center") {
          setLayout((prev) => {
            const next = { ...prev };
            for (const id of ALL_PANEL_IDS) {
              if (id === pid) {
                next[id] = { ...prev[id], pinned: false, isCenter: true };
              } else if (prev[id].isCenter) {
                next[id] = { ...prev[id], isCenter: false };
              }
            }
            return next;
          });
        } else if (zone) {
          const isHoriz = zone === "left" || zone === "right";
          setLayout((prev) => ({
            ...prev,
            [pid]: {
              ...prev[pid],
              pinned: true,
              isCenter: false,
              pinnedPosition: zone,
              pinnedSize: isHoriz ? prev[pid].width : Math.min(prev[pid].height, 350),
            },
          }));
        }
      }

      setDragging(null);
      setActiveZone(null);
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  }, []);

  /* ── Visibility ── */
  const handleToggleVisible = useCallback((panelId: string) => {
    setLayout((prev) => ({
      ...prev,
      [panelId]: { ...prev[panelId as PanelId], visible: !prev[panelId as PanelId].visible },
    }));
  }, []);

  /* ── Bring to front (for floating click) ── */
  const handleBringToFront = useCallback((id: string) => {
    setLayout((prev) => {
      const zOrder = prev.zOrder.filter((p) => p !== id);
      zOrder.push(id as PanelId);
      return { ...prev, zOrder };
    });
  }, []);

  /* ── Floating panel resize ── */
  const handlePanelUpdate = useCallback((id: string, rect: PanelRect) => {
    setLayout((prev) => ({
      ...prev,
      [id]: { ...prev[id as PanelId], ...rect },
    }));
  }, []);

  /* ── Pin (floating → nearest edge) ── */
  const handlePin = useCallback((panelId: string) => {
    const pid = panelId as PanelId;
    setLayout((prev) => {
      const p = prev[pid];
      const cs = containerSizeRef.current;
      const dists: [DockPosition, number][] = [
        ["left", p.x],
        ["right", cs.width - (p.x + p.width)],
        ["top", p.y],
        ["bottom", cs.height - (p.y + p.height)],
      ];
      dists.sort((a, b) => a[1] - b[1]);
      const nearest = dists[0][0];
      const isHoriz = nearest === "left" || nearest === "right";
      return {
        ...prev,
        [pid]: {
          ...p,
          pinned: true,
          isCenter: false,
          pinnedPosition: nearest,
          pinnedSize: isHoriz ? p.width : p.height,
        },
      };
    });
  }, []);

  /* ── Pop out to external window ── */
  const handlePopOut = useCallback((panelId: string) => {
    setPoppedOut((prev) => {
      const next = new Set(prev);
      next.add(panelId as PanelId);
      return next;
    });
  }, []);

  const handlePopIn = useCallback((panelId: string) => {
    setPoppedOut((prev) => {
      const next = new Set(prev);
      next.delete(panelId as PanelId);
      return next;
    });
  }, []);

  /* ── Unpin (pinned → floating) ── */
  const handleUnpin = useCallback((panelId: string) => {
    const pid = panelId as PanelId;
    setLayout((prev) => {
      const p = prev[pid];
      const cs = containerSizeRef.current;
      const isHoriz = p.pinnedPosition === "left" || p.pinnedPosition === "right";
      const w = isHoriz ? p.pinnedSize : p.width || 280;
      const h = isHoriz ? p.height || Math.max(300, cs.height - 80) : p.pinnedSize;
      return {
        ...prev,
        [pid]: {
          ...p,
          pinned: false,
          isCenter: false,
          width: w,
          height: Math.min(h, cs.height - 32),
          x: Math.max(16, Math.min(p.x, cs.width - w - 16)),
          y: Math.max(16, Math.min(p.y, cs.height - h - 16)),
        },
      };
    });
  }, []);

  /* ── Pinned resize ── */
  const MIN_PINNED = 120;
  const MIN_CENTER = 200;

  useEffect(() => {
    if (!resizingEdge) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const isHoriz = resizingEdge === "left" || resizingEdge === "right";

      let newSize: number;
      switch (resizingEdge) {
        case "left": newSize = e.clientX - rect.left; break;
        case "right": newSize = rect.right - e.clientX; break;
        case "top": newSize = e.clientY - rect.top; break;
        case "bottom": newSize = rect.bottom - e.clientY; break;
      }

      const totalDim = isHoriz ? rect.width : rect.height;
      const cur = layoutStateRef.current;
      let oppositeUsed = 0;
      for (const pid of ALL_PANEL_IDS) {
        const p = cur[pid];
        if (p.pinned && p.visible && p.pinnedPosition !== resizingEdge) {
          const pIsHoriz = p.pinnedPosition === "left" || p.pinnedPosition === "right";
          if (pIsHoriz === isHoriz) oppositeUsed += p.pinnedSize;
        }
      }
      const maxSize = totalDim - oppositeUsed - MIN_CENTER;
      newSize = Math.min(Math.max(newSize, MIN_PINNED), Math.max(MIN_PINNED, maxSize));

      setLayout((prev) => {
        const next = { ...prev };
        for (const pid of ALL_PANEL_IDS) {
          if (prev[pid].pinned && prev[pid].pinnedPosition === resizingEdge && prev[pid].visible) {
            next[pid] = { ...prev[pid], pinnedSize: newSize };
          }
        }
        return next;
      });
    };

    const handleMouseUp = () => {
      setResizingEdge(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor =
      resizingEdge === "left" || resizingEdge === "right" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingEdge]);

  /* ── Render helpers ── */

  const pinnedAt = (pos: DockPosition) =>
    panelDefs.filter((p) => layout[p.id].pinned && layout[p.id].pinnedPosition === pos && layout[p.id].visible && !poppedOut.has(p.id));

  const renderPinnedSlot = (pos: DockPosition) => {
    const panels = pinnedAt(pos);
    if (panels.length === 0) return null;

    const isHoriz = pos === "left" || pos === "right";
    const totalSize = panels.reduce((sum, p) => Math.max(sum, layout[p.id].pinnedSize), 0);
    const sizeStyle = isHoriz ? { width: totalSize } : { height: totalSize };

    return (
      <div className={`fp-pinned-slot fp-pinned-${pos}`} style={sizeStyle}>
        {panels.map((p, i) => (
          <div key={p.id} className="fp-pinned-panel">
            <div
              className="fp-header"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                handleDragStart(p.id, e);
              }}
            >
              <span className="fp-icon">{getPanelIcon(p.id)}</span>
              <span className="fp-title">{p.title}</span>
              <Tooltip text="Pop out to window">
                <button
                  className="fp-popout-btn"
                  onClick={(e) => { e.stopPropagation(); handlePopOut(p.id); }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M9 2H14V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M12 9V13H3V4H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </Tooltip>
              <Tooltip text={`Hide ${p.title}`}>
                <button
                  className="fp-close"
                  onClick={(e) => { e.stopPropagation(); handleToggleVisible(p.id); }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </Tooltip>
            </div>
            <div className="fp-body">{p.content}</div>
            {i < panels.length - 1 && (
              <div className="fp-pinned-split-handle" />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderResizeHandle = (pos: DockPosition) => {
    if (pinnedAt(pos).length === 0) return null;
    return (
      <div
        className={`fp-resize-handle fp-rh-${pos}`}
        onMouseDown={() => setResizingEdge(pos)}
      />
    );
  };

  const centerPanels = panelDefs.filter((p) => layout[p.id].isCenter && layout[p.id].visible && !poppedOut.has(p.id));
  const floatingPanels = panelDefs.filter((p) => !layout[p.id].pinned && !layout[p.id].isCenter && layout[p.id].visible && !poppedOut.has(p.id));
  const hiddenPanels = panelDefs.filter((p) => !layout[p.id].visible);
  const poppedOutPanels = panelDefs.filter((p) => poppedOut.has(p.id) && layout[p.id].visible);

  return (
    <div className={`fp-layout${resizingEdge ? " is-resizing" : ""}`} ref={layoutRef}>
      {renderPinnedSlot("left")}
      {renderResizeHandle("left")}

      <div className="fp-center-column">
        {renderPinnedSlot("top")}
        {renderResizeHandle("top")}

        <div className="fp-center">
          {centerPanels.length > 0 ? (
            centerPanels.map((p) => (
              <div key={p.id} className="fp-center-panel">
                <div
                  className="fp-header fp-center-header"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    handleDragStart(p.id, e);
                  }}
                >
                  <span className="fp-icon">{getPanelIcon(p.id)}</span>
                  <span className="fp-title">{p.title}</span>
                  <Tooltip text="Pop out to window">
                    <button
                      className="fp-popout-btn"
                      onClick={(e) => { e.stopPropagation(); handlePopOut(p.id); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M9 2H14V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M14 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        <path d="M12 9V13H3V4H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </Tooltip>
                  <Tooltip text={`Hide ${p.title}`}>
                    <button
                      className="fp-close"
                      onClick={(e) => { e.stopPropagation(); handleToggleVisible(p.id); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </Tooltip>
                </div>
                <div className="fp-body fp-center-body">{p.content}</div>
              </div>
            ))
          ) : (
            <div className="fp-center-empty">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none" opacity="0.3">
                <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2"/>
                <path d="M6 8H10M8 6V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span>Drag a panel here</span>
            </div>
          )}
        </div>

        {renderResizeHandle("bottom")}
        {renderPinnedSlot("bottom")}
      </div>

      {renderResizeHandle("right")}
      {renderPinnedSlot("right")}

      {floatingPanels.map((p) => (
        <FloatingPanel
          key={p.id}
          id={p.id}
          title={p.title}
          rect={layout[p.id]}
          visible={true}
          zIndex={10 + layout.zOrder.indexOf(p.id)}
          containerBounds={containerSize}
          onUpdate={handlePanelUpdate}
          onBringToFront={handleBringToFront}
          onToggleVisible={handleToggleVisible}
          onDragStart={handleDragStart}
          onPin={handlePin}
          onPopOut={handlePopOut}
        >
          {p.content}
        </FloatingPanel>
      ))}

      {poppedOutPanels.map((p) => {
        const cfg = layout[p.id];
        const isHoriz = cfg.pinnedPosition === "left" || cfg.pinnedPosition === "right";
        const w = cfg.pinned ? (isHoriz ? cfg.pinnedSize : 600) : cfg.isCenter ? 800 : cfg.width || 600;
        const h = cfg.pinned ? (isHoriz ? 500 : cfg.pinnedSize) : cfg.isCenter ? 600 : cfg.height || 500;
        return (
          <PopoutWindow
            key={p.id}
            title={`${p.title} — Claude Code`}
            width={Math.max(w, 400)}
            height={Math.max(h, 300)}
            onClose={() => handlePopIn(p.id)}
          >
            <div className="popout-content">{p.content}</div>
          </PopoutWindow>
        );
      })}

      {dragging && (
        <>
          <div className={`fp-drop-zone fp-drop-left${activeZone === "left" ? " active" : ""}`} />
          <div className={`fp-drop-zone fp-drop-right${activeZone === "right" ? " active" : ""}`} />
          <div className={`fp-drop-zone fp-drop-top${activeZone === "top" ? " active" : ""}`} />
          <div className={`fp-drop-zone fp-drop-bottom${activeZone === "bottom" ? " active" : ""}`} />
          <div className={`fp-drop-zone fp-drop-center${activeZone === "center" ? " active" : ""}`} />
        </>
      )}

      {(hiddenPanels.length > 0 || poppedOutPanels.length > 0) && (
        <div className="fp-toolbar">
          {hiddenPanels.map((p) => (
            <Tooltip key={p.id} text={`Show ${p.title}`} side="top">
              <button
                className="fp-toolbar-btn"
                onClick={() => handleToggleVisible(p.id)}
              >
                {getPanelIcon(p.id)}
              </button>
            </Tooltip>
          ))}
          {poppedOutPanels.map((p) => (
            <Tooltip key={p.id} text={`Bring ${p.title} back`} side="top">
              <button
                className="fp-toolbar-btn fp-toolbar-btn-popout"
                onClick={() => handlePopIn(p.id)}
              >
                {getPanelIcon(p.id)}
                <span className="fp-popout-dot" />
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
