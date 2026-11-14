import React, { useState } from 'react';
import type {
  EnvironmentContextResponse,
  ObjectiveRule,
  RouteAnalysisResponse,
  ScienceTarget,
} from '../../../shared/types';
import { usePlanetStore, type BottomTrayTab, type InspectorContext } from '../../store/planetStore';
import { formatMarsCoord, marsBearingDeg, marsDistanceM } from '../../../shared/geo';
import { getRouteVisual } from '../../geo/routeStyles';
import { ElevationProfileTray } from '../routes/ElevationProfileTray';
import { EnvironmentPanel } from '../environment/EnvironmentPanel';
import { CalmEmptyState, MetricDisplay } from '../ui/InstrumentPrimitives';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Crosshair,
  GitCompare,
  HelpCircle,
  X,
} from 'lucide-react';

interface BottomTelemetryDeckProps {
  activeObjective: ObjectiveRule | null;
  targets: ScienceTarget[];
  routeAnalysis: RouteAnalysisResponse | null;
  environment: EnvironmentContextResponse | null;
  envLoading: boolean;
  onStartTour: () => void;
}

const DECK_TABS: Array<{ id: BottomTrayTab; label: string; icon: React.ReactNode }> = [
  { id: 'PROFILE', label: 'Elevation', icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'COMPARE', label: 'Compare', icon: <GitCompare className="w-3.5 h-3.5" /> },
  { id: 'ENV', label: 'Environment', icon: <CloudSun className="w-3.5 h-3.5" /> },
  { id: 'PROBE', label: 'Probe', icon: <Crosshair className="w-3.5 h-3.5" /> },
];

