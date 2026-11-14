import React, { useMemo, useState } from 'react';
import type { RouteAnalysisResponse, RouteCandidate } from '../../../shared/types';
import { usePlanetStore } from '../../store/planetStore';
import { getRouteVisual } from '../../geo/routeStyles';
import { CalmEmptyState } from '../ui/InstrumentPrimitives';

interface ElevationProfileTrayProps {
  routeAnalysis: RouteAnalysisResponse | null;
}

interface SamplePt {
  distM: number;
  elevM: number;
  slopeDeg: number;
  coord: [number, number];
}

function buildRouteSamples(route: RouteCandidate): SamplePt[] {
  if (!route.feasible || route.segments.length === 0) return [];
  const pts: SamplePt[] = [];
  let cum = 0;
  const first = route.segments[0];
  pts.push({
    distM: 0,
    elevM: first.elevationStartM,
    slopeDeg: first.slopeDeg,
    coord: first.from,
  });
  for (const seg of route.segments) {
    cum += seg.distanceM;
    pts.push({
      distM: cum,
      elevM: seg.elevationEndM,
      slopeDeg: seg.slopeDeg,
      coord: seg.to,
    });
  }
  return pts;
}

export const ElevationProfileTray: React.FC<ElevationProfileTrayProps> = ({ routeAnalysis }) => {
  const {
    selectedRouteId,
    compareRouteBId,
    selectRoute,
    setHoveredProfile,
    hoveredProfileIdx,
    hoveredProfileRouteId,
    setInspectorContext,
    setRightRailOpen,
  } = usePlanetStore();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const feasibleRoutes = useMemo(() => {
    if (!routeAnalysis) return [];
    return routeAnalysis.candidates
      .filter((c) => c.feasible && c.segments.length > 0)
      .map((c) => ({
        route: c,
        visual: getRouteVisual(c.preset),
        samples: buildRouteSamples(c),
      }))
      .filter((entry) => entry.samples.length >= 2);
  }, [routeAnalysis]);

  const activeEntry = useMemo(() => {
    if (feasibleRoutes.length === 0) return null;
    return (
      feasibleRoutes.find((f) => f.route.id === selectedRouteId) ?? feasibleRoutes[0]
    );
  }, [feasibleRoutes, selectedRouteId]);

  if (!activeEntry) {
    return (
      <CalmEmptyState
        title="No route profile evaluated yet"
        suggestion="Connect two points on Mars (A → B) or evaluate candidate routes to compare elevation and slope differences across all paths."
        actionLabel="Open route planner"
        onAction={() => {
          setInspectorContext('ROUTE');
          setRightRailOpen(true);
        }}
      />
    );
  }

  const activeRoute = activeEntry.route;
  const samples = activeEntry.samples;

  // Hover can originate from the tray scrub OR from hovering the route on the Mars map.
  // Map-driven hover only applies when it targets this tray's active route.
  const effectiveHoverIdx =
    hoveredProfileRouteId === activeRoute.id && hoveredProfileIdx !== null
      ? hoveredProfileIdx
      : hoverIdx;

  const width = 760;
  const height = 114;
  const padX = 38;
  const padY = 14;

  const allSamples = feasibleRoutes.flatMap((f) => f.samples);
  const maxDist = Math.max(1, ...allSamples.map((p) => p.distM));
  const minElev = Math.min(...allSamples.map((p) => p.elevM));
  const maxElev = Math.max(...allSamples.map((p) => p.elevM));
  const midElev = (minElev + maxElev) / 2;
  const elevSpan = Math.max(1, maxElev - minElev);

  const toX = (d: number) => padX + (d / maxDist) * (width - padX * 2);
  const toY = (e: number) => height - padY - ((e - minElev) / elevSpan) * (height - padY * 2);

  const activePolyline = samples
    .map((p) => `${toX(p.distM).toFixed(1)},${toY(p.elevM).toFixed(1)}`)
    .join(' ');
  const activeMaxDist = samples[samples.length - 1].distM;
  const areaPts = `${toX(0).toFixed(1)},${height - padY} ${activePolyline} ${toX(activeMaxDist).toFixed(1)},${height - padY}`;
  const hovered = effectiveHoverIdx !== null ? samples[effectiveHoverIdx] : null;

  return (
    <div data-tour="elevation-tray" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {feasibleRoutes.map(({ route, visual }) => {
            const isSel = route.id === activeRoute.id;
            const isL2 = route.id === compareRouteBId && !isSel;
            return (
              <button
                key={route.id}
                type="button"
                onClick={() => selectRoute(route.id)}
                className={`px-2 py-0.5 border text-[10px] font-telemetry inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  isSel
                    ? 'bg-[#171A20] border-[#F7F3EB] text-[#F7F3EB]'
                    : isL2
                      ? 'bg-[#111317] border-[#D4B483] text-[#F7F3EB]'
                      : 'bg-[#0B0D10] border-[#242832] text-[#9D968A] hover:text-[#EAE4D9]'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 shrink-0"
                  style={{ backgroundColor: visual.color }}
                />
                <span>{visual.shortLabel}</span>
                {isSel && <span>[L1]</span>}
                {isL2 && <span className="text-[#D4B483]">[L2]</span>}
                <span className="tabular-nums text-[#736D63]">
                  {(route.distanceM / 1000).toFixed(2)}km
                </span>
              </button>
            );
          })}
        </div>

        {hovered ? (
          <div className="mp-surface-recessed px-2.5 py-0.5 text-[11px] font-telemetry text-[#F7F3EB] tabular-nums">
            {(hovered.distM / 1000).toFixed(2)} km · {hovered.elevM.toFixed(1)} m · Slope{' '}
            <span className="text-[#D98A4E]">{hovered.slopeDeg.toFixed(1)}°</span>
          </div>
        ) : (
          <span className="text-[11px] text-[#736D63]">
            All {feasibleRoutes.length} feasible roads overlaid · scrub here or hover a route on the map
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-28 mp-topo-grid border border-[#242832] cursor-crosshair"
        onMouseLeave={() => {
          setHoverIdx(null);
          setHoveredProfile(null);
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const targetDist = Math.max(
            0,
            Math.min(activeMaxDist, ((relX - padX) / (width - padX * 2)) * maxDist)
          );
          let best = 0;
          let bestDiff = Infinity;
          for (let i = 0; i < samples.length; i++) {
            const diff = Math.abs(samples[i].distM - targetDist);
            if (diff < bestDiff) {
              bestDiff = diff;
              best = i;
            }
          }
          setHoverIdx(best);
          setHoveredProfile({ coord: samples[best].coord, idx: best, routeId: activeRoute.id });
        }}
      >
        <defs>
          <linearGradient id="mpElevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={activeEntry.visual.color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={activeEntry.visual.color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#242832" strokeDasharray="3 3" />
        <line x1={padX} y1={height / 2} x2={width - padX} y2={height / 2} stroke="#242832" strokeDasharray="3 3" />
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#373D4B" />

        <polygon points={areaPts} fill="url(#mpElevGrad)" />

        {/* Draw non-selected feasible routes underneath, emphasizing Line 2 with dashed stroke */}
        {feasibleRoutes.map(({ route, visual, samples: rSamples }) => {
          if (route.id === activeRoute.id) return null;
          const isL2 = route.id === compareRouteBId;
          const pts = rSamples.map((p) => `${toX(p.distM).toFixed(1)},${toY(p.elevM).toFixed(1)}`).join(' ');
          return (
            <polyline
              key={route.id}
              fill="none"
              stroke={visual.color}
              strokeOpacity={isL2 ? 0.92 : 0.48}
              strokeWidth={isL2 ? 2.0 : 1.2}
              strokeDasharray={isL2 ? '5 3' : undefined}
              points={pts}
            />
          );
        })}

        {/* Selected active route prominent on top */}
        <polyline
          fill="none"
          stroke={activeEntry.visual.color}
          strokeWidth={2.4}
          points={activePolyline}
        />

        {samples.map((p, idx) =>
          p.slopeDeg > activeRoute.weights.maxSlopeDeg * 0.8 ? (
            <circle
              key={idx}
              cx={toX(p.distM)}
              cy={toY(p.elevM)}
              r={2.8}
              fill="#C44D2B"
              stroke="#07080A"
              strokeWidth={0.8}
            />
          ) : null
        )}

        {hovered && (
          <g>
            <line
              x1={toX(hovered.distM)}
              y1={padY}
              x2={toX(hovered.distM)}
              y2={height - padY}
              stroke="#F7F3EB"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <circle
              cx={toX(hovered.distM)}
              cy={toY(hovered.elevM)}
              r={4.5}
              fill="#F7F3EB"
              stroke={activeEntry.visual.color}
              strokeWidth={2}
            />
          </g>
        )}

        <text x={4} y={padY + 3} fill="#9D968A" fontSize="9" fontFamily="IBM Plex Mono, monospace">
          {maxElev.toFixed(0)}m
        </text>
        <text x={4} y={height / 2 + 3} fill="#736D63" fontSize="9" fontFamily="IBM Plex Mono, monospace">
          {midElev.toFixed(0)}m
        </text>
        <text x={4} y={height - padY} fill="#9D968A" fontSize="9" fontFamily="IBM Plex Mono, monospace">
          {minElev.toFixed(0)}m
        </text>
      </svg>
    </div>
  );
};
