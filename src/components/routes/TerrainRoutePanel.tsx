import React, { useState } from 'react';
import type { RouteAnalysisResponse, RouteCandidate, ScienceTarget } from '../../../shared/types';
import { usePlanetStore } from '../../store/planetStore';
import { useFirebase, type RoutePresetKey } from '../auth/FirebaseProvider';
import { formatMarsCoord, marsBearingDeg, marsDistanceM } from '../../../shared/geo';
import { getRouteVisual } from '../../geo/routeStyles';
import {
  CalmErrorState,
  MetadataAccordion,
  MetricDisplay,
  ScienceLoadingState,
  WhyDrawer,
} from '../ui/InstrumentPrimitives';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  Bookmark,
  Cloud,
  Columns2,
  FileText,
  GitCompare,
  GitFork,
  MapPin,
  Navigation,
  Sliders,
  Trash2,
} from 'lucide-react';

export interface OriginPreset {
  id: string;
  label: string;
  coordinates: [number, number];
}

export const ORIGIN_PRESETS: OriginPreset[] = [
  {
    id: 'curiosity-sol5073',
    label: 'Curiosity Sol 5073 (Lower Mount Sharp Boxwork)',
    coordinates: [137.3889, -4.826],
  },
  {
    id: 'glen-torridon-sol2200',
    label: 'Glen Torridon Clay Trough (Sol ~2200)',
    coordinates: [137.372, -4.7495],
  },
  {
    id: 'vera-rubin-sol1800',
    label: 'Vera Rubin Ridge Crest (Sol ~1800)',
    coordinates: [137.3765, -4.7412],
  },
];

interface TerrainRoutePanelProps {
  targets: ScienceTarget[];
  selectedOriginId: string;
  onSelectOriginId: (id: string) => void;
  maxSlopeDeg: number;
  onChangeMaxSlopeDeg: (deg: number) => void;
  avoidDunes: boolean;
  onChangeAvoidDunes: (avoid: boolean) => void;
  routeAnalysis: RouteAnalysisResponse | null;
  analyzing: boolean;
  routeError: string | null;
  onRunAnalysis: () => void;
  onClearAnalysis: () => void;
  onLoadSavedPlan?: (plan: {
    start: [number, number];
    end: [number, number];
    maxSlopeDeg: number;
    avoidDunes: boolean;
  }) => void;
  onOpenBrief: () => void;
}

