import React, { useEffect, useRef } from 'react';
import type { Dataset } from '../../../shared/types';
import { usePlanetStore, type ActiveMapTool } from '../../store/planetStore';
import { DataRail } from '../data/DataRail';
import {
  Activity,
  Compass,
  Crosshair,
  GitFork,
  HelpCircle,
  Keyboard,
  Layers,
  Route,
  Ruler,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Wrench,
} from 'lucide-react';

interface LeftInstrumentSpineProps {
  datasets: Dataset[];
  lastSynchronized: string;
}

const TOOL_OPTIONS: Array<{
  id: ActiveMapTool;
  label: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'ROUTE',
    label: 'Plan a route (A → B)',
    desc: 'Place start & destination on Mars',
    icon: <GitFork className="w-3.5 h-3.5 text-[#D98A4E]" />,
  },
  {
    id: 'MEASURE_DIST',
    label: 'Measure distance',
    desc: 'Direct geodesic span & bearing',
    icon: <Ruler className="w-3.5 h-3.5 text-[#D4B483]" />,
  },
  {
    id: 'MEASURE_PATH',
    label: 'Measure path',
    desc: 'Multi-waypoint traverse length',
    icon: <Route className="w-3.5 h-3.5 text-[#D4B483]" />,
  },
  {
    id: 'INSPECT_COORD',
    label: 'Inspect coordinate',
    desc: 'Query 1m DEM elevation & slope',
    icon: <Crosshair className="w-3.5 h-3.5 text-[#5E9C76]" />,
  },
  {
    id: 'PROFILE',
    label: 'Elevation profile',
    desc: 'Scrub cross-section terrain',
    icon: <Activity className="w-3.5 h-3.5 text-[#5B8BB4]" />,
  },
  {
    id: 'COMPARE',
    label: 'Split layer compare',
    desc: 'Swipe between two Mars datasets',
    icon: <SplitSquareHorizontal className="w-3.5 h-3.5 text-[#D4B483]" />,
  },
];

