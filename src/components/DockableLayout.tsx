import { useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { FloatingPanel, PanelRect, getPanelIcon } from "./DockPanel";
import { PopoutWindow } from "./PopoutWindow";
import { Tooltip } from "./Tooltip";
import { Conversation } from "../types";
import { ApiKeyModal } from "./ApiKeyModal";
import { FaqModal } from "./FaqModal";
import { GettingStartedModal } from "./GettingStartedModal";
import { MCPConfigPanel } from "./MCPConfigPanel";
import { SkillsPanel } from "./SkillsPanel";
import { SystemPromptModal } from "./SystemPromptModal";
import { ScheduleModal } from "./ScheduleModal";
import { UsageStatsBar } from "./UsageStatsBar";

type DockPosition = "left" | "right" | "top" | "bottom";
type DropZone = DockPosition | "center";
type PanelId = "chats" | "files" | "main" | "preview";

const ALL_PANEL_IDS: PanelId[] = ["chats", "files", "main", "preview"];

interface PanelConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  pinned: boolean;
  pinnedPosition: DockPosition;
  pinnedSize: number;
  pinnedHeight?: number | null;
  splitRatio?: number;
  isCenter: boolean;
}

export interface LayoutState {
  chats: PanelConfig;
  files: PanelConfig;
  main: PanelConfig;
  preview: PanelConfig;
  zOrder: PanelId[];
}

const STORAGE_KEY = "dock-layout";

function getDefaults(): LayoutState {
  const h = window.innerHeight;
  const w = window.innerWidth;
  const filesWidth = Math.round(w * 0.2);
  return {
    chats: {
      x: 16, y: 16, width: 280, height: Math.max(300, h - 80),
      visible: false, pinned: true, pinnedPosition: "right", pinnedSize: 280,
      isCenter: false,
    },
    files: {
      x: 16, y: 16, width: filesWidth, height: Math.max(300, h - 80),
      visible: true, pinned: true, pinnedPosition: "left", pinnedSize: filesWidth,
      isCenter: false,
    },
    main: {
      x: 0, y: 0, width: 600, height: Math.max(300, h - 80),
      visible: true, pinned: false, pinnedPosition: "left", pinnedSize: 400,
      isCenter: true,
    },
    preview: {
      x: 100, y: 100, width: 420, height: Math.max(300, h - 80),
      visible: false, pinned: true, pinnedPosition: "right", pinnedSize: 420,
      isCenter: false,
    },
    zOrder: ["chats", "files", "main", "preview"],
  };
}

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.main && parsed.chats && parsed.files && parsed.zOrder) {
        const defaults = getDefaults();
        if (!parsed.preview) {
          parsed.preview = defaults.preview;
          if (!parsed.zOrder.includes("preview")) parsed.zOrder.push("preview");
        }
        parsed.main.visible = true;
        parsed.main.isCenter = true;
        parsed.files.visible = true;
        parsed.files.pinned = true;
        parsed.files.isCenter = false;
        parsed.files.pinnedPosition = "left";
        if (!parsed.files.pinnedSize || parsed.files.pinnedSize < 200) {
          parsed.files.pinnedSize = defaults.files.pinnedSize;
        }
        parsed.chats.visible = false;
        parsed.chats.isCenter = false;
        parsed.preview.visible = false;
        parsed.preview.isCenter = false;
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
  previewContent: ReactNode;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  conversation: Conversation | null;
  onGoHome?: () => void;
  isWelcome?: boolean;
  chatOnly?: boolean;
  onToast?: (msg: string) => void;
  openPreviewRef?: React.MutableRefObject<(() => void) | null>;
  showGettingStartedRef?: React.MutableRefObject<(() => void) | null>;
}