export const TerrainRoutePanel: React.FC<TerrainRoutePanelProps> = ({
  targets,
  selectedOriginId,
  onSelectOriginId,
  maxSlopeDeg,
  onChangeMaxSlopeDeg,
  avoidDunes,
  onChangeAvoidDunes,
  routeAnalysis,
  analyzing,
  routeError,
  onRunAnalysis,
  onClearAnalysis,
  onLoadSavedPlan,
  onOpenBrief,
}) => {
  const {
    regionId,
    objectiveId,
    selectedTargetId,
    selectedRouteId,
    compareRouteBId,
    pointAData,
    pointBData,
    customRouteStart,
    customRouteEnd,
    pickingRoutePoint,
    routeStage,
    showAllRoutes,
    sideBySideCompare,
    simpleAdvanced,
    selectTarget,
    selectRoute,
    setCompareRouteBId,
    setPickingRoutePoint,
    enterRoutePlanningMode,
    setCustomRouteStart,
    setCustomRouteEnd,
    swapRoutePoints,
    clearRoutePoints,
    setShowAllRoutes,
    toggleSideBySideCompare,
    setCamera,
    setBottomTrayOpen,
  } = usePlanetStore();

  const { user, savedRoutes, saveRoutePlan, deleteRoutePlan, signInWithGoogle } = useFirebase();

  const [saveName, setSaveName] = useState('');
  const [savingRoute, setSavingRoute] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [whyOpenId, setWhyOpenId] = useState<string | null>(null);

  const activeTarget = targets.find((t) => t.id === selectedTargetId) ?? targets[0] ?? null;
  const originPreset =
    ORIGIN_PRESETS.find((p) => p.id === selectedOriginId) ?? ORIGIN_PRESETS[0];
  const effectiveStart = customRouteStart ?? originPreset.coordinates;
  const effectiveEnd = customRouteEnd ?? activeTarget?.coordinates ?? null;
  const directDistM = effectiveEnd ? marsDistanceM(effectiveStart, effectiveEnd) : null;
  const directBearing = effectiveEnd ? marsBearingDeg(effectiveStart, effectiveEnd) : null;
  const deltaZM =
    pointAData?.elevationM != null && pointBData?.elevationM != null
      ? pointBData.elevationM - pointAData.elevationM
      : null;
  const straightGradePct =
    deltaZM !== null && directDistM && directDistM > 1
      ? (Math.abs(deltaZM) / directDistM) * 100
      : null;

  const isStale = routeStage === 'STALE';

  const activeRoute: RouteCandidate | null =
    routeAnalysis?.candidates.find((c) => c.id === selectedRouteId) ??
    routeAnalysis?.candidates.find((c) => c.feasible) ??
    routeAnalysis?.candidates[0] ??
    null;

  const feasibleCandidates = routeAnalysis
    ? routeAnalysis.candidates.filter((c) => c.feasible)
    : [];

  const comparePrimary =
    feasibleCandidates.find((c) => c.id === activeRoute?.id) ?? feasibleCandidates[0] ?? null;

  const compareSecondary =
    feasibleCandidates.find(
      (c) => c.id === compareRouteBId && c.id !== comparePrimary?.id
    ) ??
    feasibleCandidates.find((c) => c.id !== comparePrimary?.id) ??
    null;

  const shortestFeasibleM = routeAnalysis
    ? Math.min(
        ...routeAnalysis.candidates
          .filter((c) => c.feasible)
          .map((c) => c.distanceM)
      )
    : Infinity;

  const handleClearAll = () => {
    clearRoutePoints();
    onClearAnalysis();
  };

  const handleSaveCurrentPlan = async () => {
    if (!routeAnalysis || !activeRoute || !effectiveEnd) return;
    setSavingRoute(true);
    setSaveStatus(null);
    try {
      const defaultTitle = `Marswalk ${(activeRoute.distanceM / 1000).toFixed(2)} km (${getRouteVisual(activeRoute.preset).shortLabel})`;
      await saveRoutePlan({
        name: saveName.trim() || defaultTitle,
        regionId,
        objectiveId,
        startLon: routeAnalysis.start[0],
        startLat: routeAnalysis.start[1],
        endLon: routeAnalysis.end[0],
        endLat: routeAnalysis.end[1],
        maxSlopeDeg,
        avoidDunes,
        selectedPreset: activeRoute.preset as RoutePresetKey,
        distanceM: activeRoute.distanceM,
        elevationGainM: activeRoute.elevationGainM,
        maxSlopeActualDeg: activeRoute.maxSlopeDeg,
      });
      setSaveName('');
      setSaveStatus('Saved to cloud');
      window.setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      setSaveStatus(err instanceof Error ? err.message : 'Unable to save route');
    } finally {
      setSavingRoute(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Task-Focused Route Workflow Trail */}
      <div className="bg-[#0B0D10] border border-[#242832] px-2.5 py-2 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-telemetry tracking-wider text-[#D4B483]">
          <span>POINT A → POINT B PLANNER</span>
          <span className="text-[#9D968A]">
            {routeStage === 'PICK_A'
              ? 'SELECT START'
              : routeStage === 'PICK_B'
                ? 'SELECT DESTINATION'
                : routeStage === 'DIRECT_READY'
                  ? 'DIRECT PATH'
                  : routeStage === 'ANALYZING'
                    ? 'ANALYZING'
                    : routeStage === 'STALE'
                      ? 'NEEDS REANALYSIS'
                      : routeStage === 'ANALYZED'
                        ? 'CANDIDATES READY'
                        : 'READY'}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1 text-[9px] font-telemetry text-center">
          {[
            { id: 'A', label: 'A', done: Boolean(customRouteStart), cur: pickingRoutePoint === 'AB' || pickingRoutePoint === 'A' },
            { id: 'B', label: 'B', done: Boolean(customRouteEnd), cur: pickingRoutePoint === 'B' },
            { id: 'AN', label: 'ANALYZE', done: Boolean(routeAnalysis && !isStale), cur: routeStage === 'DIRECT_READY' || routeStage === 'STALE' || routeStage === 'ANALYZING' },
            { id: 'CM', label: 'COMPARE', done: Boolean(routeAnalysis && !isStale), cur: Boolean(routeAnalysis && !isStale) },
            { id: 'SL', label: 'SELECT', done: Boolean(selectedRouteId && routeAnalysis && !isStale), cur: false },
          ].map((step) => (
            <div
              key={step.id}
              className={`py-1 border ${
                step.cur
                  ? 'border-[#C44D2B] bg-[#171A20] text-[#F7F3EB]'
                  : step.done
                    ? 'border-[#5E9C76]/60 bg-[#07080A] text-[#5E9C76]'
                    : 'border-[#242832] bg-[#07080A] text-[#736D63]'
              }`}
            >
              {step.label}
            </div>
          ))}
        </div>
      </div>

      {/* Point A -> Point B Selection Controls */}
      <div className="mp-surface-recessed p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#EAE4D9]">
            <Sliders className="w-3.5 h-3.5 text-[#D4B483]" />
            <span>Point A → Point B</span>
          </div>
          {(customRouteStart || customRouteEnd || routeAnalysis) && (
            <div className="flex items-center gap-1">
              {(customRouteStart || customRouteEnd) && effectiveEnd && (
                <button
                  type="button"
                  title="Swap Point A and Point B"
                  onClick={() => {
                    if (!customRouteStart) setCustomRouteStart(effectiveStart);
                    if (!customRouteEnd && effectiveEnd) setCustomRouteEnd(effectiveEnd);
                    swapRoutePoints();
                  }}
                  className="mp-btn-secondary px-2 py-0.5 text-[10px] font-telemetry text-[#D4B483] inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>Swap A ↔ B</span>
                </button>
              )}
              <button
                type="button"
                title="Clear Point A, Point B, candidate routes, and analysis"
                onClick={handleClearAll}
                className="mp-btn-secondary px-2 py-0.5 text-[10px] font-telemetry text-[#9D968A] hover:text-[#EAE4D9] inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>
          )}
        </div>

        {/* Enter Point-to-Point Route Planning Mode */}
        <button
          type="button"
          onClick={() => {
            if (pickingRoutePoint) {
              setPickingRoutePoint(null);
            } else {
              enterRoutePlanningMode(true);
            }
          }}
          className={`min-h-[38px] w-full px-3 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer ${
            pickingRoutePoint ? 'mp-btn-primary' : 'mp-btn-secondary border-[#D4B483] text-[#F7F3EB]'
          }`}
        >
          <GitFork className="w-3.5 h-3.5 text-[#D98A4E]" />
          <span>
            {pickingRoutePoint === 'AB' || pickingRoutePoint === 'A'
              ? 'Select a starting point on Mars… (Cancel)'
              : pickingRoutePoint === 'B'
                ? 'Select a destination on Mars… (Cancel)'
                : customRouteStart && customRouteEnd
                  ? 'Repick Point A → Point B on Mars'
                  : 'PLAN A ROUTE (Click A → B on Mars)'}
          </span>
        </button>

        {/* Point A (Start) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <label htmlFor="route-origin-select" className="text-[#9D968A] flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 bg-[#5E9C76]" />
              <span>Point A · Start</span>
            </label>
            <button
              type="button"
              onClick={() => setPickingRoutePoint(pickingRoutePoint === 'A' ? null : 'A')}
              className="text-[10px] font-telemetry text-[#D4B483] hover:text-[#F7F3EB] underline inline-flex items-center gap-1 cursor-pointer"
            >
              <MapPin className="w-3 h-3" />
              <span>{pickingRoutePoint === 'A' ? 'Cancel' : 'Pick A on map'}</span>
            </button>
          </div>
          <select
            id="route-origin-select"
            value={customRouteStart ? 'CUSTOM_A' : selectedOriginId}
            onChange={(e) => {
              setCustomRouteStart(null);
              onSelectOriginId(e.target.value);
            }}
            className="w-full bg-[#111317] border border-[#242832] px-2.5 py-2 text-xs text-[#EAE4D9]"
          >
            {ORIGIN_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {customRouteStart && (
              <option value="CUSTOM_A">
                Point A ({formatMarsCoord(customRouteStart[0], customRouteStart[1], 4)})
              </option>
            )}
          </select>
        </div>

        {/* Point B (Destination) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <label htmlFor="route-target-select" className="text-[#9D968A] flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 bg-[#C44D2B]" />
              <span>Point B · Destination</span>
            </label>
            <button
              type="button"
              onClick={() => setPickingRoutePoint(pickingRoutePoint === 'B' ? null : 'B')}
              className="text-[10px] font-telemetry text-[#D4B483] hover:text-[#F7F3EB] underline inline-flex items-center gap-1 cursor-pointer"
            >
              <MapPin className="w-3 h-3" />
              <span>{pickingRoutePoint === 'B' ? 'Cancel' : 'Pick B on map'}</span>
            </button>
          </div>
          <select
            id="route-target-select"
            value={customRouteEnd ? 'CUSTOM_B' : (activeTarget?.id ?? '')}
            onChange={(e) => {
              setCustomRouteEnd(null);
              selectTarget(e.target.value);
            }}
            className="w-full bg-[#111317] border border-[#242832] px-2.5 py-2 text-xs text-[#EAE4D9]"
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.rank} {t.name} ({t.score}/100)
              </option>
            ))}
            {customRouteEnd && (
              <option value="CUSTOM_B">
                Point B ({formatMarsCoord(customRouteEnd[0], customRouteEnd[1], 4)})
              </option>
            )}
          </select>
        </div>

        {/* Dual-Point DEM Telemetry Matrix (Point A & Point B) */}
        <div className="grid grid-cols-2 gap-2 text-[10px] font-telemetry tabular-nums">
          <div className="bg-[#0B0D10] border border-[#242832] border-l-2 border-l-[#5E9C76] p-2 space-y-0.5">
            <div className="flex items-center justify-between text-[#5E9C76]">
              <span className="font-medium">POINT A · START</span>
              <span className="text-[#736D63]">1m DEM</span>
            </div>
            <div className="text-[#F7F3EB] text-xs">
              {pointAData?.loading
                ? 'Sampling…'
                : pointAData?.elevationM != null
                  ? `${pointAData.elevationM.toFixed(1)} m`
                  : 'DATA UNAVAILABLE'}
              {pointAData?.localSlopeDeg != null && (
                <span className="text-[#D98A4E] ml-1.5">
                  {pointAData.localSlopeDeg.toFixed(1)}°
                </span>
              )}
            </div>
            <div className="text-[#736D63] text-[9px] truncate">
              {formatMarsCoord(effectiveStart[0], effectiveStart[1], 3)}
            </div>
          </div>

          <div className="bg-[#0B0D10] border border-[#242832] border-l-2 border-l-[#C44D2B] p-2 space-y-0.5">
            <div className="flex items-center justify-between text-[#C44D2B]">
              <span className="font-medium">POINT B · TARGET</span>
              <span className="text-[#736D63]">1m DEM</span>
            </div>
            <div className="text-[#F7F3EB] text-xs">
              {!effectiveEnd
                ? 'Select B'
                : pointBData?.loading
                  ? 'Sampling…'
                  : pointBData?.elevationM != null
                    ? `${pointBData.elevationM.toFixed(1)} m`
                    : 'DATA UNAVAILABLE'}
              {pointBData?.localSlopeDeg != null && (
                <span className="text-[#D98A4E] ml-1.5">
                  {pointBData.localSlopeDeg.toFixed(1)}°
                </span>
              )}
            </div>
            <div className="text-[#736D63] text-[9px] truncate">
              {effectiveEnd ? formatMarsCoord(effectiveEnd[0], effectiveEnd[1], 3) : 'No destination'}
            </div>
          </div>
        </div>

        {/* DIRECT PATH Summary Card (Explicitly separated from analyzed routes) */}
        {directDistM !== null && directBearing !== null && (
          <div className="bg-[#0B0D10] border border-[#D4B483]/60 p-2.5 space-y-1.5 text-[11px] font-telemetry tabular-nums">
            <div className="flex items-center justify-between">
              <span className="text-[#D4B483] tracking-wider">DIRECT PATH (A → B)</span>
              <span className="text-[#9D968A] text-[10px]">
                {isStale
                  ? 'NEEDS REANALYSIS'
                  : routeAnalysis
                    ? 'REFERENCE CHORD'
                    : 'DIRECT CONNECTION'}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[#F7F3EB]">
              <span>
                {(directDistM / 1000).toFixed(2)} km · {directBearing.toFixed(0)}°
              </span>
              <span className="text-[#D4B483]">
                {deltaZM !== null
                  ? `ΔZ ${deltaZM >= 0 ? '+' : ''}${deltaZM.toFixed(1)} m${
                      straightGradePct !== null ? ` (${straightGradePct.toFixed(1)}%)` : ''
                    }`
                  : '1m DEM'}
              </span>
            </div>
            <p className="font-sans text-[11px] text-[#9D968A] leading-snug">
              The straight line is the relationship between the points. The calculated routes are possible traverses between those points.
            </p>
          </div>
        )}

        {/* Stale Route Warning */}
        {isStale && (
          <div className="bg-[#171A20] border border-[#D98A4E] p-2.5 flex items-center justify-between gap-2 mp-settle-in">
            <div className="text-[11px] text-[#EAE4D9]">
              <div className="font-telemetry text-[10px] text-[#D98A4E]">
                ROUTE NEEDS REANALYSIS
              </div>
              <div className="text-[#9D968A] mt-0.5">
                Point A or Point B changed. Outdated paths are subdued.
              </div>
            </div>
            <button
              type="button"
              onClick={onRunAnalysis}
              disabled={analyzing || !effectiveEnd}
              className="mp-btn-primary px-3 py-1.5 text-[11px] font-telemetry shrink-0 cursor-pointer"
            >
              REANALYZE
            </button>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#9D968A]">Assumed max slope</span>
            <span className="font-telemetry text-[#D98A4E] tabular-nums">{maxSlopeDeg}°</span>
          </div>
          <input
            type="range"
            aria-label="Assumed maximum traversable slope in degrees"
            min={10}
            max={26}
            step={1}
            value={maxSlopeDeg}
            onChange={(e) => onChangeMaxSlopeDeg(Number(e.target.value))}
            className="mp-range w-full"
          />
          <p className="text-[11px] text-[#736D63] leading-snug">
            Decision-support constraint only — does not certify passability or EVA suit safety.
          </p>
        </div>

        <label className="flex items-center gap-2.5 text-xs text-[#9D968A] cursor-pointer">
          <input
            type="checkbox"
            checked={avoidDunes}
            onChange={(e) => onChangeAvoidDunes(e.target.checked)}
            className="mp-checkbox"
          />
          <span>Avoid mapped Bagnold dark sand dunes</span>
        </label>

        <button
          type="button"
          data-tour="analyze-terrain-btn"
          onClick={onRunAnalysis}
          disabled={analyzing || !effectiveEnd}
          className="mp-btn-primary min-h-[42px] w-full px-4 py-2 disabled:opacity-50 text-xs font-medium tracking-wide flex items-center justify-center gap-2 cursor-pointer"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>
            {analyzing
              ? 'ANALYZING TERRAIN…'
              : isStale
                ? 'REANALYZE TERRAIN'
                : 'ANALYZE TERRAIN'}
          </span>
        </button>

        {analyzing && (
          <ScienceLoadingState
            title="ANALYZING TERRAIN CORRIDOR"
            subtitle="Zooming to A → B corridor, sampling Gale_DEM_SMG_1m, and ranking candidate traverses."
          />
        )}

        {routeError && (
          <CalmErrorState
            title="Route evaluation failed"
            message="Could not compute candidate paths for the selected coordinates."
            technicalDetails={routeError}
            onRetry={onRunAnalysis}
          />
        )}
      </div>

      {/* Candidate Routes & Hierarchy */}
      {routeAnalysis && (
        <div data-tour="route-candidates" className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-medium text-[#EAE4D9]">
                Candidate Routes ({routeAnalysis.candidates.length})
              </span>
              {isStale && (
                <span className="ml-2 text-[10px] font-telemetry text-[#D98A4E]">
                  STALE · REANALYZE
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                aria-pressed={sideBySideCompare}
                onClick={() => {
                  const next = !sideBySideCompare;
                  if (next && !compareRouteBId && compareSecondary) {
                    setCompareRouteBId(compareSecondary.id);
                  }
                  toggleSideBySideCompare(next);
                }}
                title="Toggle side-by-side comparison of two candidate routes on the map (Hotkey: C)"
                className={`px-2 py-1 text-[10px] font-telemetry inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  sideBySideCompare
                    ? 'mp-btn-primary text-[#F7F3EB]'
                    : 'mp-btn-secondary text-[#D4B483]'
                }`}
              >
                <Columns2 className="w-3 h-3" />
                <span>Side-by-Side</span>
              </button>
              <div className="mp-segmented">
                <button
                  type="button"
                  onClick={() => setShowAllRoutes(false)}
                  className={`mp-segmented-btn px-1.5 py-0.5 text-[10px] font-telemetry cursor-pointer ${
                    !showAllRoutes ? 'bg-[#171A20] text-[#F7F3EB]' : 'text-[#9D968A]'
                  }`}
                >
                  2 Lines
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllRoutes(true)}
                  className={`mp-segmented-btn px-1.5 py-0.5 text-[10px] font-telemetry cursor-pointer ${
                    showAllRoutes ? 'bg-[#171A20] text-[#F7F3EB]' : 'text-[#9D968A]'
                  }`}
                >
                  All 5
                </button>
              </div>
              <button
                type="button"
                onClick={() => setBottomTrayOpen(true, 'COMPARE')}
                className="text-[#D4B483] hover:text-[#F7F3EB] underline cursor-pointer"
              >
                Table
              </button>
            </div>
          </div>

          {/* Direct Side-by-Side Comparison Deck */}
          {sideBySideCompare && (
            <div
              aria-label="Side-by-side candidate route comparison"
              className={`mp-surface-raised mp-reticle-frame p-3 space-y-2.5 mp-settle-in ${
                isStale ? 'opacity-70' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[10px] font-telemetry">
                <span className="text-[#D4B483] tracking-wider">
                  SIDE-BY-SIDE COMPARISON · 2 ROUTES ON MAP
                </span>
                <div className="flex items-center gap-2">
                  {comparePrimary && compareSecondary && (
                    <button
                      type="button"
                      onClick={() => {
                        const a = comparePrimary.id;
                        const b = compareSecondary.id;
                        selectRoute(b);
                        setCompareRouteBId(a);
                      }}
                      title="Swap Route A and Route B"
                      className="text-[#9D968A] hover:text-[#F7F3EB] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>Swap</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBottomTrayOpen(true, 'PROFILE')}
                    title="Overlay both elevation curves"
                    className="text-[#5B8BB4] hover:text-[#F7F3EB] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Activity className="w-3 h-3" />
                    <span>Profiles</span>
                  </button>
                </div>
              </div>

              {!comparePrimary || !compareSecondary ? (
                <p className="text-[11px] text-[#9D968A]">
                  At least 2 feasible candidate routes are needed for side-by-side comparison. Increase the assumed slope limit above to unlock another path.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#0B0D10] border border-[#F7F3EB]/40 p-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-telemetry text-[#F7F3EB]">
                        <span
                          className="inline-block w-4 h-[3px] shrink-0"
                          style={{
                            backgroundColor: getRouteVisual(comparePrimary.preset).color,
                          }}
                        />
                        <span>ROUTE A · SOLID</span>
                      </div>
                      <select
                        aria-label="Comparison Route A"
                        value={comparePrimary.id}
                        onChange={(e) => {
                          const nextA = e.target.value;
                          if (nextA === compareSecondary.id) {
                            setCompareRouteBId(comparePrimary.id);
                          }
                          selectRoute(nextA);
                        }}
                        className="w-full bg-[#111317] border border-[#242832] px-1.5 py-1 text-[11px] text-[#F7F3EB] outline-none cursor-pointer"
                      >
                        {feasibleCandidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {getRouteVisual(c.preset).shortLabel} ({(c.distanceM / 1000).toFixed(2)} km)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-[#0B0D10] border border-[#D4B483]/50 p-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-telemetry text-[#D4B483]">
                        <span
                          className="inline-block w-4 h-0 border-t-[3px] border-dashed shrink-0"
                          style={{
                            borderColor: getRouteVisual(compareSecondary.preset).color,
                          }}
                        />
                        <span>ROUTE B · DASHED</span>
                      </div>
                      <select
                        aria-label="Comparison Route B"
                        value={compareSecondary.id}
                        onChange={(e) => setCompareRouteBId(e.target.value)}
                        className="w-full bg-[#111317] border border-[#242832] px-1.5 py-1 text-[11px] text-[#EAE4D9] outline-none cursor-pointer"
                      >
                        {feasibleCandidates
                          .filter((c) => c.id !== comparePrimary.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {getRouteVisual(c.preset).shortLabel} ({(c.distanceM / 1000).toFixed(2)} km)
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* Side-by-Side Metric Table */}
                  <div className="bg-[#0B0D10] border border-[#242832] divide-y divide-[#242832] text-[11px] font-telemetry tabular-nums">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2.5 py-1.5 items-center">
                      <span className="text-[#9D968A]">Distance</span>
                      <span className="text-[#F7F3EB]">
                        {(comparePrimary.distanceM / 1000).toFixed(2)} km
                      </span>
                      <span className="text-[#D4B483]">
                        {(compareSecondary.distanceM / 1000).toFixed(2)} km
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2.5 py-1.5 items-center">
                      <span className="text-[#9D968A]">Max slope</span>
                      <span className="text-[#D98A4E]">
                        {comparePrimary.maxSlopeDeg.toFixed(1)}°
                      </span>
                      <span className="text-[#D98A4E]">
                        {compareSecondary.maxSlopeDeg.toFixed(1)}°
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2.5 py-1.5 items-center">
                      <span className="text-[#9D968A]">Elev gain</span>
                      <span className="text-[#F7F3EB]">
                        +{comparePrimary.elevationGainM.toFixed(0)} m
                      </span>
                      <span className="text-[#D4B483]">
                        +{compareSecondary.elevationGainM.toFixed(0)} m
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2.5 py-1.5 items-center">
                      <span className="text-[#9D968A]">Terrain cost</span>
                      <span className="text-[#F7F3EB]">
                        {comparePrimary.cumulativeCost.toFixed(1)}
                      </span>
                      <span className="text-[#D4B483]">
                        {compareSecondary.cumulativeCost.toFixed(1)}
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2.5 py-1.5 items-center">
                      <span className="text-[#9D968A]">Est. traverse</span>
                      <span className="text-[#F7F3EB]">
                        {comparePrimary.estimatedTimeMin !== null
                          ? `${comparePrimary.estimatedTimeMin.toFixed(0)} min`
                          : '—'}
                      </span>
                      <span className="text-[#D4B483]">
                        {compareSecondary.estimatedTimeMin !== null
                          ? `${compareSecondary.estimatedTimeMin.toFixed(0)} min`
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Delta Readout */}
                  {(() => {
                    const dDist = comparePrimary.distanceM - compareSecondary.distanceM;
                    const dSlope = comparePrimary.maxSlopeDeg - compareSecondary.maxSlopeDeg;
                    const dCost = comparePrimary.cumulativeCost - compareSecondary.cumulativeCost;
                    return (
                      <div className="text-[11px] text-[#CEC8BC] leading-snug">
                        <span className="text-[#D4B483] font-medium">A vs B delta: </span>
                        {Math.abs(dDist) < 5
                          ? 'Nearly identical length'
                          : dDist < 0
                            ? `Route A is ${Math.abs(dDist).toFixed(0)} m shorter`
                            : `Route B is ${Math.abs(dDist).toFixed(0)} m shorter`}
                        {' · '}
                        {Math.abs(dSlope) < 0.2
                          ? 'similar peak slope'
                          : dSlope < 0
                            ? `Route A has ${Math.abs(dSlope).toFixed(1)}° lower max slope`
                            : `Route B has ${Math.abs(dSlope).toFixed(1)}° lower max slope`}
                        {Math.abs(dCost) >= 0.5
                          ? ` · ${dCost < 0 ? 'Route A' : 'Route B'} has lower terrain cost.`
                          : '.'}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          <div className={`space-y-2 ${isStale ? 'opacity-65' : ''}`}>
            {routeAnalysis.candidates.map((cand, idx) => {
              const isSel = cand.id === activeRoute?.id;
              const isLine2 = cand.id === compareRouteBId && !isSel;
              const visual = getRouteVisual(cand.preset);
              const straightM = marsDistanceM(routeAnalysis.start, routeAnalysis.end);
              const detourM = cand.distanceM - straightM;
              const vsMinM =
                Number.isFinite(shortestFeasibleM) ? cand.distanceM - shortestFeasibleM : 0;
              const routeCode = `ROUTE 0${idx + 1}`;
              const isWhyOpen = whyOpenId === cand.id;

              return (
                <div
                  key={cand.id}
                  className={`p-3 transition-colors ${
                    isSel
                      ? 'mp-surface-raised mp-reticle-frame border-[#F7F3EB]'
                      : isLine2
                        ? 'mp-surface-recessed border-[#D4B483]'
                        : 'mp-surface-recessed hover:border-[#373D4B]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      selectRoute(cand.id);
                      setBottomTrayOpen(true, 'PROFILE');
                      if (cand.geometry && cand.geometry.coordinates.length > 0) {
                        const mid =
                          cand.geometry.coordinates[
                            Math.floor(cand.geometry.coordinates.length / 2)
                          ];
                        setCamera({ lon: mid[0], lat: mid[1], zoom: 13.8 });
                      }
                    }}
                    className="w-full text-left cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-telemetry">
                      <span className="inline-flex items-center gap-1.5 text-[#D4B483]">
                        <span
                          className="inline-block w-2.5 h-2.5 shrink-0 border border-[#07080A]"
                          style={{ backgroundColor: visual.color }}
                        />
                        <span>{routeCode}</span>
                        <span>·</span>
                        <span>{visual.categoryLabel}</span>
                      </span>
                      <span className={cand.feasible ? 'text-[#5E9C76]' : 'text-[#C44D2B]'}>
                        {cand.feasible ? 'Feasible' : 'Blocked'}
                      </span>
                    </div>

                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <div className="text-sm font-medium text-[#F7F3EB]">
                        {cand.feasible ? `${(cand.distanceM / 1000).toFixed(2)} km` : cand.label}
                      </div>
                      {isSel && (
                        <span className="text-[9px] font-telemetry text-[#F7F3EB] border border-[#F7F3EB] px-1">
                          SELECTED
                        </span>
                      )}
                      {isLine2 && (
                        <span className="text-[9px] font-telemetry text-[#D4B483] border border-[#D4B483] px-1">
                          COMPARE
                        </span>
                      )}
                    </div>

                    {cand.feasible ? (
                      <div className="mt-1.5 space-y-0.5">
                        <div className="text-[10px] font-telemetry tracking-wider text-[#D4B483]">
                          WHY THIS ROUTE?
                        </div>
                        <p className="text-xs text-[#CEC8BC] leading-snug">
                          {visual.description} {cand.tradeoffSummary}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-[#D98A4E]">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{cand.blockedReason}</span>
                      </div>
                    )}
                  </button>

                  {cand.feasible && (
                    <div className="mt-2 pt-2 border-t border-[#242832] flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setWhyOpenId(isWhyOpen ? null : cand.id)}
                        className="mp-btn-secondary px-2 py-1 text-[10px] font-telemetry text-[#D4B483] cursor-pointer"
                      >
                        [WHY?]
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isSel) {
                            setCompareRouteBId(cand.id);
                            toggleSideBySideCompare(true);
                          } else {
                            toggleSideBySideCompare(!sideBySideCompare);
                          }
                        }}
                        className={`px-2 py-1 text-[10px] font-telemetry inline-flex items-center gap-1 cursor-pointer ${
                          (isLine2 && sideBySideCompare) || (isSel && sideBySideCompare)
                            ? 'mp-btn-primary text-[#F7F3EB]'
                            : 'mp-btn-secondary text-[#EAE4D9]'
                        }`}
                      >
                        <GitCompare className="w-3 h-3 text-[#5B8BB4]" />
                        <span>{isLine2 && sideBySideCompare ? '[COMPARING]' : '[COMPARE]'}</span>
                      </button>
                      {!isSel && (
                        <button
                          type="button"
                          onClick={() => selectRoute(cand.id)}
                          className="ml-auto text-[10px] font-telemetry text-[#F7F3EB] underline cursor-pointer"
                        >
                          Select route
                        </button>
                      )}
                    </div>
                  )}

                  {isWhyOpen && cand.feasible && (
                    <div className="mt-2 mp-settle-in">
                      <WhyDrawer
                        question="WHY THIS ROUTE?"
                        summary={cand.whyRoute.join(' ')}
                        sourceLabel={`DEM: ${routeAnalysis.terrain.demSourceId}`}
                        defaultOpen
                      />
                    </div>
                  )}

                  {isSel && cand.feasible && (
                    <div className="mt-3 pt-3 border-t border-[#242832] space-y-2.5 text-xs mp-settle-in">
                      <MetadataAccordion
                        label="MORE DETAILS (Elevation, slope, cost & assumptions)"
                        defaultOpen={simpleAdvanced === 'ADVANCED'}
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <MetricDisplay
                            label="Distance"
                            value={(cand.distanceM / 1000).toFixed(2)}
                            unit="km"
                          />
                          <MetricDisplay
                            label="Max slope"
                            value={cand.maxSlopeDeg.toFixed(1)}
                            unit="°"
                            accent="ochre"
                          />
                          <MetricDisplay
                            label="Elev gain / loss"
                            value={`+${cand.elevationGainM.toFixed(0)} / -${cand.elevationLossM.toFixed(0)}`}
                            unit="m"
                            accent="sand"
                          />
                          <MetricDisplay
                            label="Terrain cost"
                            value={cand.cumulativeCost.toFixed(1)}
                          />
                        </div>
                        <div className="text-[10px] font-telemetry text-[#9D968A] space-y-0.5 pt-1">
                          <div>
                            Direct chord delta: +{Math.max(0, detourM).toFixed(0)} m
                            {vsMinM > 1 ? ` · +${vsMinM.toFixed(0)} m vs shortest` : ''}
                          </div>
                          <div>
                            Est. traverse:{' '}
                            {cand.estimatedTimeMin !== null
                              ? `${cand.estimatedTimeMin.toFixed(0)} min`
                              : 'N/A'}{' '}
                            · Slope cap ≤{cand.weights.maxSlopeDeg}°
                          </div>
                        </div>
                        <ul className="space-y-1 text-[11px] text-[#9D968A]">
                          {cand.whyRoute.map((line, i) => (
                            <li key={i}>• {line}</li>
                          ))}
                        </ul>
                        <div className="text-[10px] text-[#736D63]">
                          Assumptions &amp; limitations: {cand.speedModelAssumption}
                        </div>
                      </MetadataAccordion>

                      <button
                        type="button"
                        data-tour="open-brief-btn"
                        onClick={onOpenBrief}
                        className="mp-btn-secondary min-h-[38px] w-full px-3 py-2 border-[#D4B483] text-xs font-medium text-[#F7F3EB] flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#D4B483]" />
                        <span>Open Field Plan Brief</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <MetadataAccordion
            label="DEM grid & slope sensitivity sweep"
            defaultOpen={simpleAdvanced === 'ADVANCED'}
          >
            <div className="grid grid-cols-2 gap-2 text-[11px] font-telemetry">
              <div className="mp-surface-recessed p-2">
                <div className="text-[10px] text-[#736D63]">Elevation span</div>
                <div className="text-[#F7F3EB]">
                  {routeAnalysis.terrain.minElevM.toFixed(1)} to{' '}
                  {routeAnalysis.terrain.maxElevM.toFixed(1)} m
                </div>
              </div>
              <div className="mp-surface-recessed p-2">
                <div className="text-[10px] text-[#736D63]">Max / mean slope</div>
                <div className="text-[#D98A4E]">
                  {routeAnalysis.terrain.maxSlopeDeg.toFixed(1)}° /{' '}
                  {routeAnalysis.terrain.meanSlopeDeg.toFixed(1)}°
                </div>
              </div>
              <div className="mp-surface-recessed p-2">
                <div className="text-[10px] text-[#736D63]">Hazard cells</div>
                <div className="text-[#EAE4D9]">
                  {routeAnalysis.terrain.hazardCellsCount} (Dunes:{' '}
                  {routeAnalysis.terrain.duneHazardCellsCount})
                </div>
              </div>
              <div className="mp-surface-recessed p-2">
                <div className="text-[10px] text-[#736D63]">DEM source</div>
                <div className="text-[#EAE4D9] truncate">
                  {routeAnalysis.terrain.demSourceId}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto mp-surface-recessed p-2 mt-2">
              <table className="w-full text-left text-[11px] font-telemetry">
                <thead className="border-b border-[#242832] text-[#736D63]">
                  <tr>
                    <th className="py-1 pr-2">Slope cap</th>
                    <th className="py-1 pr-2">Status</th>
                    <th className="py-1 pr-2">Distance</th>
                    <th className="py-1">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#242832]">
                  {routeAnalysis.sensitivity.map((s) => (
                    <tr key={s.maxSlopeDeg} className="text-[#9D968A]">
                      <td className="py-1 pr-2">≤{s.maxSlopeDeg}°</td>
                      <td
                        className={`py-1 pr-2 ${s.feasible ? 'text-[#5E9C76]' : 'text-[#C44D2B]'}`}
                      >
                        {s.feasible ? 'Feasible' : 'Blocked'}
                      </td>
                      <td className="py-1 pr-2">
                        {s.distanceM !== null ? `${(s.distanceM / 1000).toFixed(2)} km` : '—'}
                      </td>
                      <td className="py-1">
                        {s.cumulativeCost !== null ? s.cumulativeCost.toFixed(1) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MetadataAccordion>
        </div>
      )}

      {/* Firebase Cloud Route Plans */}
      <div className="mp-surface-recessed p-3 space-y-2.5">
        <div className="flex items-center justify-between text-[10px] font-telemetry tracking-wider text-[#D4B483]">
          <span className="inline-flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5 text-[#5E9C76]" />
            <span>SAVED MARSWALK PLANS</span>
          </span>
          {user && <span className="text-[#9D968A]">{savedRoutes.length}</span>}
        </div>

        {!user ? (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="mp-btn-secondary w-full min-h-[34px] px-3 text-[11px] font-telemetry text-[#D4B483] cursor-pointer"
          >
            Sign in with Google to save &amp; reload Marswalk routes
          </button>
        ) : (
          <>
            {routeAnalysis && activeRoute && activeRoute.feasible && !isStale && (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  maxLength={120}
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Name this Marswalk plan…"
                  className="flex-1 min-w-0 bg-[#07080A] border border-[#242832] px-2.5 py-1.5 text-xs text-[#EAE4D9] outline-none focus:border-[#D4B483]"
                />
                <button
                  type="button"
                  disabled={savingRoute}
                  onClick={() => void handleSaveCurrentPlan()}
                  className="mp-btn-secondary px-2.5 py-1.5 text-[11px] font-telemetry inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Bookmark className="w-3 h-3 text-[#D4B483]" />
                  <span>{savingRoute ? '…' : 'Save'}</span>
                </button>
              </div>
            )}

            {saveStatus && (
              <div className="text-[10px] font-telemetry text-[#5E9C76]">{saveStatus}</div>
            )}

            {savedRoutes.length === 0 ? (
              <p className="text-[11px] text-[#736D63]">
                Analyze any A → B corridor and click Save to store it in your private workspace.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto mp-scroll">
                {savedRoutes.map((plan) => (
                  <div
                    key={plan.id}
                    className="bg-[#0B0D10] border border-[#242832] p-2 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onLoadSavedPlan?.({
                          start: [plan.startLon, plan.startLat],
                          end: [plan.endLon, plan.endLat],
                          maxSlopeDeg: plan.maxSlopeDeg,
                          avoidDunes: plan.avoidDunes,
                        })
                      }
                      className="text-left flex-1 min-w-0 cursor-pointer hover:text-[#F7F3EB]"
                    >
                      <div className="font-medium text-[#EAE4D9] truncate">{plan.name}</div>
                      <div className="font-telemetry text-[10px] text-[#9D968A] tabular-nums">
                        {(plan.distanceM / 1000).toFixed(2)} km · +{plan.elevationGainM.toFixed(0)}m ·{' '}
                        {plan.maxSlopeActualDeg.toFixed(1)}° max
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${plan.name}`}
                      onClick={() => void deleteRoutePlan(plan.id)}
                      className="text-[#736D63] hover:text-[#C44D2B] p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
