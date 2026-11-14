import React, { useMemo, useState } from 'react';
import type { Dataset, DatasetType } from '../../../shared/types';
import { usePlanetStore } from '../../store/planetStore';
import { WhyDrawer, MetadataAccordion } from '../ui/InstrumentPrimitives';
import {
  Eye,
  EyeOff,
  Layers,
  LocateFixed,
  RotateCcw,
  SplitSquareHorizontal,
  X,
} from 'lucide-react';

interface DataRailProps {
  datasets: Dataset[];
  lastSynchronized: string;
}

const TYPE_LABELS: Record<DatasetType, string> = {
  IMAGERY: 'Orbital imagery',
  TOPOGRAPHY: 'Terrain & elevation',
  THERMAL: 'Thermal inertia',
  GEOLOGY: 'Geologic units & dunes',
  SPECTRAL: 'Minerals & spectra',
  ROVER_OBSERVATION: 'Curiosity ground truth',
  ATMOSPHERIC: 'Surface weather (REMS)',
  RADIATION: 'Surface radiation (RAD)',
  CHEMICAL: 'In-situ chemistry',
  SUBSURFACE: 'Subsurface context',
};

const LAYER_PRESETS: Array<{ id: string; label: string; layers: string[] }> = [
  {
    id: 'fusion',
    label: 'Fusion',
    layers: [
      'trek-ctx-gale',
      'trek-hirise-curiosity',
      'trek-crism-spectral',
      'trek-dune-fields',
      'msl-rover-observations',
    ],
  },
  {
    id: 'optical',
    label: 'HiRISE',
    layers: ['trek-ctx-gale', 'trek-hirise-curiosity', 'msl-rover-observations'],
  },
  {
    id: 'thermal',
    label: 'Thermal',
    layers: ['trek-ctx-gale', 'trek-themis-night-ir', 'trek-dune-fields'],
  },
  {
    id: 'slope',
    label: 'Geology & 1m Slope',
    layers: ['trek-ctx-gale', 'usgs-sim3292-geo', 'trek-dune-fields', 'trek-gale-dem-1m'],
  },
];

const DATASET_FOCUS_CAMERA: Record<string, { lon: number; lat: number; zoom: number }> = {
  'trek-hirise-curiosity': { lon: 137.3889, lat: -4.805, zoom: 14.2 },
  'trek-ctx-gale': { lon: 137.3889, lat: -4.775, zoom: 12.2 },
  'trek-mola-hrsc-clr': { lon: 137.4, lat: -4.8, zoom: 7.4 },
  'trek-gale-dem-1m': { lon: 137.389, lat: -4.792, zoom: 13.1 },
  'trek-themis-night-ir': { lon: 137.3889, lat: -4.775, zoom: 11.4 },
  'usgs-sim3292-geo': { lon: 137.39, lat: -4.76, zoom: 11.8 },
  'trek-crism-spectral': { lon: 137.386, lat: -4.765, zoom: 13.2 },
  'trek-dune-fields': { lon: 137.372, lat: -4.655, zoom: 13.0 },
  'msl-rover-observations': { lon: 137.392, lat: -4.824, zoom: 14.3 },
};

const COMPARE_SUPPORTED = new Set([
  'trek-hirise-curiosity',
  'trek-themis-night-ir',
  'usgs-sim3292-geo',
  'trek-ctx-gale',
  'trek-mola-hrsc-clr',
]);

