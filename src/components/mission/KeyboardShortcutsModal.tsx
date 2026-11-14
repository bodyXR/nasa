import React, { useEffect } from 'react';
import { usePlanetStore } from '../../store/planetStore';
import {
  Activity,
  Columns2,
  Compass,
  GitFork,
  Keyboard,
  Layers,
  PanelRight,
  RotateCcw,
  Ruler,
  Search,
  X,
} from 'lucide-react';

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
}

interface ShortcutRow {
  keys: string[];
  label: string;
  icon?: React.ReactNode;
  onTrigger?: () => void;
}

export const KeyboardShortcutsModal: React.FC = () => {
  const {
    shortcutsOpen,
    mode,
    leftRailOpen,
    rightRailOpen,
    bottomTrayOpen,
    measureMode,
    sideBySideCompare,
    setShortcutsOpen,
    setSearchModalOpen,
    setMode,
    setLeftRailOpen,
    setRightRailOpen,
    setBottomTrayOpen,
    setActiveTool,
    enterRoutePlanningMode,
    toggleSideBySideCompare,
    setCamera,
    setPickingRoutePoint,
    setLimitationsOpen,
    setBriefOpen,
  } = usePlanetStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const st = usePlanetStore.getState();

      // Always allow 'k' (without modifiers) or '?' to toggle shortcut guide
      if (key === 'k' || e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(!st.shortcutsOpen);
        return;
      }

      if (e.key === 'Escape') {
        if (st.shortcutsOpen) {
          e.preventDefault();
          setShortcutsOpen(false);
          return;
        }
        if (st.pickingRoutePoint) {
          e.preventDefault();
          setPickingRoutePoint(null);
          return;
        }
        if (st.measureMode) {
          e.preventDefault();
          setActiveTool('NONE');
          return;
        }
      }

      // Skip global tool hotkeys when another modal dialog owns focus
      if (
        st.shortcutsOpen ||
        st.searchModalOpen ||
        st.briefOpen ||
        st.limitationsOpen ||
        st.tourWelcomeOpen ||
        st.tourCompletionModalOpen
      ) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        setSearchModalOpen(true);
      } else if (key === 'p') {
        e.preventDefault();
        if (st.mode !== 'FIELD') setMode('FIELD');
        enterRoutePlanningMode(true);
      } else if (key === 'c') {
        e.preventDefault();
        if (st.mode !== 'FIELD') setMode('FIELD');
        toggleSideBySideCompare();
      } else if (key === 'm') {
        e.preventDefault();
        if (st.mode !== 'FIELD') setMode('FIELD');
        setActiveTool(st.measureMode ? 'NONE' : 'MEASURE_DIST');
      } else if (key === 'l') {
        e.preventDefault();
        if (st.mode !== 'FIELD') setMode('FIELD');
        setLeftRailOpen(!st.leftRailOpen);
      } else if (key === 'i') {
        e.preventDefault();
        if (st.mode !== 'FIELD') setMode('FIELD');
        setRightRailOpen(!st.rightRailOpen);
      } else if (key === 't') {
        e.preventDefault();
        if (st.mode !== 'FIELD') setMode('FIELD');
        setBottomTrayOpen(!st.bottomTrayOpen);
      } else if (key === 'h') {
        e.preventDefault();
        if (st.mode !== 'FIELD') setMode('FIELD');
        setCamera({
          lon: 137.3889,
          lat: -4.775,
          zoom: 12.2,
          bearing: 0,
          pitch: 0,
        });
      } else if (e.key === '1') {
        e.preventDefault();
        setMode('ORBIT');
      } else if (e.key === '2') {
        e.preventDefault();
        setMode('FIELD');
      } else if (e.key === '3') {
        e.preventDefault();
        setMode('EARTH');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    setShortcutsOpen,
    setSearchModalOpen,
    setMode,
    setLeftRailOpen,
    setRightRailOpen,
    setBottomTrayOpen,
    setActiveTool,
    enterRoutePlanningMode,
    toggleSideBySideCompare,
    setCamera,
    setPickingRoutePoint,
    setLimitationsOpen,
    setBriefOpen,
  ]);

  if (!shortcutsOpen) return null;

  const runAndClose = (fn: () => void) => {
    setShortcutsOpen(false);
    fn();
  };

  const toolShortcuts: ShortcutRow[] = [
    {
      keys: ['P'],
      label: 'Plan Route (A → B)',
      icon: <GitFork className="w-3.5 h-3.5 text-[#D98A4E]" />,
      onTrigger: () =>
        runAndClose(() => {
          if (mode !== 'FIELD') setMode('FIELD');
          enterRoutePlanningMode(true);
        }),
    },
    {
      keys: ['C'],
      label: sideBySideCompare ? 'Exit Side-by-Side' : 'Side-by-Side Compare',
      icon: <Columns2 className="w-3.5 h-3.5 text-[#D4B483]" />,
      onTrigger: () =>
        runAndClose(() => {
          if (mode !== 'FIELD') setMode('FIELD');
          toggleSideBySideCompare();
        }),
    },
    {
      keys: ['M'],
      label: measureMode ? 'Exit Measure' : 'Measure Distance',
      icon: <Ruler className="w-3.5 h-3.5 text-[#D4B483]" />,
      onTrigger: () =>
        runAndClose(() => {
          if (mode !== 'FIELD') setMode('FIELD');
          setActiveTool(measureMode ? 'NONE' : 'MEASURE_DIST');
        }),
    },
    {
      keys: ['L'],
      label: leftRailOpen ? 'Hide Data Layers' : 'Data Layers Blade',
      icon: <Layers className="w-3.5 h-3.5 text-[#5E9C76]" />,
      onTrigger: () =>
        runAndClose(() => {
          if (mode !== 'FIELD') setMode('FIELD');
          setLeftRailOpen(!leftRailOpen);
        }),
    },
    {
      keys: ['I'],
      label: rightRailOpen ? 'Hide Inspector' : 'Context Inspector',
      icon: <PanelRight className="w-3.5 h-3.5 text-[#5B8BB4]" />,
      onTrigger: () =>
        runAndClose(() => {
          if (mode !== 'FIELD') setMode('FIELD');
          setRightRailOpen(!rightRailOpen);
        }),
    },
    {
      keys: ['T'],
      label: bottomTrayOpen ? 'Collapse Telemetry' : 'Elevation & Telemetry',
      icon: <Activity className="w-3.5 h-3.5 text-[#5B8BB4]" />,
      onTrigger: () =>
        runAndClose(() => {
          if (mode !== 'FIELD') setMode('FIELD');
          setBottomTrayOpen(!bottomTrayOpen);
        }),
    },
  ];

  const workspaceShortcuts: ShortcutRow[] = [
    {
      keys: ['/'],
      label: 'Search Places & Coords',
      icon: <Search className="w-3.5 h-3.5 text-[#D4B483]" />,
      onTrigger: () => runAndClose(() => setSearchModalOpen(true)),
    },
    {
      keys: ['Ctrl', 'K'],
      label: 'Command Search',
      icon: <Search className="w-3.5 h-3.5 text-[#9D968A]" />,
      onTrigger: () => runAndClose(() => setSearchModalOpen(true)),
    },
    {
      keys: ['1', '2', '3'],
      label: 'Orbit / Mars Map / Earth',
      icon: <Compass className="w-3.5 h-3.5 text-[#D98A4E]" />,
      onTrigger: () => runAndClose(() => setMode(mode === 'FIELD' ? 'ORBIT' : 'FIELD')),
    },
    {
      keys: ['K'],
      label: 'Toggle This Guide',
      icon: <Keyboard className="w-3.5 h-3.5 text-[#D4B483]" />,
      onTrigger: () => setShortcutsOpen(false),
    },
    {
      keys: ['Esc'],
      label: 'Close Panel / Exit Tool',
      onTrigger: () => setShortcutsOpen(false),
    },
  ];

  const navShortcuts: ShortcutRow[] = [
    {
      keys: ['W', 'A', 'S', 'D'],
      label: 'Pan Surface',
    },
    {
      keys: ['↑', '↓', '←', '→'],
      label: 'Fine Map Pan',
    },
    {
      keys: ['+', '-'],
      label: 'Zoom In / Out',
      onTrigger: () =>
        runAndClose(() => {
          if (mode !== 'FIELD') setMode('FIELD');
        }),
    },
    {
      keys: ['R'],
      label: 'Reset North & 2D Pitch',
      icon: <RotateCcw className="w-3.5 h-3.5 text-[#9D968A]" />,
      onTrigger: () =>
        runAndClose(() => {
          if (mode !== 'FIELD') setMode('FIELD');
          setCamera({ bearing: 0, pitch: 0 });
        }),
    },
    {
      keys: ['H'],
      label: 'Center Gale Crater',
      icon: <Compass className="w-3.5 h-3.5 text-[#5E9C76]" />,
      onTrigger: () =>
        runAndClose(() => {
          if (mode !== 'FIELD') setMode('FIELD');
          setCamera({ lon: 137.3889, lat: -4.775, zoom: 12.2, bearing: 0, pitch: 0 });
        }),
    },
  ];

  const KeyCap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 bg-[#07080A] border border-[#373D4B] border-b-2 rounded-[2px] text-[10px] font-telemetry font-medium text-[#F7F3EB] tabular-nums">
      {children}
    </kbd>
  );

  const renderRows = (rows: ShortcutRow[]) => (
    <div className="space-y-1">
      {rows.map((row) => {
        const content = (
          <>
            <span className="flex items-center gap-2 min-w-0 text-xs text-[#EAE4D9]">
              {row.icon && <span className="shrink-0">{row.icon}</span>}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {row.keys.map((k, idx) => (
                <KeyCap key={`${row.label}-${idx}`}>{k}</KeyCap>
              ))}
            </span>
          </>
        );

        if (row.onTrigger) {
          return (
            <button
              key={row.label}
              type="button"
              onClick={row.onTrigger}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 bg-[#0B0D10] hover:bg-[#171A20] border border-transparent hover:border-[#373D4B] transition-colors cursor-pointer text-left"
            >
              {content}
            </button>
          );
        }

        return (
          <div
            key={row.label}
            className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#0B0D10]"
          >
            {content}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-label="Keyboard Shortcuts Guide"
      className="fixed inset-0 z-50 bg-[#07080A]/75 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShortcutsOpen(false);
      }}
    >
      <div className="w-full max-w-3xl mp-instrument-panel mp-reticle-frame p-4 md:p-5 space-y-4 mp-settle-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#242832] pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] font-telemetry tracking-[0.14em] text-[#D4B483]">
              <Keyboard className="w-3.5 h-3.5" />
              <span>KEYBOARD SHORTCUT GUIDE</span>
            </div>
            <h2 className="font-editorial text-xl font-medium text-[#F7F3EB]">
              Mouse-Free Field Navigation &amp; Tools
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-telemetry text-[#9D968A]">
              <span>Toggle:</span>
              <KeyCap>K</KeyCap>
            </span>
            <button
              type="button"
              onClick={() => setShortcutsOpen(false)}
              aria-label="Close keyboard shortcuts guide"
              className="min-w-[32px] min-h-[32px] flex items-center justify-center text-[#9D968A] hover:text-[#F7F3EB] border border-[#242832] hover:border-[#373D4B] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Visual Navigation Keycap Cluster + 3 Functional Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Column 1: Route & Tools */}
          <div className="space-y-2">
            <div className="text-[10px] font-telemetry tracking-wider text-[#D98A4E] uppercase">
              Route &amp; Field Tools
            </div>
            {renderRows(toolShortcuts)}
          </div>

          {/* Column 2: Map Navigation + Visual D-Pad */}
          <div className="space-y-2">
            <div className="text-[10px] font-telemetry tracking-wider text-[#5E9C76] uppercase">
              Map Navigation
            </div>

            <div className="bg-[#0B0D10] border border-[#242832] p-2.5 flex items-center justify-between gap-3">
              <div className="flex flex-col items-center gap-1" aria-hidden="true">
                <KeyCap>W</KeyCap>
                <div className="flex items-center gap-1">
                  <KeyCap>A</KeyCap>
                  <KeyCap>S</KeyCap>
                  <KeyCap>D</KeyCap>
                </div>
              </div>
              <div className="h-8 w-px bg-[#242832]" />
              <div className="flex flex-col items-center gap-1" aria-hidden="true">
                <KeyCap>↑</KeyCap>
                <div className="flex items-center gap-1">
                  <KeyCap>←</KeyCap>
                  <KeyCap>↓</KeyCap>
                  <KeyCap>→</KeyCap>
                </div>
              </div>
              <div className="h-8 w-px bg-[#242832]" />
              <div className="flex flex-col items-center gap-1" aria-hidden="true">
                <KeyCap>+</KeyCap>
                <KeyCap>-</KeyCap>
              </div>
            </div>

            {renderRows(navShortcuts)}
          </div>

          {/* Column 3: Search & Workspace */}
          <div className="space-y-2">
            <div className="text-[10px] font-telemetry tracking-wider text-[#5B8BB4] uppercase">
              Search &amp; Views
            </div>
            {renderRows(workspaceShortcuts)}
          </div>
        </div>

        {/* Footer tip */}
        <div className="pt-2 border-t border-[#242832] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9D968A]">
          <span>Click any action row above to execute immediately without leaving the keyboard.</span>
          <span className="font-telemetry text-[10px] text-[#D4B483]">
            ESC TO DISMISS · WASD / ARROWS PAN
          </span>
        </div>
      </div>
    </div>
  );
};