export const LeftInstrumentSpine: React.FC<LeftInstrumentSpineProps> = ({
  datasets,
  lastSynchronized,
}) => {
  const {
    leftRailOpen,
    activeLayers,
    evidenceStoryActive,
    measureMode,
    measureVariant,
    compareMode,
    bottomTrayOpen,
    bottomTrayTab,
    simpleAdvanced,
    searchModalOpen,
    pickingRoutePoint,
    routePlanningActive,
    toolsMenuOpen,
    shortcutsOpen,
    setLeftRailOpen,
    setEvidenceStory,
    setToolsMenuOpen,
    setActiveTool,
    enterRoutePlanningMode,
    setSimpleAdvanced,
    startTour,
    setShortcutsOpen,
    setLimitationsOpen,
    setSearchModalOpen,
  } = usePlanetStore();

  const toolsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!toolsMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (toolsContainerRef.current && !toolsContainerRef.current.contains(e.target as Node)) {
        setToolsMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [toolsMenuOpen, setToolsMenuOpen]);

  const anyToolActive = measureMode || compareMode || Boolean(pickingRoutePoint);

  const isToolOptionActive = (id: ActiveMapTool): boolean => {
    if (id === 'ROUTE') return routePlanningActive || Boolean(pickingRoutePoint);
    if (id === 'MEASURE_DIST') return measureMode && measureVariant === 'DISTANCE';
    if (id === 'MEASURE_PATH') return measureMode && measureVariant === 'PATH';
    if (id === 'INSPECT_COORD') return bottomTrayOpen && bottomTrayTab === 'PROBE';
    if (id === 'PROFILE') return bottomTrayOpen && bottomTrayTab === 'PROFILE';
    if (id === 'COMPARE') return compareMode;
    return false;
  };

  return (
    <div className="hidden lg:flex h-full z-20 pointer-events-none no-print relative">
      {/* Vertical 54px Instrument Spine */}
      <nav
        aria-label="Map instrument spine"
        className="pointer-events-auto w-[54px] h-full bg-[#0B0D10] border-r border-[#242832] py-2.5 flex flex-col items-center justify-between shrink-0"
      >
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            data-tour="search-btn"
            onClick={() => setSearchModalOpen(true)}
            data-active={searchModalOpen}
            aria-label="Command search (Ctrl+K)"
            title="Search Mars places, targets & coordinates (Ctrl+K)"
            className="mp-spine-btn cursor-pointer"
          >
            <Search className="w-4 h-4 text-[#D4B483]" />
            <span className="text-[9px] font-telemetry">Search</span>
          </button>

          <button
            type="button"
            data-tour="data-btn"
            onClick={() => setLeftRailOpen(!leftRailOpen)}
            data-active={leftRailOpen}
            aria-label="Toggle planetary data layers"
            title="Planetary Data Layers"
            className="mp-spine-btn cursor-pointer relative"
          >
            <Layers className="w-4 h-4 text-[#D4B483]" />
            <span className="text-[9px] font-telemetry tabular-nums">
              Data ({activeLayers.length})
            </span>
          </button>

          <button
            type="button"
            data-tour="story-btn"
            onClick={() => setEvidenceStory(!evidenceStoryActive, 0)}
            data-active={evidenceStoryActive}
            aria-label="Toggle 5-stage Follow the Evidence story"
            title="5-Stage Evidence Story"
            className="mp-spine-btn cursor-pointer"
          >
            <Compass className="w-4 h-4 text-[#D98A4E]" />
            <span className="text-[9px] font-telemetry">Story</span>
          </button>

          <div className="w-7 h-px bg-[#242832] my-1" />

          <button
            type="button"
            data-tour="plan-route-spine"
            onClick={() => enterRoutePlanningMode(true)}
            data-active={Boolean(pickingRoutePoint) || routePlanningActive}
            aria-label="Plan a Marswalk route from Point A to Point B"
            title="Plan a Route (Point A → Point B)"
            className="mp-spine-btn cursor-pointer"
          >
            <GitFork className="w-4 h-4 text-[#D98A4E]" />
            <span className="text-[9px] font-telemetry">Route</span>
          </button>

          <div ref={toolsContainerRef} className="relative">
            <button
              type="button"
              data-tour="tools-btn"
              onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
              data-active={toolsMenuOpen || anyToolActive}
              aria-expanded={toolsMenuOpen}
              aria-label="Open exploration tools menu"
              title="Tools: Measure, Inspect, Elevation, Compare, Route"
              className="mp-spine-btn cursor-pointer"
            >
              <Wrench className="w-4 h-4 text-[#D4B483]" />
              <span className="text-[9px] font-telemetry">Tools</span>
            </button>

            {toolsMenuOpen && (
              <div
                role="menu"
                aria-label="Field exploration tools"
                className="absolute left-full top-0 ml-2 w-60 mp-instrument-panel mp-reticle-frame p-2 space-y-1 z-50 mp-settle-in"
              >
                <div className="px-2 py-1 text-[10px] font-telemetry tracking-wider text-[#D4B483] border-b border-[#242832]">
                  TOOLS
                </div>
                {TOOL_OPTIONS.map((tool) => {
                  const active = isToolOptionActive(tool.id);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      role="menuitem"
                      onClick={() => setActiveTool(tool.id)}
                      className={`w-full text-left px-2.5 py-2 flex items-start gap-2.5 transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#171A20] border border-[#D4B483] text-[#F7F3EB]'
                          : 'border border-transparent hover:bg-[#171A20] text-[#EAE4D9]'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">{tool.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium leading-tight">
                          {tool.label}
                        </span>
                        <span className="block text-[10px] text-[#9D968A] mt-0.5 leading-snug">
                          {tool.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setSimpleAdvanced(simpleAdvanced === 'SIMPLE' ? 'ADVANCED' : 'SIMPLE')
            }
            data-active={simpleAdvanced === 'ADVANCED'}
            aria-label="Toggle Simple or Advanced technical depth"
            title={`Detail depth: ${simpleAdvanced}`}
            className="mp-spine-btn cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#D98A4E]" />
            <span className="text-[9px] font-telemetry">
              {simpleAdvanced === 'SIMPLE' ? 'Simple' : 'Adv'}
            </span>
          </button>

          <button
            type="button"
            data-tour="tour-replay-btn"
            onClick={() => startTour(0)}
            aria-label="Start interactive 12-step guided tour"
            title="Mission Training Tour (12 steps)"
            className="mp-spine-btn cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="text-[9px] font-telemetry">Tour</span>
          </button>

          <button
            type="button"
            onClick={() => setShortcutsOpen(!shortcutsOpen)}
            data-active={shortcutsOpen}
            aria-label="Open keyboard shortcut guide (K)"
            title="Keyboard Shortcuts (K)"
            className="mp-spine-btn cursor-pointer"
          >
            <Keyboard className="w-4 h-4 text-[#D4B483]" />
            <span className="text-[9px] font-telemetry">Keys</span>
          </button>

          <button
            type="button"
            onClick={() => setLimitationsOpen(true)}
            aria-label="Open data limitations and methodology"
            title="Scientific Limitations"
            className="mp-spine-btn cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4 text-[#D98A4E]" />
            <span className="text-[9px] font-telemetry">Limits</span>
          </button>
        </div>
      </nav>

      {/* Slide-out Planetary Layer Blade */}
      {leftRailOpen && (
        <div className="pointer-events-auto h-full w-[310px] border-r border-[#242832] bg-[#111317] mp-slide-left">
          <DataRail datasets={datasets} lastSynchronized={lastSynchronized} />
        </div>
      )}
    </div>
  );
};