export const BottomTelemetryDeck: React.FC<BottomTelemetryDeckProps> = ({
  activeObjective,
  targets,
  routeAnalysis,
  environment,
  envLoading,
  onStartTour,
}) => {
  const {
    bottomTrayOpen,
    bottomTrayTab,
    inspectorContext,
    activeLayers,
    selectedTargetId,
    selectedRouteId,
    lat,
    lon,
    zoom,
    hoverCoord,
    pointProbe,
    routeStage,
    setBottomTrayOpen,
    setPointProbe,
    selectRoute,
    setInspectorContext,
    setRightRailOpen,
    setLimitationsOpen,
  } = usePlanetStore();

  const [whyOpen, setWhyOpen] = useState(false);

  const target = targets.find((t) => t.id === selectedTargetId) ?? targets[0] ?? null;
  const route =
    routeAnalysis?.candidates.find((c) => c.id === selectedRouteId) ??
    routeAnalysis?.candidates.find((c) => c.feasible) ??
    null;

  let whatSeeing = `Gale Crater · ${activeLayers.length} layers active`;
  let whyMatters =
    activeObjective?.scientificGoal ??
    'Fusing orbital imagery, minerals, geology, and slope highlights where to investigate next.';
  let nextLabel = 'Follow evidence';
  let nextContext: InspectorContext = 'TARGET';

  if (routeStage === 'STALE') {
    whatSeeing = 'Points moved · Route needs reanalysis';
    whyMatters = 'Point A or Point B changed since the last terrain solve. Reanalyze to update candidates.';
    nextLabel = 'Reanalyze route';
    nextContext = 'ROUTE';
  } else if (routeStage === 'DIRECT_READY') {
    whatSeeing = 'Direct path A → B · Ready to analyze terrain';
    whyMatters = 'The straight chord shows spatial relationship. Run terrain analysis to generate candidate traverses.';
    nextLabel = 'Analyze terrain';
    nextContext = 'ROUTE';
  } else if (inspectorContext === 'TARGET' && target) {
    whatSeeing = `Target #${target.rank}: ${target.name} (${target.score}/100)`;
    whyMatters = target.whyHere[0] ?? whyMatters;
    nextLabel = 'Plan Marswalk';
    nextContext = 'ROUTE';
  } else if (inspectorContext === 'ROUTE' && route) {
    whatSeeing = route.feasible
      ? `${route.label}: ${(route.distanceM / 1000).toFixed(2)} km · ${route.maxSlopeDeg.toFixed(1)}° max`
      : `${route.label}: Blocked`;
    whyMatters = route.tradeoffSummary;
    nextLabel = 'Rover POV';
    nextContext = 'OBSERVATION';
  } else if (inspectorContext === 'OBSERVATION') {
    whatSeeing = 'Curiosity traverse & surface imagery';
    whyMatters = 'Surface photos ground-truth orbital mineral and slope interpretations.';
    nextLabel = 'View targets';
    nextContext = 'TARGET';
  } else if (inspectorContext === 'ENV') {
    whatSeeing = 'REMS weather & RAD radiation archive';
    whyMatters = 'Establishes measured environmental extremes in Gale Crater.';
    nextLabel = 'Return to route';
    nextContext = 'ROUTE';
  }

  const displayCoord = hoverCoord ?? [lon, lat];

  return (
    <div data-tour="telemetry-deck" className="pointer-events-auto relative mp-instrument-panel">
      {/* Contextual "Why It Matters" Inline Drawer */}
      {whyOpen && (
        <div className="absolute bottom-full left-0 mb-1.5 max-w-md mp-instrument-panel mp-reticle-frame p-3 text-xs space-y-2 mp-settle-in">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-telemetry tracking-wider text-[#D4B483]">
              WHAT YOU ARE SEEING
            </span>
            <button
              type="button"
              onClick={() => setWhyOpen(false)}
              className="text-[#736D63] hover:text-[#EAE4D9] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[#EAE4D9] leading-relaxed">{whyMatters}</p>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#242832]">
            <button
              type="button"
              onClick={() => {
                setWhyOpen(false);
                onStartTour();
              }}
              className="text-[#D4B483] hover:text-[#F7F3EB] underline cursor-pointer"
            >
              Guided walkthrough
            </button>
            <button
              type="button"
              onClick={() => {
                setWhyOpen(false);
                setLimitationsOpen(true);
              }}
              className="text-[#D98A4E] hover:text-[#F7F3EB] underline cursor-pointer"
            >
              Data limitations
            </button>
          </div>
        </div>
      )}

      {/* Unified Compact Telemetry Bar */}
      <div className="px-2.5 py-1.5 flex items-center justify-between gap-3">
        {/* Left: Live Context Summary + Quick Action */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setWhyOpen(!whyOpen)}
            aria-expanded={whyOpen}
            className="flex items-center gap-1.5 text-xs text-[#EAE4D9] hover:text-[#F7F3EB] cursor-pointer min-w-0"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#D4B483] shrink-0" />
            <span className="truncate max-w-[180px] xl:max-w-[230px] font-medium">
              {whatSeeing}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setInspectorContext(nextContext);
              setRightRailOpen(true);
            }}
            className="hidden xl:inline-block text-[11px] font-telemetry text-[#D4B483] hover:text-[#F7F3EB] whitespace-nowrap shrink-0 cursor-pointer"
          >
            {nextLabel} →
          </button>
        </div>

        {/* Center: Segmented Analysis Deck Switcher */}
        <div className="mp-segmented shrink-0">
          {DECK_TABS.map((t) => {
            const active = bottomTrayOpen && bottomTrayTab === t.id;
            const hasProbeDot = t.id === 'PROBE' && pointProbe !== null;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (active) {
                    setBottomTrayOpen(false);
                  } else {
                    setBottomTrayOpen(true, t.id);
                  }
                }}
                className={`mp-segmented-btn min-h-[26px] px-2.5 text-[11px] gap-1.5 cursor-pointer ${
                  active
                    ? 'bg-[#171A20] text-[#F7F3EB]'
                    : 'text-[#9D968A] hover:text-[#EAE4D9]'
                }`}
              >
                <span className={hasProbeDot ? 'text-[#D98A4E]' : 'text-[#D4B483]'}>
                  {t.icon}
                </span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Calibrated Coordinate Readout & Deck Collapse */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden xl:flex items-center gap-2 text-[10px] font-telemetry text-[#9D968A] tabular-nums">
            <span className="text-[#736D63]">EPSG:104905</span>
            <span className="text-[#EAE4D9]">
              {formatMarsCoord(displayCoord[0], displayCoord[1], 3)}
            </span>
            <span className="text-[#D4B483]">z{zoom.toFixed(1)}</span>
          </div>

          <button
            type="button"
            onClick={() => setBottomTrayOpen(!bottomTrayOpen)}
            aria-expanded={bottomTrayOpen}
            aria-label={bottomTrayOpen ? 'Collapse telemetry deck' : 'Expand telemetry deck'}
            className="min-w-[28px] min-h-[28px] flex items-center justify-center text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
          >
            {bottomTrayOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable Analytical Deck Body */}
      {bottomTrayOpen && (
        <div className="border-t border-[#242832] p-3 max-h-60 overflow-y-auto mp-scroll mp-settle-in">
          {bottomTrayTab === 'PROFILE' && (
            <ElevationProfileTray routeAnalysis={routeAnalysis} />
          )}

          {bottomTrayTab === 'COMPARE' && (
            <div>
              {!routeAnalysis ? (
                <CalmEmptyState
                  title="No candidate routes to compare"
                  suggestion="Pick Point A & Point B on Mars or evaluate candidate Marswalk paths to compare distance, gain, slope, and deltas side by side."
                  actionLabel="Plan a route"
                  onAction={() => {
                    setInspectorContext('ROUTE');
                    setRightRailOpen(true);
                  }}
                />
              ) : (
                (() => {
                  const directDistM = marsDistanceM(routeAnalysis.start, routeAnalysis.end);
                  const directBearing = marsBearingDeg(routeAnalysis.start, routeAnalysis.end);
                  const feasibleList = routeAnalysis.candidates.filter((r) => r.feasible);
                  const shortestM = feasibleList.length
                    ? Math.min(...feasibleList.map((r) => r.distanceM))
                    : directDistM;
                  return (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-telemetry bg-[#0B0D10] border border-[#242832] px-2.5 py-1.5">
                        <span className="text-[#D4B483]">
                          A→B Direct Sightline: {(directDistM / 1000).toFixed(3)} km ({directDistM.toFixed(0)} m) · Azimuth {directBearing.toFixed(1)}°
                        </span>
                        <span className="text-[#9D968A] tabular-nums">
                          {feasibleList.length}/{routeAnalysis.candidates.length} roads feasible
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-[#242832] text-[11px] text-[#9D968A]">
                            <tr>
                              <th className="py-1.5 pr-3">Route / Road</th>
                              <th className="py-1.5 pr-3">Status</th>
                              <th className="py-1.5 pr-3">Distance</th>
                              <th className="py-1.5 pr-3">Δ vs Direct</th>
                              <th className="py-1.5 pr-3">Gain / Loss</th>
                              <th className="py-1.5 pr-3">Max slope</th>
                              <th className="py-1.5 pr-3">Est. time</th>
                              <th className="py-1.5">How this road differs</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#242832]">
                            {routeAnalysis.candidates.map((c) => {
                              const isSel = c.id === selectedRouteId;
                              const vis = getRouteVisual(c.preset);
                              const detourM = c.distanceM - directDistM;
                              const detourPct = directDistM > 0 ? (detourM / directDistM) * 100 : 0;
                              const vsShortestM = c.distanceM - shortestM;
                              return (
                                <tr
                                  key={c.id}
                                  onClick={() => c.feasible && selectRoute(c.id)}
                                  className={`${c.feasible ? 'cursor-pointer hover:bg-[#171A20]' : ''} ${
                                    isSel ? 'bg-[#171A20] text-[#F7F3EB]' : 'text-[#CEC8BC]'
                                  }`}
                                >
                                  <td className="py-2 pr-3 font-medium whitespace-nowrap">
                                    <span className="inline-flex items-center gap-2">
                                      <span
                                        className="inline-block w-2.5 h-2.5 shrink-0 border border-[#07080A]"
                                        style={{ backgroundColor: vis.color }}
                                      />
                                      <span>{c.label}</span>
                                    </span>
                                  </td>
                                  <td
                                    className={`py-2 pr-3 font-telemetry text-[11px] whitespace-nowrap ${
                                      c.feasible ? 'text-[#5E9C76]' : 'text-[#C44D2B]'
                                    }`}
                                  >
                                    {c.feasible ? 'Feasible' : 'Blocked'}
                                  </td>
                                  <td className="py-2 pr-3 font-telemetry tabular-nums whitespace-nowrap">
                                    {c.feasible ? `${(c.distanceM / 1000).toFixed(2)} km` : '—'}
                                  </td>
                                  <td className="py-2 pr-3 font-telemetry tabular-nums whitespace-nowrap text-[#D4B483]">
                                    {c.feasible
                                      ? `+${Math.max(0, detourM).toFixed(0)} m (+${Math.max(0, detourPct).toFixed(0)}%)${
                                          vsShortestM > 1 ? ` · +${vsShortestM.toFixed(0)}m vs min` : ''
                                        }`
                                      : '—'}
                                  </td>
                                  <td className="py-2 pr-3 font-telemetry tabular-nums whitespace-nowrap">
                                    {c.feasible
                                      ? `+${c.elevationGainM.toFixed(0)} / -${c.elevationLossM.toFixed(0)} m`
                                      : '—'}
                                  </td>
                                  <td className="py-2 pr-3 font-telemetry tabular-nums whitespace-nowrap">
                                    {c.feasible ? `${c.maxSlopeDeg.toFixed(1)}°` : '—'}
                                  </td>
                                  <td className="py-2 pr-3 font-telemetry tabular-nums whitespace-nowrap">
                                    {c.feasible && c.estimatedTimeMin !== null
                                      ? `${c.estimatedTimeMin.toFixed(0)} min`
                                      : '—'}
                                  </td>
                                  <td className="py-2 text-[11px] text-[#9D968A]">
                                    {c.feasible ? c.tradeoffSummary : c.blockedReason}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {bottomTrayTab === 'ENV' && (
            <EnvironmentPanel environment={environment} loading={envLoading} />
          )}

          {bottomTrayTab === 'PROBE' && (
            <div>
              {!pointProbe ? (
                <CalmEmptyState
                  title="Click any point on Mars to sample DEM telemetry"
                  suggestion="Click directly on the orbital map surface to query Gale_DEM_SMG_1m / MOLA elevation and local terrain slope."
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-telemetry text-[#D4B483]">
                      Surface Probe · {formatMarsCoord(pointProbe.lon, pointProbe.lat, 4)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPointProbe(null)}
                      className="text-[11px] font-telemetry text-[#9D968A] hover:text-[#EAE4D9] underline cursor-pointer"
                    >
                      Clear probe
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <MetricDisplay
                      label="Elevation"
                      value={
                        pointProbe.loading
                          ? '…'
                          : pointProbe.elevationM !== null
                            ? pointProbe.elevationM.toFixed(1)
                            : 'N/A'
                      }
                      unit={pointProbe.elevationM !== null && !pointProbe.loading ? 'm' : undefined}
                    />
                    <MetricDisplay
                      label="Local slope"
                      value={
                        pointProbe.loading
                          ? '…'
                          : pointProbe.localSlopeDeg !== null
                            ? pointProbe.localSlopeDeg.toFixed(1)
                            : 'N/A'
                      }
                      unit={
                        pointProbe.localSlopeDeg !== null && !pointProbe.loading ? '°' : undefined
                      }
                      accent="ochre"
                    />
                    <MetricDisplay
                      label="Data status"
                      value={pointProbe.dataStatus}
                      accent="sand"
                    />
                    <MetricDisplay label="DEM source" value={pointProbe.resolution} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
