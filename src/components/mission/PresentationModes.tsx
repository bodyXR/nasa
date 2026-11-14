import React from 'react';
import { usePlanetStore } from '../../store/planetStore';
import type {
  Dataset,
  ObjectiveRule,
  Region,
  RouteAnalysisResponse,
  ScienceTarget,
} from '../../../shared/types';
import { formatMarsCoord, marsBearingDeg, marsDistanceM } from '../../../shared/geo';
import { Download } from 'lucide-react';

interface DecisionTrailProps {
  region: Region | null;
  objective: ObjectiveRule | null;
  targets: ScienceTarget[];
  routeAnalysis: RouteAnalysisResponse | null;
}

export const DecisionTrail: React.FC<DecisionTrailProps> = ({
  region,
  objective,
  targets,
  routeAnalysis,
}) => {
  const { selectedTargetId, selectedRouteId, setInspectorContext, setRightRailOpen } =
    usePlanetStore();
  const target = targets.find((t) => t.id === selectedTargetId);
  const route = routeAnalysis?.candidates.find((c) => c.id === selectedRouteId);

  const steps = [
    {
      label: 'Region',
      value: region ? 'Gale Crater' : '—',
      ctx: 'OVERVIEW' as const,
      done: Boolean(region),
    },
    {
      label: 'Evidence',
      value: objective ? objective.title.split(' ')[0] : '—',
      ctx: 'TARGET' as const,
      done: Boolean(objective),
    },
    {
      label: 'Target',
      value: target ? `#${target.rank}` : 'Select',
      ctx: 'TARGET' as const,
      done: Boolean(target),
    },
    {
      label: 'Route',
      value: route?.feasible ? `${(route.distanceM / 1000).toFixed(2)} km` : 'Evaluate',
      ctx: 'ROUTE' as const,
      done: Boolean(route?.feasible),
    },
  ];

  return (
    <nav aria-label="Decision Trail" className="hidden xl:flex items-center gap-1.5 text-[11px]">
      {steps.map((s, idx) => (
        <React.Fragment key={s.label}>
          {idx > 0 && <span className="text-[#373D4B]">→</span>}
          <button
            type="button"
            onClick={() => {
              setInspectorContext(s.ctx);
              setRightRailOpen(true);
            }}
            className={`px-2 py-1 border cursor-pointer transition-colors ${
              s.done
                ? 'border-[#373D4B] bg-[#171A20] text-[#EAE4D9]'
                : 'border-[#242832] bg-[#0B0D10] text-[#736D63]'
            }`}
          >
            <span className="text-[#9D968A] mr-1">{s.label}:</span>
            <span className="font-telemetry text-[#D4B483]">{s.value}</span>
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
};

interface OfflinePackButtonProps {
  region: Region | null;
  datasets: Dataset[];
  targets: ScienceTarget[];
  routeAnalysis: RouteAnalysisResponse | null;
}

export const OfflinePackButton: React.FC<OfflinePackButtonProps> = ({
  region,
  datasets,
  targets,
  routeAnalysis,
}) => {
  const handleDownloadPack = () => {
    const pack = {
      schema: 'mars-path-offline-region-pack-v1',
      exportedAt: new Date().toISOString(),
      region,
      datasets: datasets.map((d) => ({
        id: d.id,
        name: d.name,
        resolution: d.resolution,
        sourceUrl: d.sourceUrl,
      })),
      targets,
      routeAnalysis,
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marspath-${region?.id ?? 'gale'}-offline-pack.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleDownloadPack}
      className="mp-btn-secondary min-h-[28px] px-2.5 text-[10px] font-telemetry text-[#D4B483] flex items-center gap-1.5 cursor-pointer"
    >
      <Download className="w-3 h-3" />
      <span>Offline Pack</span>
    </button>
  );
};

interface HudConceptOverlayProps {
  targets: ScienceTarget[];
  routeAnalysis: RouteAnalysisResponse | null;
}

export const HudConceptOverlay: React.FC<HudConceptOverlayProps> = ({
  targets,
  routeAnalysis,
}) => {
  const { lat, lon, selectedTargetId, selectedRouteId, setPresentationMode } = usePlanetStore();
  const target = targets.find((t) => t.id === selectedTargetId) ?? targets[0] ?? null;
  const route =
    routeAnalysis?.candidates.find((c) => c.id === selectedRouteId) ??
    routeAnalysis?.candidates.find((c) => c.feasible) ??
    null;

  const targetDistM = target ? marsDistanceM([lon, lat], target.coordinates) : null;
  const targetBearing = target ? marsBearingDeg([lon, lat], target.coordinates) : null;

  return (
    <div className="pointer-events-none absolute inset-x-4 top-3 z-20 flex justify-center">
      <div className="pointer-events-auto mp-instrument-panel mp-reticle-frame border-[#5E9C76] px-4 py-2.5 max-w-xl w-full font-telemetry text-xs mp-settle-in">
        <div className="flex items-center justify-between gap-3 border-b border-[#242832] pb-1.5 mb-2">
          <span className="text-[10px] tracking-wider text-[#5E9C76]">
            HUD Concept · Decision Support Only
          </span>
          <button
            type="button"
            onClick={() => setPresentationMode('HABITAT')}
            className="text-[10px] underline text-[#D4B483] cursor-pointer"
          >
            Exit HUD
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] text-[#736D63]">Center coord</div>
            <div className="text-[#F7F3EB] tabular-nums">{formatMarsCoord(lon, lat, 3)}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#736D63]">Target bearing / dist</div>
            <div className="text-[#D4B483] tabular-nums">
              {targetBearing !== null && targetDistM !== null
                ? `${targetBearing.toFixed(0)}° · ${(targetDistM / 1000).toFixed(2)} km`
                : 'Select target'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#736D63]">Route slope cap</div>
            <div className="text-[#D98A4E] tabular-nums">
              {route
                ? `${route.maxSlopeDeg.toFixed(1)}° (≤${route.weights.maxSlopeDeg}°)`
                : 'No active route'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
