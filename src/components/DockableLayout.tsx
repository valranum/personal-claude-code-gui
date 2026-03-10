import { useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { FloatingPanel, PanelRect, getPanelIcon } from "./DockPanel";

type DockPosition = "left" | "right" | "top" | "bottom";
type PanelId = "chats" | "files";

interface PanelConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  pinned: boolean;
  pinnedPosition: DockPosition;
  pinnedSize: number;
}

export interface LayoutState {
  chats: PanelConfig;
  files: PanelConfig;
  zOrder: PanelId[];
}

const STORAGE_KEY = "dock-layout";

function getDefaults(): LayoutState {
  const h = window.innerHeight;
  return {
    chats: {
      x: 16, y: 16, width: 280, height: Math.max(300, h - 80),
      visible: true, pinned: true, pinnedPosition: "left", pinnedSize: 280,
    },
    files: {
      x: 16, y: 16, width: 280, height: Math.max(300, h - 80),
      visible: true, pinned: true, pinnedPosition: "right", pinnedSize: 280,
    },
    zOrder: ["chats", "files"],
  };
}

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.chats && parsed.files && parsed.zOrder && typeof parsed.chats.pinned === "boolean") {
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
  children: ReactNode;
}

export function DockableLayout({
  chatsContent,
  filesContent,
  children,
}: DockableLayoutProps) {
  const [layout, setLayout] = useState<LayoutState>(loadLayout);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const [activeZone, setActiveZone] = useState<DockPosition | null>(null);
  const [resizingEdge, setResizingEdge] = useState<DockPosition | null>(null);

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
    { id: "chats", title: "Chats", content: chatsContent },
    { id: "files", title: "Files", content: filesContent },
  ];

  /* ── Unified drag handler ── */
  const handleDragStart = useCallback((panelId: string, e: React.PointerEvent) => {
    const pid = panelId as PanelId;
    const panel = layoutStateRef.current[pid];
    const wasPinned = panel.pinned;

    const startPos = { x: e.clientX, y: e.clientY };
    let active = false;
    let dragOffset: { x: number; y: number } | null = null;
    const detachedWidth = wasPinned ? (panel.pinnedSize || 280) : panel.width;

    // Bring to front immediately
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

        if (wasPinned) {
          dragOffset = { x: detachedWidth / 2, y: 16 };
          const newX = Math.max(0, ev.clientX - containerRect.left - dragOffset.x);
          const newY = Math.max(0, ev.clientY - containerRect.top - dragOffset.y);
          setLayout((prev) => ({
            ...prev,
            [pid]: { ...prev[pid], pinned: false, x: newX, y: newY, width: detachedWidth },
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
        newX = Math.max(0, Math.min(newX, cBounds.width - detachedWidth));
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
        else setActiveZone(null);
      }
    };

    const handleUp = () => {
      if (active) {
        const zone = activeZoneRef.current;
        if (zone) {
          const isHoriz = zone === "left" || zone === "right";
          setLayout((prev) => ({
            ...prev,
            [pid]: {
              ...prev[pid],
              pinned: true,
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
          pinnedPosition: nearest,
          pinnedSize: isHoriz ? p.width : p.height,
        },
      };
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
          width: w,
          height: Math.min(h, cs.height - 32),
          x: Math.max(16, Math.min(p.x, cs.width - w - 16)),
          y: Math.max(16, Math.min(p.y, cs.height - h - 16)),
        },
      };
    });
  }, []);

  /* ── Pinned resize ── */
  useEffect(() => {
    if (!resizingEdge) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      let newSize: number;

      switch (resizingEdge) {
        case "left": newSize = e.clientX - rect.left; break;
        case "right": newSize = rect.right - e.clientX; break;
        case "top": newSize = e.clientY - rect.top; break;
        case "bottom": newSize = rect.bottom - e.clientY; break;
      }

      newSize = Math.min(Math.max(newSize, 150), 500);

      setLayout((prev) => {
        const next = { ...prev };
        for (const pid of ["chats", "files"] as PanelId[]) {
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
    panelDefs.filter((p) => layout[p.id].pinned && layout[p.id].pinnedPosition === pos && layout[p.id].visible);

  const renderPinnedSlot = (pos: DockPosition) => {
    const panels = pinnedAt(pos);
    if (panels.length === 0) return null;

    const size = layout[panels[0].id].pinnedSize;
    const isHoriz = pos === "left" || pos === "right";
    const sizeStyle = isHoriz ? { width: size } : { height: size };

    return (
      <div className={`fp-pinned-slot fp-pinned-${pos}`} style={sizeStyle}>
        {panels.map((p) => (
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
              <button
                className="fp-pin-btn active"
                onClick={(e) => { e.stopPropagation(); handleUnpin(p.id); }}
                title="Unpin"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M10.5 2L14 5.5L10 9.5L8 11.5L4.5 8L6.5 6L10.5 2Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  <path d="M4.5 8L2 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
              <button
                className="fp-close"
                onClick={(e) => { e.stopPropagation(); handleToggleVisible(p.id); }}
                title={`Hide ${p.title}`}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="fp-body">{p.content}</div>
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

  const floatingPanels = panelDefs.filter((p) => !layout[p.id].pinned && layout[p.id].visible);
  const hiddenPanels = panelDefs.filter((p) => !layout[p.id].visible);

  return (
    <div className={`fp-layout${resizingEdge ? " is-resizing" : ""}`} ref={layoutRef}>
      {renderPinnedSlot("left")}
      {renderResizeHandle("left")}

      <div className="fp-center-column">
        {renderPinnedSlot("top")}
        {renderResizeHandle("top")}

        <div className="fp-center">{children}</div>

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
        >
          {p.content}
        </FloatingPanel>
      ))}

      {dragging && (
        <>
          <div className={`fp-drop-zone fp-drop-left${activeZone === "left" ? " active" : ""}`} />
          <div className={`fp-drop-zone fp-drop-right${activeZone === "right" ? " active" : ""}`} />
          <div className={`fp-drop-zone fp-drop-top${activeZone === "top" ? " active" : ""}`} />
          <div className={`fp-drop-zone fp-drop-bottom${activeZone === "bottom" ? " active" : ""}`} />
        </>
      )}

      {hiddenPanels.length > 0 && (
        <div className="fp-toolbar">
          {hiddenPanels.map((p) => (
            <button
              key={p.id}
              className="fp-toolbar-btn"
              onClick={() => handleToggleVisible(p.id)}
              title={`Show ${p.title}`}
            >
              {getPanelIcon(p.id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