export function DockableLayout({
  chatsContent,
  filesContent,
  mainContent,
  previewContent,
  theme,
  onToggleTheme,
  conversation,
  onGoHome,
  isWelcome,
  chatOnly,
  onToast,
  openPreviewRef,
  showGettingStartedRef,
}: DockableLayoutProps) {
  const [layout, setLayout] = useState<LayoutState>(loadLayout);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const [activeZone, setActiveZone] = useState<DropZone | null>(null);
  const [resizingEdge, setResizingEdge] = useState<DockPosition | null>(null);
  const [poppedOut, setPoppedOut] = useState<Set<PanelId>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showGettingStarted, setShowGettingStarted] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showUsageStats, setShowUsageStats] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettings && !showProfile) return;
    const handler = (e: MouseEvent) => {
      if (showSettings && settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
      if (showProfile && profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSettings, showProfile]);

  const layoutRef = useRef<HTMLDivElement>(null);
  const layoutStateRef = useRef(layout);
  const activeZoneRef = useRef(activeZone);
  const containerSizeRef = useRef(containerSize);

  const prevIsWelcomeRef = useRef(isWelcome);

  useEffect(() => { layoutStateRef.current = layout; }, [layout]);
  useEffect(() => { activeZoneRef.current = activeZone; }, [activeZone]);
  useEffect(() => { containerSizeRef.current = containerSize; }, [containerSize]);
  useEffect(() => { saveLayout(layout); }, [layout]);

  useEffect(() => {
    if (prevIsWelcomeRef.current && !isWelcome && !chatOnly) {
      setLayout((prev) => ({
        ...prev,
        chats: { ...prev.chats, visible: true, pinned: true, pinnedPosition: "left", isCenter: false },
        files: { ...prev.files, visible: true, pinned: true, pinnedPosition: "right", isCenter: false },
        main: { ...prev.main, visible: true, isCenter: true },
        preview: { ...prev.preview, visible: false, isCenter: false },
      }));
    }
    prevIsWelcomeRef.current = isWelcome;
  }, [isWelcome, chatOnly]);

  // Auto-popout preview when it becomes visible (unless user explicitly docked it)
  const previewDockedByUserRef = useRef(false);
  const prevPreviewVisibleRef = useRef(layout.preview.visible);

  useEffect(() => {
    const nowVisible = layout.preview.visible;
    const wasVisible = prevPreviewVisibleRef.current;
    prevPreviewVisibleRef.current = nowVisible;

    if (!wasVisible && nowVisible && !previewDockedByUserRef.current && !poppedOut.has("preview")) {
      setPoppedOut((prev) => {
        const next = new Set(prev);
        next.add("preview");
        return next;
      });
    }
    if (!nowVisible) {
      previewDockedByUserRef.current = false;
    }
  }, [layout.preview.visible, poppedOut]);

  // Expose a function for child components to open the preview as a popout
  useEffect(() => {
    if (openPreviewRef) {
      openPreviewRef.current = () => {
        previewDockedByUserRef.current = false;
        setLayout((prev) => ({
          ...prev,
          preview: { ...prev.preview, visible: true },
        }));
      };
    }
  }, [openPreviewRef]);

  useEffect(() => {
    if (showGettingStartedRef) {
      showGettingStartedRef.current = () => setShowGettingStarted(true);
    }
  }, [showGettingStartedRef]);

  // Auto-promote a panel to center if center is empty
  useEffect(() => {
    const hasCenter = ALL_PANEL_IDS.some((id) => layout[id].isCenter && layout[id].visible && !poppedOut.has(id));
    if (hasCenter) return;

    // Priority: main first, then any visible panel
    const candidates: PanelId[] = ["main", ...ALL_PANEL_IDS.filter((id) => id !== "main")];
    const pick = candidates.find((id) => layout[id].visible && !poppedOut.has(id));
    if (!pick) return;

    setLayout((prev) => ({
      ...prev,
      [pick]: { ...prev[pick], pinned: false, isCenter: true },
    }));
  }, [layout, poppedOut]);

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

  const allPanelDefs: PanelDef[] = [
    { id: "chats", title: "Convos", content: chatsContent },
    { id: "files", title: "Files", content: filesContent },
    { id: "main", title: "Chat", content: mainContent },
    { id: "preview", title: "Live Preview", content: previewContent },
  ];

  const hiddenByMode = chatOnly ? new Set<PanelId>(["files", "preview"]) : new Set<PanelId>();
  const panelDefs = allPanelDefs.filter((p) => !hiddenByMode.has(p.id));

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
        const cur = layoutStateRef.current;

        const leftWidth = Math.max(edgePx, ...ALL_PANEL_IDS
          .filter((id) => id !== pid && cur[id].pinned && cur[id].pinnedPosition === "left" && cur[id].visible)
          .map((id) => cur[id].pinnedSize + 8));
        const rightWidth = Math.max(edgePx, ...ALL_PANEL_IDS
          .filter((id) => id !== pid && cur[id].pinned && cur[id].pinnedPosition === "right" && cur[id].visible)
          .map((id) => cur[id].pinnedSize + 8));

        if (x < leftWidth) setActiveZone("left");
        else if (x > containerRect.width - rightWidth) setActiveZone("right");
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
              splitRatio: 1,
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
    if (panelId === "preview") {
      previewDockedByUserRef.current = true;
    }
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

  const [resizingPinnedHeight, setResizingPinnedHeight] = useState<DockPosition | null>(null);

  useEffect(() => {
    if (!resizingPinnedHeight) return;
    const pos = resizingPinnedHeight;

    const handleMouseMove = (e: MouseEvent) => {
      if (!layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const newHeight = e.clientY - rect.top;
      const clamped = Math.max(MIN_PINNED, Math.min(newHeight, rect.height - 32));

      setLayout((prev) => {
        const next = { ...prev };
        for (const pid of ALL_PANEL_IDS) {
          if (prev[pid].pinned && prev[pid].pinnedPosition === pos && prev[pid].visible) {
            next[pid] = { ...prev[pid], pinnedHeight: clamped };
          }
        }
        return next;
      });
    };

    const handleMouseUp = () => {
      setResizingPinnedHeight(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingPinnedHeight]);

  const [resizingSplit, setResizingSplit] = useState<{ pos: DockPosition; index: number } | null>(null);

  useEffect(() => {
    if (!resizingSplit) return;
    const { pos, index } = resizingSplit;

    const handleMouseMove = (e: MouseEvent) => {
      if (!layoutRef.current) return;
      const slotEl = layoutRef.current.querySelector(`.fp-pinned-${pos}`);
      if (!slotEl) return;
      const slotRect = slotEl.getBoundingClientRect();

      const panels = ALL_PANEL_IDS.filter((id) => {
        const p = layoutStateRef.current[id];
        return p.pinned && p.pinnedPosition === pos && p.visible;
      });
      if (panels.length < 2 || index >= panels.length - 1) return;

      const aboveId = panels[index];
      const belowId = panels[index + 1];
      const totalRatio = panels.reduce((sum, id) => sum + (layoutStateRef.current[id].splitRatio || 1), 0);
      const totalHeight = slotRect.height;

      let heightBefore = 0;
      for (let i = 0; i < index; i++) {
        heightBefore += ((layoutStateRef.current[panels[i]].splitRatio || 1) / totalRatio) * totalHeight;
      }

      const combinedRatio = (layoutStateRef.current[aboveId].splitRatio || 1) + (layoutStateRef.current[belowId].splitRatio || 1);
      const combinedHeight = (combinedRatio / totalRatio) * totalHeight;
      const mouseY = e.clientY - slotRect.top;
      const newAboveHeight = Math.max(60, Math.min(mouseY - heightBefore, combinedHeight - 60));
      const newAboveRatio = (newAboveHeight / combinedHeight) * combinedRatio;
      const newBelowRatio = combinedRatio - newAboveRatio;

      setLayout((prev) => ({
        ...prev,
        [aboveId]: { ...prev[aboveId], splitRatio: newAboveRatio },
        [belowId]: { ...prev[belowId], splitRatio: newBelowRatio },
      }));
    };

    const handleMouseUp = () => {
      setResizingSplit(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingSplit]);

  const renderPinnedSlot = (pos: DockPosition) => {
    const panels = pinnedAt(pos);
    if (panels.length === 0) return null;

    const isHoriz = pos === "left" || pos === "right";
    const totalSize = panels.reduce((sum, p) => Math.max(sum, layout[p.id].pinnedSize), 0);
    const pinnedHeight = isHoriz ? panels.reduce((h, p) => layout[p.id].pinnedHeight ?? h, null as number | null) : null;
    const sizeStyle: React.CSSProperties = isHoriz
      ? { width: totalSize, ...(pinnedHeight != null ? { height: pinnedHeight, alignSelf: "flex-start" } : {}) }
      : { height: totalSize };

    const outerEdgeClass = isHoriz
      ? (pos === "left" ? "fp-outer-edge-left" : "fp-outer-edge-right")
      : (pos === "top" ? "fp-outer-edge-top" : "fp-outer-edge-bottom");

    return (
      <div className={`fp-pinned-slot fp-pinned-${pos}`} style={sizeStyle}>
        <div
          className={`fp-outer-edge ${outerEdgeClass}`}
          onMouseDown={() => setResizingEdge(pos)}
        />
        {panels.map((p, i) => (
          <div key={p.id} className="fp-pinned-panel" style={{ flex: layout[p.id].splitRatio || 1 }}>
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
              <div
                className="fp-pinned-split-handle"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setResizingSplit({ pos, index: i });
                }}
              />
            )}
          </div>
        ))}
        {isHoriz && (
          <div
            className="fp-resize-handle fp-rh-bottom fp-pinned-height-handle"
            onMouseDown={() => setResizingPinnedHeight(pos)}
          />
        )}
      </div>
    );
  };

  const renderResizeHandle = (pos: DockPosition) => {
    const panels = pinnedAt(pos);
    if (panels.length === 0) return null;
    const isHoriz = pos === "left" || pos === "right";
    const pinnedHeight = isHoriz ? panels.reduce((h, p) => layout[p.id].pinnedHeight ?? h, null as number | null) : null;
    const handleStyle: React.CSSProperties = pinnedHeight != null ? { height: pinnedHeight, alignSelf: "flex-start" } : {};
    return (
      <div
        className={`fp-resize-handle fp-rh-${pos}`}
        style={handleStyle}
        onMouseDown={() => setResizingEdge(pos)}
      />
    );
  };

  const centerPanels = panelDefs.filter((p) => layout[p.id].isCenter && layout[p.id].visible && !poppedOut.has(p.id));
  const floatingPanels = panelDefs.filter((p) => !layout[p.id].pinned && !layout[p.id].isCenter && layout[p.id].visible && !poppedOut.has(p.id));

  const dropZoneLeft = dragging ? Math.max(60, ...ALL_PANEL_IDS
    .filter((id) => id !== dragging && layout[id].pinned && layout[id].pinnedPosition === "left" && layout[id].visible)
    .map((id) => layout[id].pinnedSize + 8)) : 60;
  const dropZoneRight = dragging ? Math.max(60, ...ALL_PANEL_IDS
    .filter((id) => id !== dragging && layout[id].pinned && layout[id].pinnedPosition === "right" && layout[id].visible)
    .map((id) => layout[id].pinnedSize + 8)) : 60;
  const hiddenPanels = panelDefs.filter((p) => !layout[p.id].visible);
  const poppedOutPanels = panelDefs.filter((p) => poppedOut.has(p.id) && layout[p.id].visible);

  return (
    <div className={`fp-layout${resizingEdge || resizingPinnedHeight || resizingSplit ? " is-resizing" : ""}${isWelcome ? " fp-welcome" : ""}`} ref={layoutRef}>
      {!isWelcome && renderPinnedSlot("left")}
      {!isWelcome && renderResizeHandle("left")}

      <div className="fp-center-column">
        {!isWelcome && renderPinnedSlot("top")}
        {!isWelcome && renderResizeHandle("top")}

        <div className="fp-center">
          {isWelcome ? (
            <div className="fp-center-panel fp-center-panel-welcome">
              <div className="fp-body fp-center-body">{mainContent}</div>
            </div>
          ) : centerPanels.length > 0 ? (
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
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M3 9h18" />
                <path d="M9 9v12" />
              </svg>
              <span>No panels open</span>
              <div className="fp-center-empty-actions">
                {hiddenPanels.map((p) => (
                  <button
                    key={p.id}
                    className="fp-center-empty-btn"
                    onClick={() => handleToggleVisible(p.id)}
                  >
                    {getPanelIcon(p.id)}
                    <span>{p.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!isWelcome && renderResizeHandle("bottom")}
        {!isWelcome && renderPinnedSlot("bottom")}

        <div className="fp-toolbar">
          <div className="fp-toolbar-group fp-toolbar-center">
            {!isWelcome && hiddenPanels.map((p) => (
              <Tooltip key={p.id} text={`Show ${p.title}`} side="top">
                <button
                  className="fp-toolbar-btn"
                  onClick={() => handleToggleVisible(p.id)}
                >
                  {getPanelIcon(p.id)}
                </button>
              </Tooltip>
            ))}
            {!isWelcome && poppedOutPanels.map((p) => (
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
          <div className="fp-toolbar-group fp-toolbar-right">
            {conversation && onGoHome && (
              <Tooltip text="Home" side="top">
                <button
                  className="fp-toolbar-btn"
                  onClick={onGoHome}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8L8 3L13 8M4.5 9.5V13H6.5V10.5H9.5V13H11.5V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </Tooltip>
            )}
            <div ref={profileRef} style={{ position: "relative" }}>
              <Tooltip text="Profile" side="top">
                <button
                  className="fp-toolbar-btn"
                  onClick={() => { setShowProfile((s) => !s); setShowSettings(false); }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M2.5 14C2.5 11.5 5 10 8 10C11 10 13.5 11.5 13.5 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                </button>
              </Tooltip>
              {showProfile && (
                <div className="settings-dropdown settings-dropdown-bottom">
                  <button
                    className="settings-option"
                    onClick={() => { setShowApiKey(true); setShowProfile(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="5" cy="8" r="3" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M7.5 8H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M11 8V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M13 8V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    <span>API Key</span>
                  </button>
                  <button
                    className="settings-option"
                    onClick={() => { setShowUsageStats(true); setShowProfile(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4 2V14M8 4V14M12 6V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span>Usage</span>
                  </button>
                </div>
              )}
            </div>
            <Tooltip text={theme === "dark" ? "Light mode" : "Dark mode"} side="top">
              <button className="fp-toolbar-btn" onClick={onToggleTheme}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8 4A4 4 0 0 0 8 12Z" fill="currentColor"/>
                </svg>
              </button>
            </Tooltip>
            <div ref={settingsRef} style={{ position: "relative" }}>
              <Tooltip text="Settings" side="top">
                <button
                  className="fp-toolbar-btn"
                  onClick={() => { setShowSettings((s) => !s); setShowProfile(false); }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6.86 1.5H9.14L9.6 3.42L11.18 4.15L13.02 3.24L14.76 5.26L13.52 6.92L13.68 8.7L15.36 9.62L14.64 11.86L12.72 11.82L11.58 13.14L11.88 15.08L9.64 15.58L8.6 13.92H7.4L6.36 15.58L4.12 15.08L4.42 13.14L3.28 11.82L1.36 11.86L0.64 9.62L2.32 8.7L2.48 6.92L1.24 5.26L2.98 3.24L4.82 4.15L6.4 3.42L6.86 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" transform="scale(0.88) translate(1.1, 0.8)"/>
                    <circle cx="8" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                </button>
              </Tooltip>
              {showSettings && (
                <div className="settings-dropdown settings-dropdown-bottom">
                  <button
                    className="settings-option"
                    onClick={() => { setShowGettingStarted(true); setShowSettings(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M6 12.5V11C4.34 10.07 3.5 8.5 3.5 6.5C3.5 4 5.5 2 8 2C10.5 2 12.5 4 12.5 6.5C12.5 8.5 11.66 10.07 10 11V12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M6 14H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    <span>Getting Started</span>
                  </button>
                  <button
                    className="settings-option"
                    onClick={() => { setShowFaq(true); setShowSettings(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M6 6.5C6 5.4 6.9 4.5 8 4.5C9.1 4.5 10 5.4 10 6.5C10 7.3 9.5 8 8.8 8.3C8.3 8.5 8 8.9 8 9.4V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      <circle cx="8" cy="11.5" r="0.7" fill="currentColor"/>
                    </svg>
                    <span>FAQ</span>
                  </button>
                  <div className="settings-divider" />
                  <button
                    className="settings-option"
                    onClick={() => { setShowMcp(true); setShowSettings(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="1" y="4" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                      <circle cx="5" cy="8" r="1.5" fill="currentColor"/>
                      <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
                      <path d="M5 8H11" stroke="currentColor" strokeWidth="1.3"/>
                    </svg>
                    <span>MCP Servers</span>
                  </button>
                  <button
                    className="settings-option"
                    onClick={() => { setShowSkills(true); setShowSettings(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4.5 2L11.5 2C12.33 2 13 2.67 13 3.5L13 12.5C13 13.33 12.33 14 11.5 14L4.5 14C3.67 14 3 13.33 3 12.5L3 3.5C3 2.67 3.67 2 4.5 2Z" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M6 5.5L10 5.5M6 8L10 8M6 10.5L8.5 10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                    </svg>
                    <span>Skills</span>
                  </button>
                  <button
                    className="settings-option"
                    onClick={() => { setShowSystemPrompt(true); setShowSettings(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M2 3.5C2 2.67 2.67 2 3.5 2H12.5C13.33 2 14 2.67 14 3.5V10.5C14 11.33 13.33 12 12.5 12H5L2 15V3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                      <path d="M5 6H11M5 9H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    <span>System Prompt</span>
                  </button>
                  <button
                    className="settings-option"
                    onClick={() => { setShowSchedule(true); setShowSettings(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M8 4.5V8L10.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    <span>Scheduled Tasks</span>
                  </button>
                  <div className="settings-divider" />
                  <a
                    className="settings-option"
                    href="https://github.com/valranum/personal-claude-code-gui"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowSettings(false)}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1C4.13 1 1 4.13 1 8c0 3.1 2 5.7 4.8 6.6.35.07.48-.15.48-.34V13c-1.95.42-2.36-.94-2.36-.94-.32-.81-.78-1.03-.78-1.03-.64-.44.05-.43.05-.43.7.05 1.07.72 1.07.72.63 1.07 1.65.76 2.05.58.06-.45.24-.76.44-.94-1.56-.18-3.2-.78-3.2-3.47 0-.77.28-1.4.72-1.89-.07-.18-.31-.9.07-1.87 0 0 .59-.19 1.93.72a6.7 6.7 0 0 1 3.5 0c1.34-.91 1.93-.72 1.93-.72.38.97.14 1.69.07 1.87.45.49.72 1.12.72 1.89 0 2.7-1.65 3.29-3.22 3.46.25.22.48.65.48 1.31v1.94c0 .19.13.41.48.34C13 13.7 15 11.1 15 8c0-3.87-3.13-7-7-7Z" fill="currentColor"/>
                    </svg>
                    <span>GitHub</span>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ marginLeft: "auto" }}>
                      <path d="M5 3H13V11M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {!isWelcome && renderResizeHandle("right")}
      {!isWelcome && renderPinnedSlot("right")}

      {!isWelcome && floatingPanels.map((p) => (
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

      {!isWelcome && poppedOutPanels.map((p) => {
        const cfg = layout[p.id];
        const isHoriz = cfg.pinnedPosition === "left" || cfg.pinnedPosition === "right";
        const w = cfg.pinned ? (isHoriz ? cfg.pinnedSize : 600) : cfg.isCenter ? 800 : cfg.width || 600;
        const h = cfg.pinned ? (isHoriz ? 500 : cfg.pinnedSize) : cfg.isCenter ? 600 : cfg.height || 500;
        return (
          <PopoutWindow
            key={p.id}
            title={`${p.title} — Claude for Designers`}
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
          <div className={`fp-drop-zone fp-drop-left${activeZone === "left" ? " active" : ""}`} style={{ width: dropZoneLeft }} />
          <div className={`fp-drop-zone fp-drop-right${activeZone === "right" ? " active" : ""}`} style={{ width: dropZoneRight }} />
          <div className={`fp-drop-zone fp-drop-top${activeZone === "top" ? " active" : ""}`} />
          <div className={`fp-drop-zone fp-drop-bottom${activeZone === "bottom" ? " active" : ""}`} />
          <div className={`fp-drop-zone fp-drop-center${activeZone === "center" ? " active" : ""}`} />
        </>
      )}

      {showUsageStats && <UsageStatsBar onClose={() => setShowUsageStats(false)} />}

      <FaqModal open={showFaq} onClose={() => setShowFaq(false)} />
      <GettingStartedModal open={showGettingStarted} onClose={() => setShowGettingStarted(false)} />
      <ApiKeyModal open={showApiKey} onClose={() => setShowApiKey(false)} />
      {showMcp && conversation && (
        <MCPConfigPanel cwd={conversation.cwd} onClose={() => setShowMcp(false)} />
      )}
      {showSkills && (
        <SkillsPanel cwd={conversation?.cwd} onClose={() => setShowSkills(false)} />
      )}
      {showSystemPrompt && (
        <SystemPromptModal
          conversation={conversation}
          cwd={conversation?.cwd || "."}
          onClose={() => setShowSystemPrompt(false)}
        />
      )}
      <ScheduleModal
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        onToast={onToast}
      />
    </div>
  );
}
