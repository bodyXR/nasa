import React, { useMemo, useState } from 'react';
import type { RoverObservation } from '../../../shared/types';
import { usePlanetStore } from '../../store/planetStore';
import { formatMarsCoord } from '../../../shared/geo';
import {
  CalmEmptyState,
  ScienceLoadingState,
  VerifiedImage,
} from '../ui/InstrumentPrimitives';
import { Camera, ExternalLink, MapPin } from 'lucide-react';

interface RoverObservationsPanelProps {
  observations: RoverObservation[];
  waypoints: Array<{
    sol: number;
    coordinates: [number, number];
    elevationM: number | null;
    tiltDeg: number | null;
    distTotalM: number | null;
  }>;
  loading: boolean;
}

export const RoverObservationsPanel: React.FC<RoverObservationsPanelProps> = ({
  observations,
  waypoints,
  loading,
}) => {
  const {
    selectedObservationId,
    selectedObservationSol,
    selectObservation,
    selectObservationSol,
    setCamera,
    activateLayer,
  } = usePlanetStore();
  const [onlyLocated, setOnlyLocated] = useState(false);
  const [instrumentFilter, setInstrumentFilter] = useState('ALL');

  const instruments = useMemo(
    () => Array.from(new Set(observations.map((o) => o.instrument))).sort(),
    [observations]
  );

  const selectedObs = useMemo(
    () => (selectedObservationId ? observations.find((o) => o.id === selectedObservationId) ?? null : null),
    [observations, selectedObservationId]
  );

  const filtered = useMemo(() => {
    return observations.filter((o) => {
      if (onlyLocated && !o.located) return false;
      if (instrumentFilter !== 'ALL' && o.instrument !== instrumentFilter) return false;
      if (selectedObservationSol !== null && o.sol !== selectedObservationSol) return false;
      return true;
    });
  }, [observations, onlyLocated, instrumentFilter, selectedObservationSol]);

  const distinctSols = useMemo(
    () => Array.from(new Set(observations.map((o) => o.sol))).sort((a, b) => b - a),
    [observations]
  );

  const latestWaypoint = waypoints[waypoints.length - 1] ?? null;

  return (
    <div className="space-y-4">
      {selectedObs && (
        <div className="mp-surface-raised mp-reticle-frame p-3 space-y-2 mp-settle-in">
          <div className="flex items-center justify-between gap-2 text-[10px] font-telemetry">
            <span className="text-[#D4B483]">
              Selected from map · Sol {selectedObs.sol} · {selectedObs.instrument}
            </span>
            <button
              type="button"
              onClick={() => selectObservation(null, null)}
              className="text-[#9D968A] hover:text-[#EAE4D9] underline cursor-pointer"
            >
              Show all
            </button>
          </div>
          <VerifiedImage
            src={selectedObs.imageUrl}
            alt={`Curiosity Sol ${selectedObs.sol} ${selectedObs.instrument}: ${selectedObs.title}`}
            className="w-full h-44 object-cover border border-[#242832]"
          />
          <div className="text-xs font-medium text-[#F7F3EB]">{selectedObs.title}</div>
          <p className="text-xs text-[#9D968A] leading-snug">{selectedObs.caption}</p>
          {selectedObs.located && selectedObs.coordinates && (
            <div className="text-[10px] font-telemetry text-[#9D968A]">
              {formatMarsCoord(selectedObs.coordinates[0], selectedObs.coordinates[1], 4)} ·{' '}
              {selectedObs.localizationMethod}
            </div>
          )}
        </div>
      )}

      <div className="mp-surface-recessed p-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[#EAE4D9]">
          <Camera className="w-3.5 h-3.5 text-[#D4B483]" />
          <span>Curiosity ground-truth traverse</span>
        </div>
        {latestWaypoint ? (
          <div className="text-xs space-y-1.5 text-[#9D968A]">
            <div>
              Latest verified waypoint:{' '}
              <span className="font-telemetry text-[#F7F3EB]">Sol {latestWaypoint.sol}</span>
            </div>
            <div className="font-telemetry text-[11px] tabular-nums">
              {formatMarsCoord(latestWaypoint.coordinates[0], latestWaypoint.coordinates[1], 4)} ·{' '}
              {latestWaypoint.elevationM !== null ? `${latestWaypoint.elevationM.toFixed(1)} m` : 'Elev N/A'}
            </div>
            <button
              type="button"
              onClick={() => {
                activateLayer('msl-rover-observations');
                setCamera({
                  lon: latestWaypoint.coordinates[0],
                  lat: latestWaypoint.coordinates[1],
                  zoom: 14.5,
                });
              }}
              className="mp-btn-secondary mt-1 min-h-[32px] px-3 text-[11px] font-telemetry text-[#D4B483] cursor-pointer"
            >
              Fly to Sol {latestWaypoint.sol}
            </button>
          </div>
        ) : (
          <div className="text-xs text-[#736D63]">Loading traverse waypoints…</div>
        )}
      </div>

      <div className="mp-surface-recessed p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] text-[#9D968A]" htmlFor="sol-filter">
            Sol filter
          </label>
          <select
            id="sol-filter"
            value={selectedObservationSol === null ? 'ALL' : String(selectedObservationSol)}
            onChange={(e) =>
              selectObservationSol(e.target.value === 'ALL' ? null : Number(e.target.value))
            }
            className="bg-[#111317] border border-[#242832] px-2 py-1 text-xs font-telemetry text-[#EAE4D9]"
          >
            <option value="ALL">All recent sols ({distinctSols.length})</option>
            {distinctSols.map((s) => (
              <option key={s} value={s}>
                Sol {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] text-[#9D968A]" htmlFor="inst-filter">
            Camera
          </label>
          <select
            id="inst-filter"
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value)}
            className="bg-[#111317] border border-[#242832] px-2 py-1 text-xs font-telemetry text-[#EAE4D9]"
          >
            <option value="ALL">All instruments</option>
            {instruments.map((inst) => (
              <option key={inst} value={inst}>
                {inst}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2.5 text-xs text-[#9D968A] cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={onlyLocated}
            onChange={(e) => setOnlyLocated(e.target.checked)}
            className="mp-checkbox"
          />
          <span>Localized photos only (site/drive matched)</span>
        </label>
      </div>

      {loading && (
        <ScienceLoadingState
          title="LOADING ROVER IMAGERY"
          subtitle="Synchronizing NASA MSL raw image records and traverse drive positions."
        />
      )}

      {!loading && filtered.length === 0 && (
        <CalmEmptyState
          title="No matching observations"
          suggestion="Clear the Sol or camera filter to view all localized Curiosity observations."
          actionLabel="Reset filters"
          onAction={() => {
            selectObservationSol(null);
            setInstrumentFilter('ALL');
            setOnlyLocated(false);
          }}
        />
      )}

      <div className="space-y-2.5">
        {filtered.slice(0, 16).map((obs) => (
          <article key={obs.id} className="mp-surface-recessed overflow-hidden">
            <a href={obs.imageUrl} target="_blank" rel="noreferrer" className="block bg-[#111317]">
              <VerifiedImage
                src={obs.thumbUrl || obs.imageUrl}
                alt={`Curiosity Sol ${obs.sol} ${obs.instrument}: ${obs.title}`}
                className="w-full h-36 object-cover"
              />
            </a>
            <div className="p-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2 text-[10px] font-telemetry">
                <span className="text-[#D4B483]">
                  Sol {obs.sol} · {obs.instrument}
                </span>
                <span className={obs.located ? 'text-[#5E9C76]' : 'text-[#D98A4E]'}>
                  {obs.located ? 'Localized' : 'UNLOCATED'}
                </span>
              </div>
              <div className="text-xs font-medium text-[#EAE4D9]">{obs.title}</div>
              <div className="text-[10px] font-telemetry text-[#736D63]">
                {obs.earthDate} · {obs.localizationMethod}
              </div>
              {obs.located && obs.coordinates ? (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-telemetry text-[#9D968A] tabular-nums">
                    {formatMarsCoord(obs.coordinates[0], obs.coordinates[1], 4)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      activateLayer('msl-rover-observations');
                      selectObservation(obs.id, obs.sol);
                      setCamera({ lon: obs.coordinates![0], lat: obs.coordinates![1], zoom: 15 });
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-telemetry text-[#D4B483] underline cursor-pointer"
                  >
                    <MapPin className="w-3 h-3" /> Focus map
                  </button>
                </div>
              ) : (
                <div className="text-[10px] text-[#D98A4E] pt-0.5">
                  UNLOCATED — no invented coordinates assigned.
                </div>
              )}
              <a
                href={obs.provenance.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-telemetry text-[#736D63] hover:text-[#EAE4D9] underline"
              >
                {obs.provenance.attribution} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