export const DataRail: React.FC<DataRailProps> = ({ datasets, lastSynchronized }) => {
  const {
    activeLayers,
    layerOpacity,
    simpleAdvanced,
    selectedDatasetId,
    compareMode,
    compareLayerB,
    toggleLayer,
    activateLayer,
    setLayersExact,
    selectDataset,
    setLayerOpacity,
    setActiveTab,
    setLeftRailOpen,
    setCamera,
    setCompareMode,
  } = usePlanetStore();

  const [filterType, setFilterType] = useState<string>('ALL');

  const { activeList, availableList, typesPresent } = useMemo(() => {
    const filtered =
      filterType === 'ALL' ? datasets : datasets.filter((d) => d.type === filterType);
    const active = filtered.filter((d) => activeLayers.includes(d.id));
    const available = filtered.filter((d) => !activeLayers.includes(d.id));
    const types = Array.from(new Set(datasets.map((d) => d.type)));
    return { activeList: active, availableList: available, typesPresent: types };
  }, [datasets, activeLayers, filterType]);

  const handleFocusLayer = (ds: Dataset) => {
    if (ds.visualization.kind === 'timeseries') {
      setActiveTab('ENV');
      return;
    }
    activateLayer(ds.id);
    const cam = DATASET_FOCUS_CAMERA[ds.id];
    if (cam) {
      setCamera({ lon: cam.lon, lat: cam.lat, zoom: cam.zoom, pitch: 0, bearing: 0 });
    }
  };

  const renderDatasetRow = (ds: Dataset, isActive: boolean) => {
    const isSelected = selectedDatasetId === ds.id;
    const opacity = layerOpacity[ds.id] ?? ds.visualization.defaultOpacity;
    const isMapLayer = ds.visualization.kind !== 'timeseries';
    const supportsOpacity =
      ds.visualization.kind === 'wmts' ||
      ds.visualization.kind === 'geojson' ||
      ds.visualization.kind === 'derived-grid';
    const isComparingThis = compareMode && compareLayerB === ds.id;

    return (
      <div
        key={ds.id}
        data-tour="dataset-card"
        className={`transition-colors ${
          isSelected
            ? 'mp-surface-raised border-[#D4B483]'
            : isActive
              ? 'mp-instrument-panel border-[#373D4B]'
              : 'mp-surface-recessed hover:border-[#373D4B]'
        }`}
      >
        <div className="p-2.5 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => selectDataset(ds.id)}
              className="text-left flex-1 cursor-pointer group"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-telemetry text-[#9D968A]">
                {ds.visualization.color && (
                  <span
                    className="inline-block w-2 h-2 shrink-0 border border-[#07080A]"
                    style={{ backgroundColor: ds.visualization.color }}
                  />
                )}
                <span className="text-[#D4B483]">{TYPE_LABELS[ds.type] ?? ds.type}</span>
                <span>·</span>
                <span className={ds.status === 'LIVE' ? 'text-[#5E9C76]' : 'text-[#D98A4E]'}>
                  {ds.status}
                </span>
              </div>
              <div className="text-[13px] font-medium text-[#EAE4D9] group-hover:text-[#F7F3EB] mt-0.5 leading-snug">
                {ds.name}
              </div>
              {simpleAdvanced === 'ADVANCED' && (
                <div className="text-[11px] font-telemetry text-[#736D63] mt-0.5">
                  {ds.mission} · {ds.instrument}
                </div>
              )}
            </button>

            <div className="flex items-center gap-1 shrink-0">
              {isMapLayer && (
                <button
                  type="button"
                  aria-label={`Focus map on ${ds.name}`}
                  title="View layer footprint on Mars"
                  onClick={() => handleFocusLayer(ds)}
                  className="mp-btn-secondary min-w-[28px] min-h-[30px] flex items-center justify-center text-[#9D968A] hover:text-[#D4B483] cursor-pointer"
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                </button>
              )}

              {COMPARE_SUPPORTED.has(ds.id) && (
                <button
                  type="button"
                  aria-label={`Compare ${ds.name} on split right`}
                  title="Load on Split Compare Right"
                  onClick={() => setCompareMode(true, ds.id)}
                  className={`min-w-[28px] min-h-[30px] flex items-center justify-center cursor-pointer ${
                    isComparingThis
                      ? 'mp-btn-primary'
                      : 'mp-btn-secondary text-[#9D968A] hover:text-[#5B8BB4]'
                  }`}
                >
                  <SplitSquareHorizontal className="w-3.5 h-3.5" />
                </button>
              )}

              {isMapLayer ? (
                <button
                  type="button"
                  aria-label={`${isActive ? 'Hide' : 'Show'} ${ds.name}`}
                  onClick={() => toggleLayer(ds.id)}
                  className={`min-w-[32px] min-h-[30px] flex items-center justify-center cursor-pointer ${
                    isActive ? 'mp-btn-primary' : 'mp-btn-secondary text-[#9D968A]'
                  }`}
                >
                  {isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('ENV')}
                  className="mp-btn-secondary min-h-[30px] px-2 text-[10px] font-telemetry text-[#D4B483] cursor-pointer"
                >
                  View
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-[#9D968A] leading-snug">{ds.whatItShows}</p>

          {isActive && ds.visualization.legend && (
            <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-telemetry text-[#CEC8BC]">
              {ds.visualization.legend.map((entry) => (
                <span key={entry.label} className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-2.5 h-2.5 border border-[#242832]"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span>{entry.label}</span>
                </span>
              ))}
            </div>
          )}

          {isActive && isMapLayer && supportsOpacity && (
            <div className="pt-1.5 border-t border-[#242832] flex items-center gap-2">
              <span className="text-[10px] font-telemetry text-[#736D63] w-16 tabular-nums">
                Opacity {Math.round(opacity * 100)}%
              </span>
              <input
                type="range"
                aria-label={`Opacity for ${ds.name}`}
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setLayerOpacity(ds.id, Number(e.target.value))}
                className="mp-range flex-1"
              />
            </div>
          )}

          <WhyDrawer
            question="Why this matters"
            summary={ds.whyItMatters}
            sourceLabel={ds.attribution}
            sourceUrl={ds.sourceUrl}
          />

          <MetadataAccordion
            label="Details & resolution"
            defaultOpen={simpleAdvanced === 'ADVANCED' && isSelected}
          >
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-telemetry text-[#9D968A]">
              <div>Res: {ds.resolution}</div>
              <div>CRS: {ds.crs}</div>
              <div className="col-span-2">Temporal: {ds.temporalCoverage}</div>
              {ds.productId && (
                <div className="col-span-2 truncate">Product: {ds.productId}</div>
              )}
            </div>
            {ds.limitations.length > 0 && (
              <p className="text-[11px] text-[#D98A4E] bg-[#07080A] border border-[#242832] p-2 leading-snug">
                {ds.limitations.join(' ')}
              </p>
            )}
          </MetadataAccordion>
        </div>
      </div>
    );
  };

  return (
    <aside
      data-tour="data-rail"
      aria-label="Planetary Datasets"
      className="h-full flex flex-col bg-[#111317] overflow-hidden"
    >
      <div className="px-3.5 py-2.5 border-b border-[#242832] bg-[#0B0D10] flex items-center justify-between gap-2 shrink-0">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#EAE4D9]">
            <Layers className="w-3.5 h-3.5 text-[#D4B483]" />
            <span>Planetary Layer Matrix</span>
          </div>
          <div className="text-[10px] font-telemetry text-[#736D63] mt-0.5 tabular-nums">
            {activeList.length} active · {datasets.length} datasets
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Reset default active layers"
            aria-label="Reset default layers"
            onClick={() =>
              setLayersExact([
                'trek-ctx-gale',
                'trek-hirise-curiosity',
                'msl-rover-observations',
                'trek-dune-fields',
              ])
            }
            className="min-w-[26px] min-h-[26px] flex items-center justify-center text-[#9D968A] hover:text-[#D4B483] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Close data panel"
            onClick={() => setLeftRailOpen(false)}
            className="min-w-[28px] min-h-[28px] flex items-center justify-center text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Multi-Sensor Presets + Discipline Filter */}
      <div className="px-3.5 py-2 border-b border-[#242832] bg-[#0B0D10] space-y-2 shrink-0">
        <div className="grid grid-cols-2 gap-1">
          {LAYER_PRESETS.map((preset) => {
            const isExactMatch =
              preset.layers.length === activeLayers.length &&
              preset.layers.every((id) => activeLayers.includes(id));
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setLayersExact(preset.layers)}
                className={`min-h-[26px] px-2 text-[10px] font-telemetry text-left truncate cursor-pointer border ${
                  isExactMatch
                    ? 'bg-[#171A20] border-[#D4B483] text-[#F7F3EB]'
                    : 'bg-[#111317] border-[#242832] text-[#9D968A] hover:text-[#EAE4D9] hover:border-[#373D4B]'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <select
          aria-label="Filter datasets by discipline"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="w-full bg-[#111317] border border-[#242832] px-2.5 py-1.5 text-xs text-[#EAE4D9] outline-none"
        >
          <option value="ALL">All disciplines ({datasets.length})</option>
          {typesPresent.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto mp-scroll p-3 space-y-4">
        <section>
          <div className="text-[10px] font-telemetry tracking-wider text-[#5E9C76] mb-2">
            Active on map ({activeList.length})
          </div>
          {activeList.length === 0 ? (
            <p className="text-xs text-[#736D63] mp-surface-recessed p-2.5">
              No map layers enabled. Toggle any dataset below or pick a quick preset above.
            </p>
          ) : (
            <div className="space-y-2">{activeList.map((d) => renderDatasetRow(d, true))}</div>
          )}
        </section>

        <section>
          <div className="text-[10px] font-telemetry tracking-wider text-[#9D968A] mb-2">
            Available catalog ({availableList.length})
          </div>
          <div className="space-y-2">{availableList.map((d) => renderDatasetRow(d, false))}</div>
        </section>
      </div>

      <div className="px-3.5 py-2 border-t border-[#242832] bg-[#0B0D10] text-[10px] font-telemetry text-[#736D63] shrink-0">
        Synced {lastSynchronized ? lastSynchronized.slice(0, 19).replace('T', ' ') + 'Z' : 'live'}
      </div>
    </aside>
  );
};
