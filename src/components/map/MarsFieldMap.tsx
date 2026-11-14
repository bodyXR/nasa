import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { ensureTrekProtocol } from '../../geo/trekProtocol';
import { ensureMaplibreWorkerUrl } from '../../geo/maplibreWorker';
import { getRouteVisual } from '../../geo/routeStyles';
import { usePlanetStore, type EndpointDemTelemetry } from '../../store/planetStore';
import { apiClient } from '../../services/apiClient';
import { formatMarsCoord, marsBearingDeg, marsDistanceM } from '../../../shared/geo';
import type {
  Dataset,
  RouteAnalysisResponse,
  RoverObservation,
  ScienceTarget,
} from '../../../shared/types';
import {
  ArrowUpDown,
  Box,
  Columns2,
  Compass,
  Crosshair,
  GitFork,
  Layers,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  SplitSquareHorizontal,
  Trash2,
  X,
} from 'lucide-react';

// Paint-property targets for the candidate-route reveal animation. Mirrors the values the
// paint-state effect applies, so a mid-animation toggle converges to the correct visual.
interface RevealPaintTarget {
  layer: string;
  prop: 'line-opacity' | 'text-opacity' | 'circle-opacity' | 'circle-stroke-opacity';
  value: number;
}
function liveRevealTargets(): RevealPaintTarget[] {
  const s = usePlanetStore.getState();
  const isStale = s.routeStage === 'STALE';
  const isolateDual = s.sideBySideCompare || !s.showAllRoutes;
  return [
    { layer: 'routes-selected-casing', prop: 'line-opacity', value: 1 },
    { layer: 'routes-selected', prop: 'line-opacity', value: isStale ? 0.36 : 0.98 },
    { layer: 'routes-alt-casing', prop: 'line-opacity', value: isolateDual ? 0 : isStale ? 0.14 : 0.4 },
    { layer: 'routes-alt', prop: 'line-opacity', value: isolateDual ? 0 : isStale ? 0.16 : 0.48 },
    { layer: 'routes-compare-casing', prop: 'line-opacity', value: 0.88 },
    { layer: 'routes-compare', prop: 'line-opacity', value: isStale ? 0.3 : s.sideBySideCompare ? 0.96 : 0.9 },
    { layer: 'routes-selected-arrows', prop: 'text-opacity', value: 1 },
    { layer: 'waypoints-pts', prop: 'circle-opacity', value: 1 },
    { layer: 'waypoints-pts', prop: 'circle-stroke-opacity', value: 1 },
  ];
}

interface MarsFieldMapProps {
  datasets: Dataset[];
  targets: ScienceTarget[];
  convergenceGrid: GeoJSON.FeatureCollection | null;
  geologyGeoJson: GeoJSON.FeatureCollection | null;
  dunesGeoJson: GeoJSON.FeatureCollection | null;
  spectralPoints: GeoJSON.FeatureCollection | null;
  frtFootprints: GeoJSON.FeatureCollection | null;
  traverseGeoJson: GeoJSON.FeatureCollection | null;
  observations: RoverObservation[];
  routeAnalysis: (RouteAnalysisResponse & { runId?: string }) | null;
  demPreviewGeoJson: GeoJSON.FeatureCollection | null;
  onRunAnalysis?: () => void;
  onClearAnalysis?: () => void;
}

const COMPARE_LAYER_OPTIONS = [
  { id: 'trek-hirise-curiosity', label: 'MRO HiRISE 0.25 m/px' },
  { id: 'trek-themis-night-ir', label: 'THEMIS Night IR (Thermal)' },
  { id: 'usgs-sim3292-geo', label: 'USGS SIM 3292 Geology' },
  { id: 'trek-ctx-gale', label: 'MRO CTX 6 m/px Mosaic' },
  { id: 'trek-mola-hrsc-clr', label: 'MOLA + HRSC Color Relief' },
];

const RASTER_LAYER_META: Record<string, { trekLayer: string; ext: 'png' | 'jpg'; maxzoom: number }> = {
  'trek-mola-hrsc-clr': {
    trekLayer: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw',
    ext: 'jpg',
    maxzoom: 9,
  },
  'trek-ctx-gale': { trekLayer: 'Gale_CTX_BlockAdj_dd', ext: 'png', maxzoom: 13 },
  'trek-hirise-curiosity': { trekLayer: 'curiosity_hirise_mosaic', ext: 'png', maxzoom: 17 },
  'trek-themis-night-ir': {
    trekLayer: 'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018',
    ext: 'png',
    maxzoom: 10,
  },
  'usgs-sim3292-geo': { trekLayer: 'SIM3292_Global_Geology', ext: 'png', maxzoom: 12 },
};

function createBaseMapStyle(): maplibregl.StyleSpecification {
  const sources: Record<string, maplibregl.SourceSpecification> = {};
  const layers: maplibregl.LayerSpecification[] = [
    {
      id: 'mars-bg',
      type: 'background',
      paint: { 'background-color': '#181412' },
    },
  ];

  sources['viking-base'] = {
    type: 'raster',
    tiles: ['trek://Mars_Viking_MDIM21_ClrMosaic_global_232m/{z}/{x}/{y}.jpg'],
    tileSize: 256,
    maxzoom: 9,
    attribution: 'NASA / JPL / USGS Mars Trek',
  };
  layers.push({
    id: 'raster-viking-base',
    type: 'raster',
    source: 'viking-base',
    paint: { 'raster-opacity': 0.9 },
  });

  for (const [dsId, meta] of Object.entries(RASTER_LAYER_META)) {
    sources[`src-${dsId}`] = {
      type: 'raster',
      tiles: [`trek://${meta.trekLayer}/{z}/{x}/{y}.${meta.ext}`],
      tileSize: 256,
      maxzoom: meta.maxzoom,
    };
    layers.push({
      id: `raster-${dsId}`,
      type: 'raster',
      source: `src-${dsId}`,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.85 },
    });
  }

  return {
    version: 8,
    sources,
    layers,
  };
}

const PROGRESSIVE_MARS_LABELS: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'MARS · AEOLIS QUADRANGLE', tier: 'FAR' },
      geometry: { type: 'Point', coordinates: [137.4, -4.65] },
    },
    {
      type: 'Feature',
      properties: { name: 'GALE CRATER', tier: 'REGIONAL' },
      geometry: { type: 'Point', coordinates: [137.42, -4.58] },
    },
    {
      type: 'Feature',
      properties: { name: 'MOUNT SHARP (AEOLIS MONS)', tier: 'REGIONAL' },
      geometry: { type: 'Point', coordinates: [137.39, -4.845] },
    },
    {
      type: 'Feature',
      properties: { name: 'PEACE VALLIS', tier: 'REGIONAL' },
      geometry: { type: 'Point', coordinates: [137.48, -4.43] },
    },
    {
      type: 'Feature',
      properties: { name: 'BRADBURY LANDING', tier: 'CORRIDOR' },
      geometry: { type: 'Point', coordinates: [137.4417, -4.5895] },
    },
    {
      type: 'Feature',
      properties: { name: 'BAGNOLD DUNES', tier: 'CORRIDOR' },
      geometry: { type: 'Point', coordinates: [137.368, -4.662] },
    },
    {
      type: 'Feature',
      properties: { name: 'VERA RUBIN RIDGE', tier: 'CORRIDOR' },
      geometry: { type: 'Point', coordinates: [137.3765, -4.7412] },
    },
    {
      type: 'Feature',
      properties: { name: 'GLEN TORRIDON', tier: 'CORRIDOR' },
      geometry: { type: 'Point', coordinates: [137.372, -4.7495] },
    },
    {
      type: 'Feature',
      properties: { name: 'GEDIZ VALLIS RIDGE', tier: 'CORRIDOR' },
      geometry: { type: 'Point', coordinates: [137.394, -4.812] },
    },
  ],
};

function buildReticleEl(
  role: 'A' | 'B',
  coord: [number, number],
  telemetry: EndpointDemTelemetry | null,
  otherTelemetry: EndpointDemTelemetry | null,
  animateAppear: boolean,
  onSelectPoint: () => void
): HTMLDivElement {
  const color = role === 'A' ? '#5E9C76' : '#C44D2B';
  const badgeTag = role === 'A' ? 'POINT A · START' : 'POINT B · TARGET';

  const root = document.createElement('div');
  root.className = `relative w-9 h-9 select-none cursor-grab active:cursor-grabbing ${
    animateAppear ? 'mp-marker-appear' : ''
  }`;

  // Clean scientific concentric reticle (no giant pin)
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('width', '36');
  svg.setAttribute('height', '36');
  svg.style.display = 'block';

  const paths = [
    'M18 3 V10',
    'M18 26 V33',
    'M3 18 H10',
    'M26 18 H33',
  ];
  for (const d of paths) {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', '1.4');
    svg.appendChild(p);
  }

  const outerRing = document.createElementNS(svgNS, 'circle');
  outerRing.setAttribute('cx', '18');
  outerRing.setAttribute('cy', '18');
  outerRing.setAttribute('r', '9.5');
  outerRing.setAttribute('fill', '#07080A');
  outerRing.setAttribute('fill-opacity', '0.55');
  outerRing.setAttribute('stroke', '#F7F3EB');
  outerRing.setAttribute('stroke-width', '1.2');
  svg.appendChild(outerRing);

  const midRing = document.createElementNS(svgNS, 'circle');
  midRing.setAttribute('cx', '18');
  midRing.setAttribute('cy', '18');
  midRing.setAttribute('r', '5.5');
  midRing.setAttribute('fill', 'none');
  midRing.setAttribute('stroke', color);
  midRing.setAttribute('stroke-width', '1.2');
  svg.appendChild(midRing);

  const coreDot = document.createElementNS(svgNS, 'circle');
  coreDot.setAttribute('cx', '18');
  coreDot.setAttribute('cy', '18');
  coreDot.setAttribute('r', '2.1');
  coreDot.setAttribute('fill', color);
  svg.appendChild(coreDot);

  root.appendChild(svg);

  // Stacked scientific marker label (◎ A START / ◎ B TARGET)
  const badgeBtn = document.createElement('button');
  badgeBtn.type = 'button';
  badgeBtn.title = `Click to inspect ${badgeTag} telemetry or drag reticle`;
  badgeBtn.className = `absolute left-1/2 -translate-x-1/2 ${
    role === 'A' ? 'top-full mt-0.5' : 'bottom-full mb-0.5'
  } flex flex-col items-center pointer-events-auto cursor-pointer`;
  badgeBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onSelectPoint();
  });

  const letterSpan = document.createElement('span');
  letterSpan.style.color = color;
  letterSpan.className = 'text-[11px] font-bold font-telemetry leading-none tracking-wider';
  letterSpan.textContent = role;
  badgeBtn.appendChild(letterSpan);

  const roleBadge = document.createElement('span');
  roleBadge.className = 'text-[8px] font-semibold font-telemetry tracking-widest text-[#F7F3EB] uppercase leading-none bg-[#07080A]/90 px-1 py-0.5 border mt-0.5 whitespace-nowrap shadow-sm';
  roleBadge.style.borderColor = color;
  roleBadge.textContent = role === 'A' ? 'START' : 'TARGET';
  badgeBtn.appendChild(roleBadge);

  root.appendChild(badgeBtn);

  const metricRow = document.createElement('div');
  metricRow.className = 'text-[9px] font-telemetry text-[#9D968A] mt-0.5 whitespace-nowrap tabular-nums bg-[#0B0D10]/80 px-1 rounded-[1px] border border-[#242832]';
  if (telemetry?.loading) {
    metricRow.textContent = 'Sampling…';
  } else if (telemetry?.elevationM != null) {
    const slopeTxt =
      telemetry.localSlopeDeg != null ? ` · ${telemetry.localSlopeDeg.toFixed(1)}°` : '';
    metricRow.textContent = `${telemetry.elevationM.toFixed(0)}m${slopeTxt}`;
  } else {
    metricRow.textContent = `${formatMarsCoord(coord[0], coord[1], 2)}`;
  }
  badgeBtn.appendChild(metricRow);

  return root;
}

function buildMidpointEl(
  distM: number,
  bearingDeg: number,
  ptAData: EndpointDemTelemetry | null,
  ptBData: EndpointDemTelemetry | null,
  stateLabel: string
): HTMLDivElement {
  const el = document.createElement('div');
  el.className =
    'bg-[#0B0D10] border border-[#D4B483] px-2 py-0.5 text-[10px] font-telemetry text-[#F7F3EB] whitespace-nowrap tabular-nums pointer-events-none';
  const distStr = distM >= 1000 ? `${(distM / 1000).toFixed(2)} km` : `${distM.toFixed(0)} m`;
  let txt = `A → B · ${distStr} · ${bearingDeg.toFixed(0)}°`;
  if (ptAData?.elevationM != null && ptBData?.elevationM != null) {
    const dz = ptBData.elevationM - ptAData.elevationM;
    txt += ` · ΔZ ${dz >= 0 ? '+' : ''}${dz.toFixed(0)}m`;
  }
  txt += ` · ${stateLabel}`;
  el.textContent = txt;
  return el;
}

export const MarsFieldMap: React.FC<MarsFieldMapProps> = ({
  targets,
  convergenceGrid,
  geologyGeoJson,
  dunesGeoJson,
  spectralPoints,
  frtFootprints,
  traverseGeoJson,
  observations,
  routeAnalysis,
  demPreviewGeoJson,
  onRunAnalysis,
  onClearAnalysis,
}) => {
  const rootContainerRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const compareContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const compareMapRef = useRef<maplibregl.Map | null>(null);
  const hoveredMarkerRef = useRef<maplibregl.Marker | null>(null);
  const pointAMarkerRef = useRef<maplibregl.Marker | null>(null);
  const pointBMarkerRef = useRef<maplibregl.Marker | null>(null);
  const midpointMarkerRef = useRef<maplibregl.Marker | null>(null);

  const {
    lat,
    lon,
    zoom,
    bearing,
    pitch,
    cameraSeq,
    activeLayers,
    layerOpacity,
    selectedTargetId,
    selectedRouteId,
    compareRouteBId,
    pointAData,
    pointBData,
    selectedObservationId,
    selectedObservationSol,
    compareMode,
    compareLayerB,
    measureMode,
    measureVariant,
    activeTool,
    hoveredProfileCoord,
    hoveredProfileIdx,
    hoveredProfileRouteId,
    pickingRoutePoint,
    customRouteStart,
    customRouteEnd,
    routeStage,
    pointInspectorSide,
    showAllRoutes,
    sideBySideCompare,
    setCamera,
    syncCameraFromMap,
    setHoverCoord,
    setHoveredProfile,
    setPointProbe,
    selectTarget,
    selectRoute,
    selectObservation,
    setCompareRouteBId,
    setCompareMode,
    setMeasureMode,
    setCustomRouteStart,
    setCustomRouteEnd,
    setPickingRoutePoint,
    setPointInspectorSide,
    swapRoutePoints,
    clearRoutePoints,
    setShowAllRoutes,
    toggleSideBySideCompare,
    setBottomTrayOpen,
  } = usePlanetStore();

  const lastAnimPairRef = useRef<string | null>(null);
  const prevPtARef = useRef<string | null>(null);
  const prevPtBRef = useRef<string | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [compareLoaded, setCompareLoaded] = useState(false);
  const [splitPct, setSplitPct] = useState(50);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<Array<[number, number]>>([]);
  const [measureTelemetries, setMeasureTelemetries] = useState<
    Array<{ elevationM: number | null; localSlopeDeg: number | null; loading: boolean }>
  >([]);

  // Animated dashed lines across everything (connect-sightline, routes-compare, measure-line)
  // Throttled + quantized: mutating line-dasharray every frame forces a new dash-texture
  // upload per frame and can crash MapLibre's paint pass ("setConstantDashPositions" null).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    let t = 0;
    const quantize = (v: number) => Math.round(v * 2) / 2;
    const id = window.setInterval(() => {
      t += 0.55;
      try {
        const phaseA = [quantize(4 + Math.sin(t) * 2.5), quantize(4 - Math.sin(t) * 2.5)];
        const phaseB = [quantize(6 + Math.cos(t) * 3), quantize(2 - Math.cos(t) * 1.5)];
        const phaseC = [quantize(3 + Math.sin(t * 1.5) * 2), quantize(3 - Math.sin(t * 1.5) * 2)];

        if (map.getLayer('connect-sightline')) {
          map.setPaintProperty('connect-sightline', 'line-dasharray', phaseA as never);
        }
        if (map.getLayer('routes-compare')) {
          map.setPaintProperty('routes-compare', 'line-dasharray', phaseB as never);
        }
        if (map.getLayer('measure-line')) {
          map.setPaintProperty('measure-line', 'line-dasharray', phaseC as never);
        }
      } catch {
        // Dash pattern atlas race — skip this tick.
      }
    }, 140);
    return () => window.clearInterval(id);
  }, [mapLoaded]);

  // Fetch 1m DEM point telemetry for each measure point
  useEffect(() => {
    if (measurePoints.length === 0) {
      setMeasureTelemetries([]);
      return;
    }
    const initial = measurePoints.map((_, i) => measureTelemetries[i] ?? { elevationM: null, localSlopeDeg: null, loading: true });
    setMeasureTelemetries(initial);

    measurePoints.forEach((pt, i) => {
      if (measureTelemetries[i]?.elevationM != null && !measureTelemetries[i].loading) return;
      apiClient
        .getTerrainPoint(pt[0], pt[1])
        .then((res) => {
          setMeasureTelemetries((prev) => {
            const next = [...prev];
            next[i] = { elevationM: res.elevationM, localSlopeDeg: res.localSlopeDeg, loading: false };
            return next;
          });
        })
        .catch(() => {
          setMeasureTelemetries((prev) => {
            const next = [...prev];
            next[i] = { elevationM: null, localSlopeDeg: null, loading: false };
            return next;
          });
        });
    });
  }, [measurePoints]);

  const measureModeRef = useRef(measureMode);
  measureModeRef.current = measureMode;
  const measureVariantRef = useRef(measureVariant);
  measureVariantRef.current = measureVariant;
  const pickingPointRef = useRef(pickingRoutePoint);
  pickingPointRef.current = pickingRoutePoint;
  const customStartRef = useRef(customRouteStart);
  customStartRef.current = customRouteStart;
  const customEndRef = useRef(customRouteEnd);
  customEndRef.current = customRouteEnd;
  const routeAnalysisRef = useRef(routeAnalysis);
  routeAnalysisRef.current = routeAnalysis;
  const lastHandledSeqRef = useRef(cameraSeq);

  // Initialize primary MapLibre map once
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    ensureMaplibreWorkerUrl();
    ensureTrekProtocol();

    const map = new maplibregl.Map({
      container: el,
      style: createBaseMapStyle(),
      center: [lon, lat],
      zoom,
      bearing,
      pitch,
      maxPitch: 62,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    // Dev-only debug handle for automated browser verification of layer state.
    if (import.meta.env.DEV) {
      (window as unknown as { __mpMap?: maplibregl.Map }).__mpMap = map;
    }

    map.on('load', () => {
      const emptyFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

      map.addSource('geology-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'geology-fill',
        type: 'fill',
        source: 'geology-src',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#D98A4E', 'fill-opacity': 0.2 },
      });
      map.addLayer({
        id: 'geology-outline',
        type: 'line',
        source: 'geology-src',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#D98A4E', 'line-width': 1.2 },
      });

      map.addSource('convergence-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'convergence-fill',
        type: 'fill',
        source: 'convergence-src',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'evidenceCount'],
            1, '#2D3A4A',
            2, '#476A8A',
            3, '#D4B483',
            4, '#D98A4E',
          ],
          'fill-opacity': 0.18,
        },
      });

      map.addSource('dunes-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'dunes-fill',
        type: 'fill',
        source: 'dunes-src',
        paint: { 'fill-color': '#C44D2B', 'fill-opacity': 0.28 },
      });
      map.addLayer({
        id: 'dunes-outline',
        type: 'line',
        source: 'dunes-src',
        paint: { 'line-color': '#C44D2B', 'line-width': 1.2, 'line-dasharray': [2, 2] },
      });

      map.addSource('hazards-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'hazards-fill',
        type: 'fill',
        source: 'hazards-src',
        paint: {
          'fill-color': [
            'match',
            ['get', 'severity'],
            'NO_DATA', '#525866',
            'SAND_DUNE', '#9E3B20',
            'HIGH_SLOPE', '#C44D2B',
            '#D98A4E',
          ],
          'fill-opacity': 0.34,
        },
      });

      map.addSource('frt-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'frt-outline',
        type: 'line',
        source: 'frt-src',
        paint: { 'line-color': '#5B8BB4', 'line-width': 1.1, 'line-opacity': 0.68 },
      });

      map.addSource('spectral-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'spectral-pts',
        type: 'circle',
        source: 'spectral-src',
        paint: {
          'circle-radius': 4.5,
          'circle-color': '#5B8BB4',
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#EAE4D9',
        },
      });

      map.addSource('traverse-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'traverse-line',
        type: 'line',
        source: 'traverse-src',
        paint: { 'line-color': '#D4B483', 'line-width': 2.0, 'line-opacity': 0.88 },
      });

      map.addSource('obs-src', {
        type: 'geojson',
        data: emptyFc,
        cluster: true,
        clusterMaxZoom: 13.5,
        clusterRadius: 46,
      });

      map.addLayer({
        id: 'obs-clusters',
        type: 'circle',
        source: 'obs-src',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#111317',
          'circle-radius': ['step', ['get', 'point_count'], 15, 10, 18, 30, 22],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#D4B483',
        },
      });

      map.addLayer({
        id: 'obs-cluster-count',
        type: 'symbol',
        source: 'obs-src',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['to-string', ['get', 'point_count']],
          'text-size': 11,
        },
        paint: {
          'text-color': '#EAE4D9',
        },
      });

      map.addLayer({
        id: 'obs-pts',
        type: 'circle',
        source: 'obs-src',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['case', ['==', ['get', 'highlighted'], true], 6.5, 4],
          'circle-color': ['case', ['==', ['get', 'highlighted'], true], '#F7F3EB', '#D4B483'],
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#07080A',
        },
      });

      // Direct geodesic sightline connecting Point A <-> Point B (and cursor tether)
      map.addSource('connect-line-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'connect-sightline-casing',
        type: 'line',
        source: 'connect-line-src',
        paint: {
          'line-color': '#07080A',
          'line-width': 3.4,
          'line-opacity': 0.72,
        },
      });
      map.addLayer({
        id: 'connect-sightline',
        type: 'line',
        source: 'connect-line-src',
        paint: {
          'line-color': '#D4B483',
          'line-width': 1.6,
          'line-dasharray': [4, 4],
          'line-opacity': 0.88,
        },
      });

      // Candidate roads: background alternatives + highlighted Line 2 (compare) + primary Line 1 (selected)
      map.addSource('routes-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'routes-alt-casing',
        type: 'line',
        source: 'routes-src',
        filter: ['all', ['!=', ['get', 'selected'], true], ['!=', ['get', 'compared'], true]],
        paint: {
          'line-color': '#07080A',
          'line-width': 3.8,
          'line-opacity': 0.68,
        },
      });
      map.addLayer({
        id: 'routes-alt',
        type: 'line',
        source: 'routes-src',
        filter: ['all', ['!=', ['get', 'selected'], true], ['!=', ['get', 'compared'], true]],
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#8B95A5'],
          'line-width': 2.1,
          'line-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'routes-compare-casing',
        type: 'line',
        source: 'routes-src',
        filter: ['==', ['get', 'compared'], true],
        paint: {
          'line-color': '#07080A',
          'line-width': 6.0,
          'line-opacity': 0.88,
        },
      });
      map.addLayer({
        id: 'routes-compare',
        type: 'line',
        source: 'routes-src',
        filter: ['==', ['get', 'compared'], true],
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#5B8BB4'],
          'line-width': 3.2,
          'line-dasharray': [5, 2.5],
          'line-opacity': 0.96,
        },
      });
      map.addLayer({
        id: 'routes-selected-casing',
        type: 'line',
        source: 'routes-src',
        filter: ['==', ['get', 'selected'], true],
        paint: { 'line-color': '#07080A', 'line-width': 6.8 },
      });
      map.addLayer({
        id: 'routes-selected',
        type: 'line',
        source: 'routes-src',
        filter: ['==', ['get', 'selected'], true],
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#F7F3EB'],
          'line-width': 3.8,
        },
      });

      map.addSource('route-arrows-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'routes-selected-arrows',
        type: 'symbol',
        source: 'route-arrows-src',
        layout: {
          'text-field': '›',
          'text-size': 16,
          'text-rotate': ['get', 'bearing'],
          'text-rotation-alignment': 'map',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#F7F3EB',
          'text-halo-color': '#07080A',
          'text-halo-width': 1.2,
        },
      });

      map.addSource('waypoints-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'waypoints-pts',
        type: 'circle',
        source: 'waypoints-src',
        paint: {
          'circle-radius': 4,
          'circle-color': '#D98A4E',
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#07080A',
        },
      });

      // Traversed-so-far trail: brightens the route portion up to the currently
      // hovered elevation-profile position (driven by profile scrub or route hover)
      map.addSource('routes-progress-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'routes-progress',
        type: 'line',
        source: 'routes-progress-src',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#F7F3EB',
          'line-width': 4.2,
          'line-opacity': 0.92,
        },
      });

      // Base geojson anchor dots under draggable HTML precision reticles
      map.addSource('connect-pts-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'connect-pts-dot',
        type: 'circle',
        source: 'connect-pts-src',
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#07080A',
        },
      });

      map.addSource('targets-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'targets-ring',
        type: 'circle',
        source: 'targets-src',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'selected'], true], 12, 8.5],
          'circle-color': 'transparent',
          'circle-stroke-width': 1.8,
          'circle-stroke-color': ['case', ['==', ['get', 'selected'], true], '#F7F3EB', '#C44D2B'],
        },
      });
      map.addLayer({
        id: 'targets-dot',
        type: 'circle',
        source: 'targets-src',
        paint: {
          'circle-radius': 4,
          'circle-color': '#C44D2B',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#F7F3EB',
        },
      });
      map.addLayer({
        id: 'targets-label',
        type: 'symbol',
        source: 'targets-src',
        minzoom: 11.4,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, 1.35],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#F7F3EB',
          'text-halo-color': '#07080A',
          'text-halo-width': 1.5,
        },
      });

      // Zoom-progressive Mars surface labels (Far -> Regional -> Corridor)
      map.addSource('mars-labels-src', {
        type: 'geojson',
        data: PROGRESSIVE_MARS_LABELS,
      });
      map.addLayer({
        id: 'mars-labels-far',
        type: 'symbol',
        source: 'mars-labels-src',
        filter: ['==', ['get', 'tier'], 'FAR'],
        maxzoom: 6.2,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 13,
          'text-letter-spacing': 0.14,
        },
        paint: {
          'text-color': '#D4B483',
          'text-halo-color': '#07080A',
          'text-halo-width': 1.6,
        },
      });
      map.addLayer({
        id: 'mars-labels-regional',
        type: 'symbol',
        source: 'mars-labels-src',
        filter: ['==', ['get', 'tier'], 'REGIONAL'],
        minzoom: 5.5,
        maxzoom: 11.6,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-letter-spacing': 0.1,
        },
        paint: {
          'text-color': '#EAE4D9',
          'text-halo-color': '#07080A',
          'text-halo-width': 1.6,
        },
      });
      map.addLayer({
        id: 'mars-labels-corridor',
        type: 'symbol',
        source: 'mars-labels-src',
        filter: ['==', ['get', 'tier'], 'CORRIDOR'],
        minzoom: 10.6,
        maxzoom: 15.2,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 10.5,
          'text-letter-spacing': 0.08,
        },
        paint: {
          'text-color': '#D4B483',
          'text-opacity': 0.85,
          'text-halo-color': '#07080A',
          'text-halo-width': 1.5,
        },
      });

      map.addSource('measure-src', { type: 'geojson', data: emptyFc });
      map.addLayer({
        id: 'measure-line',
        type: 'line',
        source: 'measure-src',
        paint: { 'line-color': '#D4B483', 'line-width': 1.8, 'line-dasharray': [2, 2] },
      });
      map.addLayer({
        id: 'measure-pts',
        type: 'circle',
        source: 'measure-src',
        paint: {
          'circle-radius': 4,
          'circle-color': '#D4B483',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#07080A',
        },
      });

      map.on('click', 'obs-clusters', async (e: maplibregl.MapLayerMouseEvent) => {
        if (pickingPointRef.current || measureModeRef.current) return;
        const feat = e.features?.[0];
        const clusterId = feat?.properties?.cluster_id;
        const coords = (feat?.geometry as GeoJSON.Point | undefined)?.coordinates;
        if (clusterId == null || !coords) return;
        const src = map.getSource('obs-src') as maplibregl.GeoJSONSource | undefined;
        if (!src) return;
        try {
          const expansionZoom = await src.getClusterExpansionZoom(Number(clusterId));
          map.easeTo({
            center: [coords[0], coords[1]],
            zoom: Math.min(16, expansionZoom + 0.5),
            duration: 450,
          });
        } catch {
          map.easeTo({
            center: [coords[0], coords[1]],
            zoom: map.getZoom() + 1.5,
            duration: 450,
          });
        }
      });

      map.on('click', 'obs-pts', (e: maplibregl.MapLayerMouseEvent) => {
        if (pickingPointRef.current || measureModeRef.current) return;
        const feat = e.features?.[0];
        const obsId = feat?.properties?.id;
        const obsSol = feat?.properties?.sol;
        if (obsId) {
          selectObservation(String(obsId), obsSol != null ? Number(obsSol) : null);
        }
      });

      map.on('click', 'targets-ring', (e: maplibregl.MapLayerMouseEvent) => {
        if (pickingPointRef.current || measureModeRef.current) return;
        const tid = e.features?.[0]?.properties?.id;
        if (tid) {
          selectTarget(String(tid));
        }
      });

      map.on('click', 'routes-alt', (e: maplibregl.MapLayerMouseEvent) => {
        if (pickingPointRef.current || measureModeRef.current) return;
        const rid = e.features?.[0]?.properties?.id;
        if (rid) selectRoute(String(rid));
      });

      map.on('click', 'routes-compare', (e: maplibregl.MapLayerMouseEvent) => {
        if (pickingPointRef.current || measureModeRef.current) return;
        const rid = e.features?.[0]?.properties?.id;
        if (rid) selectRoute(String(rid));
      });

      map.on('click', 'routes-selected', (e: maplibregl.MapLayerMouseEvent) => {
        if (pickingPointRef.current || measureModeRef.current) return;
        const rid = e.features?.[0]?.properties?.id;
        if (rid) selectRoute(String(rid));
      });

      const pointerLayers = [
        'targets-ring',
        'routes-alt',
        'routes-compare',
        'routes-selected',
        'obs-clusters',
        'obs-pts',
      ];
      pointerLayers.forEach((lyr) => {
        map.on('mouseenter', lyr, () => {
          map.getCanvas().style.cursor =
            measureModeRef.current || pickingPointRef.current ? 'crosshair' : 'pointer';
        });
        map.on('mouseleave', lyr, () => {
          map.getCanvas().style.cursor =
            measureModeRef.current || pickingPointRef.current ? 'crosshair' : '';
        });
      });

      // Route hover → elevation-profile scrub sync (Map ↔ Profile visual link).
      // Geometry vertex i corresponds exactly to elevation-profile sample i:
      // segments[i].from = geometry.coordinates[i], segments[i].to = coordinates[i+1].
      const routeHoverLayers = ['routes-alt', 'routes-compare', 'routes-selected'];
      routeHoverLayers.forEach((lyr) => {
        map.on('mousemove', lyr, (e: maplibregl.MapLayerMouseEvent) => {
          if (pickingPointRef.current || measureModeRef.current) return;
          const analysis = routeAnalysisRef.current;
          if (!analysis) return;
          const rid = e.features?.[0]?.properties?.id;
          if (typeof rid !== 'string') return;
          const cand = analysis.candidates.find((c) => c.id === rid && c.feasible && c.geometry);
          if (!cand || !cand.geometry) return;
          const coords = cand.geometry.coordinates;
          if (coords.length === 0) return;
          const lng = e.lngLat.lng;
          const lat = e.lngLat.lat;
          let best = 0;
          let bestD = Infinity;
          for (let i = 0; i < coords.length; i++) {
            const dx = coords[i][0] - lng;
            const dy = coords[i][1] - lat;
            const d = dx * dx + dy * dy;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          setHoveredProfile({ coord: [coords[best][0], coords[best][1]], idx: best, routeId: cand.id });
        });
        map.on('mouseleave', lyr, () => {
          if (pickingPointRef.current || measureModeRef.current) return;
          setHoveredProfile(null);
        });
      });

      setMapLoaded(true);
    });

    map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
      setHoverCoord([e.lngLat.lng, e.lngLat.lat]);
      // Live rubber-band tether when picking Point B after Point A is placed
      if (pickingPointRef.current === 'B' && customStartRef.current) {
        const src = map.getSource('connect-line-src') as maplibregl.GeoJSONSource | undefined;
        src?.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [customStartRef.current, [e.lngLat.lng, e.lngLat.lat]],
              },
            },
          ],
        });
      }
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      syncCameraFromMap({
        lon: c.lng,
        lat: c.lat,
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
    });

    map.on('click', async (e: maplibregl.MapMouseEvent) => {
      const pt: [number, number] = [
        Number(e.lngLat.lng.toFixed(5)),
        Number(e.lngLat.lat.toFixed(5)),
      ];

      // Handle 2-Point placement / Start-End picking cleanly even near targets
      const pickMode = pickingPointRef.current;
      if (pickMode === 'AB' || pickMode === 'A') {
        setCustomRouteStart(pt);
        return;
      }
      if (pickMode === 'B') {
        setCustomRouteEnd(pt);
        return;
      }

      if (measureModeRef.current) {
        if (measureVariantRef.current === 'DISTANCE') {
          setMeasurePoints((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
        } else {
          setMeasurePoints((prev) => [...prev, pt]);
        }
        return;
      }

      const hits = map.queryRenderedFeatures(e.point, {
        layers: [
          'targets-ring',
          'routes-alt',
          'routes-compare',
          'routes-selected',
          'obs-clusters',
          'obs-pts',
        ].filter((id) => Boolean(map.getLayer(id))),
      });
      if (hits.length > 0) {
        return;
      }

      setPointProbe({
        lon: pt[0],
        lat: pt[1],
        elevationM: null,
        localSlopeDeg: null,
        dataStatus: 'Sampling DEM',
        resolution: 'Gale_DEM_SMG_1m / MOLA',
        loading: true,
      });
      try {
        const res = await apiClient.getTerrainPoint(pt[0], pt[1]);
        setPointProbe({
          lon: res.lon,
          lat: res.lat,
          elevationM: res.elevationM,
          localSlopeDeg: res.localSlopeDeg,
          dataStatus: res.dataStatus,
          resolution: res.resolution,
          loading: false,
        });
      } catch {
        setPointProbe({
          lon: pt[0],
          lat: pt[1],
          elevationM: null,
          localSlopeDeg: null,
          dataStatus: 'DATA UNAVAILABLE',
          resolution: 'Upstream unreachable',
          loading: false,
        });
      }
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.resize();
      compareMapRef.current?.resize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      pointAMarkerRef.current?.remove();
      pointAMarkerRef.current = null;
      pointBMarkerRef.current?.remove();
      pointBMarkerRef.current = null;
      midpointMarkerRef.current?.remove();
      midpointMarkerRef.current = null;
      setMapLoaded(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Cursor state for measure, inspect, & point-pick modes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const useCrosshair = Boolean(measureMode || pickingRoutePoint || activeTool === 'INSPECT_COORD');
    map.getCanvas().style.cursor = useCrosshair ? 'crosshair' : '';
    if (!measureMode) {
      setMeasurePoints([]);
    }
  }, [measureMode, pickingRoutePoint, activeTool]);

  // Deterministic camera command listener
  useEffect(() => {
    const map = mapRef.current;
    if (!map || cameraSeq === lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = cameraSeq;
    map.flyTo({
      center: [lon, lat],
      zoom,
      bearing,
      pitch,
      duration: 620,
      essential: true,
    });
  }, [cameraSeq, lat, lon, zoom, bearing, pitch]);

  // Split Compare Map Lifecycle
  useEffect(() => {
    const el = compareContainerRef.current;
    const primary = mapRef.current;
    if (!compareMode || !el || !primary) {
      setCompareLoaded(false);
      if (compareMapRef.current) {
        compareMapRef.current.remove();
        compareMapRef.current = null;
      }
      return;
    }

    ensureTrekProtocol();
    const cmp = new maplibregl.Map({
      container: el,
      style: createBaseMapStyle(),
      center: primary.getCenter(),
      zoom: primary.getZoom(),
      bearing: primary.getBearing(),
      pitch: primary.getPitch(),
      interactive: false,
      attributionControl: false,
    });

    cmp.on('load', () => {
      setCompareLoaded(true);
    });

    const syncMove = () => {
      cmp.jumpTo({
        center: primary.getCenter(),
        zoom: primary.getZoom(),
        bearing: primary.getBearing(),
        pitch: primary.getPitch(),
      });
    };
    primary.on('move', syncMove);
    compareMapRef.current = cmp;

    return () => {
      primary.off('move', syncMove);
      setCompareLoaded(false);
      cmp.remove();
      compareMapRef.current = null;
    };
  }, [compareMode]);

  useEffect(() => {
    const cmp = compareMapRef.current;
    if (!cmp || !compareLoaded) return;
    for (const dsId of Object.keys(RASTER_LAYER_META)) {
      const layerId = `raster-${dsId}`;
      if (!cmp.getLayer(layerId)) continue;
      const isRight = dsId === compareLayerB;
      cmp.setLayoutProperty(layerId, 'visibility', isRight ? 'visible' : 'none');
      if (isRight) {
        cmp.setPaintProperty(layerId, 'raster-opacity', 0.94);
      }
    }
  }, [compareLoaded, compareLayerB]);

  useEffect(() => {
    if (!draggingSplit) return;
    const updateFromClientX = (clientX: number) => {
      const box = rootContainerRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0) return;
      const rawPct = ((clientX - box.left) / box.width) * 100;
      setSplitPct(Math.round(Math.max(5, Math.min(95, rawPct))));
    };
    const onMove = (e: PointerEvent) => updateFromClientX(e.clientX);
    const onUp = () => setDraggingSplit(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [draggingSplit]);

  // Raster + Vector layer visibility & opacity synchronization
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    for (const dsId of Object.keys(RASTER_LAYER_META)) {
      const layerId = `raster-${dsId}`;
      if (!map.getLayer(layerId)) continue;
      const visible = activeLayers.includes(dsId);
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      if (visible) {
        map.setPaintProperty(layerId, 'raster-opacity', layerOpacity[dsId] ?? 0.85);
      }
    }

    const setVis = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    };
    const showObs = activeLayers.includes('msl-rover-observations');
    const showGeo = activeLayers.includes('usgs-sim3292-geo');
    const showDunes = activeLayers.includes('trek-dune-fields');
    const showSpec = activeLayers.includes('trek-crism-spectral');
    const showDem = activeLayers.includes('trek-gale-dem-1m') || Boolean(routeAnalysis);

    setVis('geology-fill', showGeo);
    setVis('geology-outline', showGeo);
    if (showGeo && map.getLayer('geology-fill')) {
      const geoOp = layerOpacity['usgs-sim3292-geo'] ?? 0.45;
      map.setPaintProperty('geology-fill', 'fill-opacity', Math.min(0.45, geoOp * 0.45));
    }

    setVis('dunes-fill', showDunes);
    setVis('dunes-outline', showDunes);
    if (showDunes && map.getLayer('dunes-fill')) {
      const duneOp = layerOpacity['trek-dune-fields'] ?? 0.65;
      map.setPaintProperty('dunes-fill', 'fill-opacity', duneOp * 0.42);
    }

    setVis('spectral-pts', showSpec);
    setVis('frt-outline', showSpec);
    setVis('traverse-line', showObs);
    setVis('obs-clusters', showObs);
    setVis('obs-cluster-count', showObs);
    setVis('obs-pts', showObs);

    setVis('hazards-fill', showDem);
    if (showDem && map.getLayer('hazards-fill')) {
      const demOp = layerOpacity['trek-gale-dem-1m'] ?? 0.75;
      map.setPaintProperty('hazards-fill', 'fill-opacity', Math.min(0.65, demOp * 0.48));
    }

    // 2 Highlighted Lines / Side-by-Side Comparison Mode vs All-5 Roads + Stale Visual Subdual
    const isStale = routeStage === 'STALE';
    const isolateDual = sideBySideCompare || !showAllRoutes;
    if (map.getLayer('routes-alt')) {
      map.setPaintProperty(
        'routes-alt',
        'line-opacity',
        isolateDual ? 0 : isStale ? 0.16 : 0.48
      );
    }
    if (map.getLayer('routes-alt-casing')) {
      map.setPaintProperty(
        'routes-alt-casing',
        'line-opacity',
        isolateDual ? 0 : isStale ? 0.14 : 0.4
      );
    }
    if (map.getLayer('routes-selected')) {
      map.setPaintProperty('routes-selected', 'line-opacity', isStale ? 0.36 : 0.98);
      map.setPaintProperty('routes-selected', 'line-width', sideBySideCompare ? 4.2 : 3.8);
      map.setPaintProperty('routes-selected', 'line-offset', sideBySideCompare ? -1.6 : 0);
    }
    if (map.getLayer('routes-selected-casing')) {
      map.setPaintProperty('routes-selected-casing', 'line-offset', sideBySideCompare ? -1.6 : 0);
    }
    if (map.getLayer('routes-compare')) {
      map.setPaintProperty(
        'routes-compare',
        'line-opacity',
        isStale ? 0.3 : sideBySideCompare ? 0.96 : 0.9
      );
      map.setPaintProperty('routes-compare', 'line-width', sideBySideCompare ? 3.8 : 3.2);
      map.setPaintProperty('routes-compare', 'line-offset', sideBySideCompare ? 2.0 : 0);
    }
    if (map.getLayer('routes-compare-casing')) {
      map.setPaintProperty('routes-compare-casing', 'line-offset', sideBySideCompare ? 2.0 : 0);
    }
  }, [mapLoaded, activeLayers, layerOpacity, routeAnalysis, showAllRoutes, sideBySideCompare, routeStage]);

  // Progressive candidate-route reveal: when a fresh terrain analysis lands, the selected
  // traverse draws first, then alternatives appear, then the comparison line — so the map
  // reads as the system thinking spatially rather than everything popping in at once.
  // Targets mirror the paint-state effect above so toggles made mid-animation still converge.
  const lastRevealSigRef = useRef<string | null>(null);
  const revealFadesRef = useRef<Array<number>>([]);
  const revealInFlightRef = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const sig = routeAnalysis
      ? routeAnalysis.runId ??
        `${routeAnalysis.start[0]},${routeAnalysis.start[1]}->${routeAnalysis.end[0]},${routeAnalysis.end[1]}`
      : null;
    if (!sig) return;
    if (
      !map.getLayer('routes-selected') ||
      !map.getLayer('routes-alt') ||
      !map.getLayer('routes-compare')
    ) {
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // Same analysis re-running through this effect (StrictMode double-invoke, re-renders):
    // let an in-flight reveal continue; if none is running, settle exact final opacities.
    if (sig === lastRevealSigRef.current) {
      if (revealInFlightRef.current > 0) return;
      for (const t of liveRevealTargets()) {
        if (map.getLayer(t.layer)) {
          map.setPaintProperty(t.layer, t.prop, t.value);
        }
      }
      return;
    }
    lastRevealSigRef.current = sig;

    for (const raf of revealFadesRef.current) cancelAnimationFrame(raf);
    revealFadesRef.current = [];

    const fadePaint = (
      layer: string,
      prop: 'line-opacity' | 'text-opacity' | 'circle-opacity' | 'circle-stroke-opacity',
      delayMs: number,
      durationMs: number
    ) => {
      if (!map.getLayer(layer)) return;
      revealInFlightRef.current += 1;
      const startAt = performance.now() + delayMs;
      const step = (now: number) => {
        try {
          const target = liveRevealTargets().find((t) => t.layer === layer && t.prop === prop)?.value ?? 1;
          if (now < startAt) {
            map.setPaintProperty(layer, prop, 0);
            revealFadesRef.current.push(requestAnimationFrame(step));
            return;
          }
          const p = Math.min(1, (now - startAt) / durationMs);
          const eased = 1 - Math.pow(1 - p, 3);
          map.setPaintProperty(layer, prop, target * eased);
          if (p < 1) {
            revealFadesRef.current.push(requestAnimationFrame(step));
          } else {
            map.setPaintProperty(layer, prop, target);
            revealInFlightRef.current = Math.max(0, revealInFlightRef.current - 1);
          }
        } catch {
          // Map destroyed mid-animation — stop cleanly.
          revealInFlightRef.current = Math.max(0, revealInFlightRef.current - 1);
        }
      };
      revealFadesRef.current.push(requestAnimationFrame(step));
    };

    // Phase 1 — primary candidate traverse draws (direct chord stays visible underneath)
    fadePaint('routes-selected-casing', 'line-opacity', 0, 300);
    fadePaint('routes-selected', 'line-opacity', 0, 460);
    fadePaint('waypoints-pts', 'circle-opacity', 160, 320);
    fadePaint('waypoints-pts', 'circle-stroke-opacity', 160, 320);
    // Phase 2 — alternative candidates surface
    fadePaint('routes-alt-casing', 'line-opacity', 520, 420);
    fadePaint('routes-alt', 'line-opacity', 520, 420);
    // Phase 3 — direction arrows & comparison line
    fadePaint('routes-selected-arrows', 'text-opacity', 940, 340);
    fadePaint('routes-compare-casing', 'line-opacity', 1020, 340);
    fadePaint('routes-compare', 'line-opacity', 1020, 340);
  }, [mapLoaded, routeAnalysis]);

  // Independent GeoJSON data effects
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !geologyGeoJson) return;
    (map.getSource('geology-src') as maplibregl.GeoJSONSource | undefined)?.setData(geologyGeoJson);
  }, [mapLoaded, geologyGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !dunesGeoJson) return;
    (map.getSource('dunes-src') as maplibregl.GeoJSONSource | undefined)?.setData(dunesGeoJson);
  }, [mapLoaded, dunesGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (spectralPoints) {
      (map.getSource('spectral-src') as maplibregl.GeoJSONSource | undefined)?.setData(spectralPoints);
    }
    if (frtFootprints) {
      (map.getSource('frt-src') as maplibregl.GeoJSONSource | undefined)?.setData(frtFootprints);
    }
  }, [mapLoaded, spectralPoints, frtFootprints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !traverseGeoJson) return;
    (map.getSource('traverse-src') as maplibregl.GeoJSONSource | undefined)?.setData(traverseGeoJson);
  }, [mapLoaded, traverseGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !convergenceGrid) return;
    (map.getSource('convergence-src') as maplibregl.GeoJSONSource | undefined)?.setData(convergenceGrid);
  }, [mapLoaded, convergenceGrid]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const obsFc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: observations
        .filter((o) => o.located && o.coordinates)
        .map((o) => ({
          type: 'Feature',
          properties: {
            id: o.id,
            sol: o.sol,
            highlighted:
              (selectedObservationId !== null && o.id === selectedObservationId) ||
              (selectedObservationSol !== null && o.sol === selectedObservationSol),
          },
          geometry: { type: 'Point', coordinates: o.coordinates! },
        })),
    };
    (map.getSource('obs-src') as maplibregl.GeoJSONSource | undefined)?.setData(obsFc);
  }, [mapLoaded, observations, selectedObservationId, selectedObservationSol]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const targetFc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: targets.map((t) => ({
        type: 'Feature',
        properties: {
          id: t.id,
          label: `#${t.rank} ${t.name.split('(')[0].trim()}`,
          selected: t.id === selectedTargetId,
        },
        geometry: { type: 'Point', coordinates: t.coordinates },
      })),
    };
    (map.getSource('targets-src') as maplibregl.GeoJSONSource | undefined)?.setData(targetFc);
  }, [mapLoaded, targets, selectedTargetId]);

  // Precision Draggable Reticle Markers (Point A, Point B, Midpoint Vector Badge) & Animated Direct Trajectory
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const ptA = customRouteStart ?? routeAnalysis?.start ?? null;
    const ptB = customRouteEnd ?? routeAnalysis?.end ?? null;
    const keyA = ptA ? `${ptA[0]},${ptA[1]}` : null;
    const keyB = ptB ? `${ptB[0]},${ptB[1]}` : null;
    const animateA = keyA !== null && keyA !== prevPtARef.current;
    const animateB = keyB !== null && keyB !== prevPtBRef.current;
    prevPtARef.current = keyA;
    prevPtBRef.current = keyB;

    const ptFeatures: GeoJSON.Feature[] = [];
    if (ptA) {
      ptFeatures.push({
        type: 'Feature',
        properties: { color: '#5E9C76' },
        geometry: { type: 'Point', coordinates: ptA },
      });
    }
    if (ptB) {
      ptFeatures.push({
        type: 'Feature',
        properties: { color: '#C44D2B' },
        geometry: { type: 'Point', coordinates: ptB },
      });
    }
    (map.getSource('connect-pts-src') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: ptFeatures,
    });

    const lineSrc = map.getSource('connect-line-src') as maplibregl.GeoJSONSource | undefined;
    let drawAnimId: number | null = null;
    const pairKey = ptA && ptB ? `${ptA[0]},${ptA[1]}->${ptB[0]},${ptB[1]}` : null;

    if (ptA && ptB && lineSrc) {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reducedMotion && pairKey !== lastAnimPairRef.current) {
        lastAnimPairRef.current = pairKey;
        const startTime = performance.now();
        const duration = 280;
        const stepLine = (now: number) => {
          const p = Math.min(1, (now - startTime) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          const curLon = ptA[0] + (ptB[0] - ptA[0]) * eased;
          const curLat = ptA[1] + (ptB[1] - ptA[1]) * eased;
          lineSrc.setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: [ptA, [curLon, curLat]] },
              },
            ],
          });
          if (p < 1) {
            drawAnimId = requestAnimationFrame(stepLine);
          }
        };
        drawAnimId = requestAnimationFrame(stepLine);
      } else {
        lastAnimPairRef.current = pairKey;
        lineSrc.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: [ptA, ptB] },
            },
          ],
        });
      }
    } else if (lineSrc) {
      lastAnimPairRef.current = null;
      lineSrc.setData({ type: 'FeatureCollection', features: [] });
    }

    // Manage draggable Point A Reticle Marker
    pointAMarkerRef.current?.remove();
    pointAMarkerRef.current = null;
    if (ptA) {
      const elA = buildReticleEl('A', ptA, pointAData, pointBData, animateA, () =>
        setPointInspectorSide('A')
      );
      const markerA = new maplibregl.Marker({
        element: elA,
        anchor: 'center',
        draggable: true,
      })
        .setLngLat(ptA)
        .addTo(map);
      markerA.on('drag', () => {
        const ll = markerA.getLngLat();
        const anchorB = customEndRef.current ?? routeAnalysisRef.current?.end ?? null;
        if (anchorB && lineSrc) {
          lineSrc.setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: [[ll.lng, ll.lat], anchorB] },
              },
            ],
          });
        }
      });
      markerA.on('dragend', () => {
        const ll = markerA.getLngLat();
        const nextA: [number, number] = [Number(ll.lng.toFixed(5)), Number(ll.lat.toFixed(5))];
        const anchorB = customEndRef.current ?? routeAnalysisRef.current?.end ?? null;
        if (!customEndRef.current && anchorB) {
          setCustomRouteEnd(anchorB);
        }
        setCustomRouteStart(nextA);
      });
      pointAMarkerRef.current = markerA;
    }

    // Manage draggable Point B Reticle Marker
    pointBMarkerRef.current?.remove();
    pointBMarkerRef.current = null;
    if (ptB) {
      const elB = buildReticleEl('B', ptB, pointBData, pointAData, animateB, () =>
        setPointInspectorSide('B')
      );
      const markerB = new maplibregl.Marker({
        element: elB,
        anchor: 'center',
        draggable: true,
      })
        .setLngLat(ptB)
        .addTo(map);
      markerB.on('drag', () => {
        const ll = markerB.getLngLat();
        const anchorA = customStartRef.current ?? routeAnalysisRef.current?.start ?? null;
        if (anchorA && lineSrc) {
          lineSrc.setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: [anchorA, [ll.lng, ll.lat]] },
              },
            ],
          });
        }
      });
      markerB.on('dragend', () => {
        const ll = markerB.getLngLat();
        const nextB: [number, number] = [Number(ll.lng.toFixed(5)), Number(ll.lat.toFixed(5))];
        const anchorA = customStartRef.current ?? routeAnalysisRef.current?.start ?? null;
        if (!customStartRef.current && anchorA) {
          setCustomRouteStart(anchorA);
        }
        setCustomRouteEnd(nextB);
      });
      pointBMarkerRef.current = markerB;
    }

    // Manage Midpoint A -> B Vector Badge
    midpointMarkerRef.current?.remove();
    midpointMarkerRef.current = null;
    if (ptA && ptB) {
      const mid: [number, number] = [(ptA[0] + ptB[0]) / 2, (ptA[1] + ptB[1]) / 2];
      const distM = marsDistanceM(ptA, ptB);
      const brg = marsBearingDeg(ptA, ptB);
      const stateTxt =
        routeStage === 'STALE'
          ? 'STALE'
          : routeStage === 'ANALYZING'
            ? 'ANALYZING'
            : routeStage === 'ANALYZED'
              ? 'ANALYZED'
              : 'DIRECT PATH';
      const midEl = buildMidpointEl(distM, brg, pointAData, pointBData, stateTxt);
      midpointMarkerRef.current = new maplibregl.Marker({
        element: midEl,
        anchor: 'center',
      })
        .setLngLat(mid)
        .addTo(map);
    }

    return () => {
      if (drawAnimId !== null) cancelAnimationFrame(drawAnimId);
    };
  }, [
    mapLoaded,
    customRouteStart,
    customRouteEnd,
    routeAnalysis,
    routeStage,
    pointAData,
    pointBData,
    setCustomRouteStart,
    setCustomRouteEnd,
    setPointInspectorSide,
  ]);

  // Candidate routes (Line 1 selected + Line 2 compared + All 5 roads) & DEM hazards
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const emptyFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

    if (routeAnalysis) {
      (map.getSource('hazards-src') as maplibregl.GeoJSONSource | undefined)?.setData(
        routeAnalysis.terrain.hazardGeoJson
      );
      const feasibleCandidates = routeAnalysis.candidates.filter((c) => c.feasible && c.geometry);
      const activeL1Id = feasibleCandidates.some((c) => c.id === selectedRouteId)
        ? selectedRouteId
        : feasibleCandidates[0]?.id ?? null;
      const activeL2Id =
        feasibleCandidates.find((c) => c.id === compareRouteBId && c.id !== activeL1Id)?.id ??
        feasibleCandidates.find((c) => c.id !== activeL1Id)?.id ??
        null;

      const routeFeatures: GeoJSON.Feature[] = feasibleCandidates.map((c) => ({
        type: 'Feature',
        properties: {
          id: c.id,
          preset: c.preset,
          color: getRouteVisual(c.preset).color,
          selected: c.id === activeL1Id,
          compared: c.id === activeL2Id,
        },
        geometry: c.geometry!,
      }));
      (map.getSource('routes-src') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: routeFeatures,
      });

      const activeRoute =
        routeAnalysis.candidates.find((c) => c.id === selectedRouteId) ??
        routeAnalysis.candidates.find((c) => c.feasible);
      const wpFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: (activeRoute?.waypoints ?? []).map((wp) => ({
          type: 'Feature',
          properties: { label: wp.label, slopeDeg: wp.slopeDeg },
          geometry: { type: 'Point', coordinates: wp.coordinates },
        })),
      };
      (map.getSource('waypoints-src') as maplibregl.GeoJSONSource | undefined)?.setData(wpFc);

      const arrowFeatures: GeoJSON.Feature[] = [];
      if (activeRoute?.segments && activeRoute.segments.length > 1) {
        const stride = Math.max(1, Math.floor(activeRoute.segments.length / 6));
        for (let i = 1; i < activeRoute.segments.length; i += stride) {
          const seg = activeRoute.segments[i];
          const midLon = (seg.from[0] + seg.to[0]) / 2;
          const midLat = (seg.from[1] + seg.to[1]) / 2;
          arrowFeatures.push({
            type: 'Feature',
            properties: {
              bearing: marsBearingDeg(seg.from, seg.to) - 90,
            },
            geometry: { type: 'Point', coordinates: [midLon, midLat] },
          });
        }
      }
      (map.getSource('route-arrows-src') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: arrowFeatures,
      });
    } else {
      (map.getSource('hazards-src') as maplibregl.GeoJSONSource | undefined)?.setData(
        demPreviewGeoJson ?? emptyFc
      );
      (map.getSource('routes-src') as maplibregl.GeoJSONSource | undefined)?.setData(emptyFc);
      (map.getSource('waypoints-src') as maplibregl.GeoJSONSource | undefined)?.setData(emptyFc);
      (map.getSource('route-arrows-src') as maplibregl.GeoJSONSource | undefined)?.setData(emptyFc);
    }
  }, [mapLoaded, routeAnalysis, selectedRouteId, compareRouteBId, demPreviewGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const src = map.getSource('measure-src') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const features: GeoJSON.Feature[] = measurePoints.map((pt) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: pt },
    }));
    if (measurePoints.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: measurePoints },
      });
    }
    src.setData({ type: 'FeatureCollection', features });
  }, [mapLoaded, measurePoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!hoveredProfileCoord) {
      hoveredMarkerRef.current?.remove();
      hoveredMarkerRef.current = null;
      return;
    }
    if (!hoveredMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'w-3.5 h-3.5 rounded-full bg-[#F7F3EB] border-2 border-[#C44D2B]';
      hoveredMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(hoveredProfileCoord)
        .addTo(map);
    } else {
      hoveredMarkerRef.current.setLngLat(hoveredProfileCoord);
    }
  }, [hoveredProfileCoord]);

  // Traversed-so-far trail: draw the route portion from the start up to the hovered
  // elevation-profile sample. Geometry vertex i === profile sample i, so slicing the
  // candidate LineString to [0..idx] is exactly the path represented left of the scrub.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const src = map.getSource('routes-progress-src') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const emptyFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

    const idx = hoveredProfileIdx;
    const routeId = hoveredProfileRouteId;
    if (!routeAnalysis || !hoveredProfileCoord || idx === null || !routeId) {
      src.setData(emptyFc);
      return;
    }
    const cand = routeAnalysis.candidates.find(
      (c) => c.id === routeId && c.feasible && c.geometry
    );
    if (!cand || !cand.geometry) {
      src.setData(emptyFc);
      return;
    }
    const coords = cand.geometry.coordinates.slice(0, idx + 1);
    if (coords.length < 2) {
      src.setData(emptyFc);
      return;
    }
    src.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        },
      ],
    });
  }, [
    mapLoaded,
    routeAnalysis,
    hoveredProfileCoord,
    hoveredProfileIdx,
    hoveredProfileRouteId,
  ]);

  const handleZoomBy = useCallback(
    (delta: number) => {
      const map = mapRef.current;
      const curZoom = map ? map.getZoom() : zoom;
      const c = map ? map.getCenter() : { lng: lon, lat };
      setCamera({
        lon: c.lng,
        lat: c.lat,
        zoom: Math.max(2, Math.min(17, Number((curZoom + delta).toFixed(2)))),
      });
    },
    [zoom, lon, lat, setCamera]
  );

  const handleToggle3DPitch = useCallback(() => {
    const map = mapRef.current;
    const curPitch = map ? map.getPitch() : pitch;
    const is3D = curPitch > 12;
    setCamera({
      pitch: is3D ? 0 : 48,
      bearing: is3D ? 0 : -16,
    });
  }, [pitch, setCamera]);

  const handleResetCorridor = useCallback(() => {
    setCamera({
      lon: 137.3889,
      lat: -4.775,
      zoom: 12.2,
      bearing: 0,
      pitch: 0,
    });
  }, [setCamera]);

  // Mouse-free Map Navigation shortcuts (WASD / Arrows pan, +/- zoom, R reset North/pitch)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const st = usePlanetStore.getState();
      if (
        st.mode !== 'FIELD' ||
        st.searchModalOpen ||
        st.briefOpen ||
        st.limitationsOpen ||
        st.shortcutsOpen ||
        st.tourWelcomeOpen ||
        st.tourCompletionModalOpen
      ) {
        return;
      }
      const map = mapRef.current;
      if (!map) return;

      const key = e.key.toLowerCase();
      const panPx = 110;
      if (key === 'w' || e.key === 'ArrowUp') {
        e.preventDefault();
        map.panBy([0, -panPx], { duration: 160 });
      } else if (key === 's' || e.key === 'ArrowDown') {
        e.preventDefault();
        map.panBy([0, panPx], { duration: 160 });
      } else if (key === 'a' || e.key === 'ArrowLeft') {
        e.preventDefault();
        map.panBy([-panPx, 0], { duration: 160 });
      } else if (key === 'd' || e.key === 'ArrowRight') {
        e.preventDefault();
        map.panBy([panPx, 0], { duration: 160 });
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomBy(0.75);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomBy(-0.75);
      } else if (key === 'r') {
        e.preventDefault();
        setCamera({ bearing: 0, pitch: 0 });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleZoomBy, setCamera]);

  let measuredDistM = 0;
  for (let i = 1; i < measurePoints.length; i++) {
    measuredDistM += marsDistanceM(measurePoints[i - 1], measurePoints[i]);
  }
  const lastBearing =
    measurePoints.length >= 2
      ? marsBearingDeg(
          measurePoints[measurePoints.length - 2],
          measurePoints[measurePoints.length - 1]
        )
      : null;

  const compareRightLabel =
    COMPARE_LAYER_OPTIONS.find((o) => o.id === compareLayerB)?.label ?? compareLayerB;
  const is3DView = pitch > 12;

  const directDistM =
    customRouteStart && customRouteEnd
      ? marsDistanceM(customRouteStart, customRouteEnd)
      : routeAnalysis
        ? marsDistanceM(routeAnalysis.start, routeAnalysis.end)
        : null;

  const directBearingDeg =
    customRouteStart && customRouteEnd
      ? marsBearingDeg(customRouteStart, customRouteEnd)
      : routeAnalysis
        ? marsBearingDeg(routeAnalysis.start, routeAnalysis.end)
        : null;

  const inspectedPoint =
    pointInspectorSide === 'A'
      ? {
          side: 'A' as const,
          coord: customRouteStart ?? routeAnalysis?.start ?? null,
          data: pointAData,
        }
      : pointInspectorSide === 'B'
        ? {
            side: 'B' as const,
            coord: customRouteEnd ?? routeAnalysis?.end ?? null,
            data: pointBData,
          }
        : null;

  return (
    <div
      ref={rootContainerRef}
      data-tour="mars-canvas"
      className="relative w-full h-full bg-[#07080A] overflow-hidden"
    >
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {compareMode && (
        <div
          ref={compareContainerRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ clipPath: `inset(0 0 0 ${splitPct}%)` }}
        />
      )}

      {/* Draggable Split Comparison Curtain & HUD Labels */}
      {compareMode && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to adjust split comparison curtain"
            onPointerDown={(e) => {
              e.preventDefault();
              setDraggingSplit(true);
            }}
            className="absolute top-0 bottom-0 z-10 w-0.5 bg-[#D4B483] cursor-ew-resize pointer-events-auto"
            style={{ left: `${splitPct}%` }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 mp-instrument-panel border-[#D4B483] px-2 py-1 text-[10px] font-telemetry text-[#F7F3EB] whitespace-nowrap inline-flex items-center gap-1 select-none">
              <SplitSquareHorizontal className="w-3 h-3 text-[#D4B483]" />
              <span className="tabular-nums">{splitPct}%</span>
            </div>
          </div>

          <div className="pointer-events-none absolute top-14 left-3 z-10 mp-instrument-panel px-2.5 py-1 text-[10px] font-telemetry text-[#D4B483]">
            LEFT · Active Stack ({activeLayers.length} layers)
          </div>
          <div className="pointer-events-none absolute top-14 right-3 z-10 mp-instrument-panel px-2.5 py-1 text-[10px] font-telemetry text-[#5B8BB4]">
            RIGHT · {compareRightLabel}
          </div>
        </>
      )}

      {/* Contextual Active Tool Overlays (shown ONLY when active) */}
      <div className="hidden md:flex absolute top-3 left-3 z-20 flex-col items-start gap-2 pointer-events-none">
        {compareMode && (
          <div className="pointer-events-auto mp-instrument-panel mp-reticle-frame flex items-center gap-2.5 px-3 py-1.5 mp-settle-in">
            <Layers className="w-3.5 h-3.5 text-[#D98A4E]" />
            <span className="text-[10px] font-telemetry text-[#9D968A]">RIGHT LAYER</span>
            <select
              aria-label="Compare right layer"
              value={compareLayerB}
              onChange={(e) => setCompareMode(true, e.target.value)}
              className="bg-[#0B0D10] border border-[#242832] px-2 py-0.5 text-xs text-[#EAE4D9] outline-none cursor-pointer"
            >
              {COMPARE_LAYER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-[#111317]">
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="range"
              aria-label="Compare split position"
              min={5}
              max={95}
              value={splitPct}
              onChange={(e) => setSplitPct(Number(e.target.value))}
              className="mp-range w-24"
            />
            <button
              type="button"
              onClick={() => setSplitPct(50)}
              className="text-[10px] font-telemetry text-[#D4B483] hover:text-[#F7F3EB] cursor-pointer"
            >
              50/50
            </button>
            <button
              type="button"
              aria-label="Exit split comparison"
              onClick={() => setCompareMode(false)}
              className="text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {measureMode && (
          <div className="pointer-events-auto mp-instrument-panel mp-reticle-frame px-3.5 py-2.5 text-xs font-telemetry text-[#EAE4D9] space-y-2 max-w-xs mp-settle-in">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[10px] text-[#D4B483] font-medium">SURFACE MEASURE (1m DEM)</span>
              <button
                type="button"
                aria-label="Exit measure mode"
                onClick={() => {
                  setMeasurePoints([]);
                  setMeasureMode(false);
                }}
                className="text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {measurePoints.length === 0 ? (
              <div className="text-[11px] text-[#9D968A]">Click points on Mars to measure path, distance, elevation &amp; slope.</div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-1">
                    <span className="mp-metric-value text-base text-[#D4B483]">
                      {measuredDistM >= 1000
                        ? (measuredDistM / 1000).toFixed(3)
                        : measuredDistM.toFixed(1)}
                    </span>
                    <span className="mp-metric-unit">
                      {measuredDistM >= 1000 ? 'km' : 'm'}
                    </span>
                  </div>
                  {lastBearing !== null && (
                    <span className="text-[11px] text-[#9D968A] inline-flex items-center gap-1">
                      <Compass className="w-3 h-3" /> {lastBearing.toFixed(1)}°
                    </span>
                  )}
                </div>

                {/* Elevation & ΔZ summary across measure path */}
                {measureTelemetries.length > 0 && measureTelemetries[0]?.elevationM != null && (
                  <div className="bg-[#0B0D10] border border-[#242832] p-2 space-y-1 text-[10px] tabular-nums">
                    {(() => {
                      const firstElev = measureTelemetries[0].elevationM;
                      const lastElev = measureTelemetries[measureTelemetries.length - 1]?.elevationM ?? firstElev;
                      const dz = lastElev - firstElev;
                      const maxSlope = Math.max(0, ...measureTelemetries.map((t) => t.localSlopeDeg ?? 0));
                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-[#9D968A]">Elev Start → End:</span>
                            <span className="text-[#F7F3EB]">
                              {firstElev.toFixed(0)}m → {lastElev.toFixed(0)}m
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[#9D968A]">Net Elevation ΔZ:</span>
                            <span className={dz >= 0 ? 'text-[#D4B483]' : 'text-[#5B8BB4]'}>
                              {dz >= 0 ? '+' : ''}
                              {dz.toFixed(1)} m
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[#9D968A]">Max Local Slope:</span>
                            <span className="text-[#D98A4E]">{maxSlope.toFixed(1)}°</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-[#242832]">
                  <span className="text-[10px] text-[#736D63]">{measurePoints.length} vertices</span>
                  <button
                    type="button"
                    onClick={() => setMeasurePoints([])}
                    className="text-[11px] underline text-[#D98A4E] cursor-pointer"
                  >
                    Clear points
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {pickingRoutePoint && (
          <div className="pointer-events-auto mp-instrument-panel mp-reticle-frame border-[#D98A4E] px-3.5 py-2 text-xs flex items-center gap-3 mp-settle-in">
            <GitFork className="w-4 h-4 text-[#D98A4E] shrink-0" />
            <div>
              <div className="text-[10px] font-telemetry tracking-wider text-[#D4B483]">
                ROUTE PLANNING MODE
              </div>
              <div className="text-xs font-medium text-[#F7F3EB]">
                {pickingRoutePoint === 'AB' || pickingRoutePoint === 'A'
                  ? 'SELECT A STARTING POINT · Click anywhere on Mars for Point A'
                  : 'SELECT A DESTINATION · Click anywhere on Mars for Point B'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPickingRoutePoint(null)}
              className="mp-btn-secondary px-2 py-1 text-[11px] font-telemetry cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Contextual Point A / B Inspector */}
        {inspectedPoint && inspectedPoint.coord && (
          <div className="pointer-events-auto mp-instrument-panel mp-reticle-frame p-2.5 w-64 space-y-1.5 text-[11px] font-telemetry mp-settle-in">
            <div className="flex items-center justify-between gap-2">
              <span
                className={
                  inspectedPoint.side === 'A' ? 'text-[#5E9C76]' : 'text-[#C44D2B]'
                }
              >
                POINT {inspectedPoint.side} · {inspectedPoint.side === 'A' ? 'START' : 'TARGET'}
              </span>
              <button
                type="button"
                aria-label="Close point inspector"
                onClick={() => setPointInspectorSide(null)}
                className="text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 bg-[#0B0D10] border border-[#242832] p-2 tabular-nums">
              <div>
                <div className="text-[9px] text-[#736D63]">ELEVATION</div>
                <div className="text-[#F7F3EB]">
                  {inspectedPoint.data?.loading
                    ? 'Sampling…'
                    : inspectedPoint.data?.elevationM != null
                      ? `${inspectedPoint.data.elevationM.toFixed(1)} m`
                      : 'DATA UNAVAILABLE'}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-[#736D63]">SLOPE</div>
                <div className="text-[#D98A4E]">
                  {inspectedPoint.data?.loading
                    ? '…'
                    : inspectedPoint.data?.localSlopeDeg != null
                      ? `${inspectedPoint.data.localSlopeDeg.toFixed(1)}°`
                      : 'DATA UNAVAILABLE'}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#9D968A]">
              <span>{formatMarsCoord(inspectedPoint.coord[0], inspectedPoint.coord[1], 4)}</span>
              <span
                className={
                  inspectedPoint.data?.elevationM != null ? 'text-[#5E9C76]' : 'text-[#D98A4E]'
                }
              >
                {inspectedPoint.data?.elevationM != null ? 'DATA: AVAILABLE' : 'DATA UNAVAILABLE'}
              </span>
            </div>
          </div>
        )}

        {/* DIRECT PATH HUD Card (before Terrain Analysis or when Stale) */}
        {customRouteStart &&
          customRouteEnd &&
          !pickingRoutePoint &&
          (!routeAnalysis || routeStage === 'DIRECT_READY' || routeStage === 'STALE') &&
          directDistM !== null && (
            <div className="pointer-events-auto mp-instrument-panel mp-reticle-frame border-[#D4B483] p-3 max-w-md space-y-2 mp-settle-in">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-telemetry tracking-wider text-[#D4B483]">
                  {routeStage === 'STALE' ? 'ROUTE NEEDS REANALYSIS' : 'DIRECT PATH · A → B'}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={swapRoutePoints}
                    className="mp-btn-secondary px-2 py-0.5 text-[10px] font-telemetry inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowUpDown className="w-3 h-3 text-[#D4B483]" />
                    <span>Swap A ↔ B</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearRoutePoints();
                      onClearAnalysis?.();
                    }}
                    className="mp-btn-secondary px-2 py-0.5 text-[10px] font-telemetry inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-telemetry tabular-nums text-[#F7F3EB]">
                <span>{(directDistM / 1000).toFixed(2)} km</span>
                {directBearingDeg !== null && (
                  <span className="text-[#9D968A]">{directBearingDeg.toFixed(0)}° azimuth</span>
                )}
                {pointAData?.elevationM != null && pointBData?.elevationM != null && (
                  <span className="text-[#D4B483]">
                    ΔZ {pointBData.elevationM - pointAData.elevationM >= 0 ? '+' : ''}
                    {(pointBData.elevationM - pointAData.elevationM).toFixed(0)} m
                  </span>
                )}
              </div>

              <p className="text-[11px] text-[#9D968A] leading-snug">
                {routeStage === 'STALE'
                  ? 'Point A or Point B moved since the last route solve. Outdated candidates are dimmed.'
                  : 'Direct geodesic relationship between A and B. Analyze terrain to compute candidate traverses.'}
              </p>

              {onRunAnalysis && (
                <button
                  type="button"
                  onClick={onRunAnalysis}
                  className="mp-btn-primary w-full min-h-[34px] px-3 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{routeStage === 'STALE' ? 'REANALYZE TERRAIN' : 'ANALYZE TERRAIN'}</span>
                </button>
              )}
            </div>
          )}

        {/* Dual-Line Comparison & Analyzed Routes HUD */}
        {routeAnalysis && routeStage === 'ANALYZED' && directDistM !== null && (
          <div className="pointer-events-auto mp-instrument-panel mp-reticle-frame p-2.5 max-w-lg space-y-2 mp-settle-in">
            <div className="flex items-center justify-between gap-3 text-[10px] font-telemetry">
              <span className="text-[#D4B483] tracking-wider tabular-nums">
                DIRECT CHORD {(directDistM / 1000).toFixed(2)} km ·{' '}
                {marsBearingDeg(routeAnalysis.start, routeAnalysis.end).toFixed(0)}°
                {pointAData?.elevationM != null && pointBData?.elevationM != null
                  ? ` · ΔZ ${pointBData.elevationM - pointAData.elevationM >= 0 ? '+' : ''}${(
                      pointBData.elevationM - pointAData.elevationM
                    ).toFixed(0)}m`
                  : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="Swap Point A and Point B"
                  onClick={swapRoutePoints}
                  className="mp-btn-secondary px-1.5 py-0.5 text-[10px] text-[#D4B483] cursor-pointer"
                >
                  Swap A↔B
                </button>
                <button
                  type="button"
                  title="Clear points & routes"
                  onClick={() => {
                    clearRoutePoints();
                    onClearAnalysis?.();
                  }}
                  className="mp-btn-secondary px-1.5 py-0.5 text-[10px] text-[#9D968A] hover:text-[#EAE4D9] cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-telemetry">
              <span className="text-[#5E9C76]">
                {sideBySideCompare ? 'SIDE-BY-SIDE COMPARISON' : 'ANALYZED CANDIDATE ROUTES'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-pressed={sideBySideCompare}
                  onClick={() => toggleSideBySideCompare()}
                  title="Toggle side-by-side comparison on the map (Hotkey: C)"
                  className={`px-1.5 py-0.5 text-[10px] inline-flex items-center gap-1 cursor-pointer ${
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
                    className={`mp-segmented-btn px-1.5 py-0.5 text-[10px] cursor-pointer ${
                      !showAllRoutes ? 'bg-[#171A20] text-[#F7F3EB]' : 'text-[#9D968A]'
                    }`}
                  >
                    2 Lines
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllRoutes(true)}
                    className={`mp-segmented-btn px-1.5 py-0.5 text-[10px] cursor-pointer ${
                      showAllRoutes ? 'bg-[#171A20] text-[#F7F3EB]' : 'text-[#9D968A]'
                    }`}
                  >
                    All 5
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setBottomTrayOpen(true, 'COMPARE')}
                  className="text-[#D4B483] hover:text-[#F7F3EB] underline cursor-pointer ml-1"
                >
                  Table
                </button>
              </div>
            </div>

            {/* Line 1 (Primary Solid) vs Line 2 (Comparison Dashed) */}
            {(() => {
              const feasible = routeAnalysis.candidates.filter((c) => c.feasible);
              const line1 =
                feasible.find((c) => c.id === selectedRouteId) ?? feasible[0] ?? null;
              const line2 =
                feasible.find((c) => c.id === compareRouteBId && c.id !== line1?.id) ??
                feasible.find((c) => c.id !== line1?.id) ??
                null;
              if (!line1) return null;

              const dDistM = line2 ? line1.distanceM - line2.distanceM : null;
              const dSlope = line2 ? line1.maxSlopeDeg - line2.maxSlopeDeg : null;
              const dGain = line2 ? line1.elevationGainM - line2.elevationGainM : null;
              const dTime =
                line2 && line1.estimatedTimeMin != null && line2.estimatedTimeMin != null
                  ? line1.estimatedTimeMin - line2.estimatedTimeMin
                  : null;

              return (
                <div className="bg-[#0B0D10] border border-[#242832] p-2 space-y-1.5 text-[10px] font-telemetry tabular-nums">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="inline-block w-4 h-[3px] shrink-0"
                        style={{ backgroundColor: getRouteVisual(line1.preset).color }}
                      />
                      <span className="text-[#736D63] shrink-0">L1</span>
                      <select
                        aria-label="Line 1 primary route"
                        value={line1.id}
                        onChange={(e) => selectRoute(e.target.value)}
                        className="flex-1 min-w-0 bg-[#111317] border border-[#242832] px-1.5 py-0.5 text-[10px] text-[#F7F3EB] outline-none cursor-pointer"
                      >
                        {feasible.map((c) => (
                          <option key={c.id} value={c.id}>
                            {getRouteVisual(c.preset).shortLabel} ({(c.distanceM / 1000).toFixed(2)}km)
                          </option>
                        ))}
                      </select>
                    </label>

                    {line2 ? (
                      <label className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="inline-block w-4 h-0 border-t-[3px] border-dashed shrink-0"
                          style={{ borderColor: getRouteVisual(line2.preset).color }}
                        />
                        <span className="text-[#736D63] shrink-0">L2</span>
                        <select
                          aria-label="Line 2 comparison route"
                          value={line2.id}
                          onChange={(e) => setCompareRouteBId(e.target.value)}
                          className="flex-1 min-w-0 bg-[#111317] border border-[#242832] px-1.5 py-0.5 text-[10px] text-[#EAE4D9] outline-none cursor-pointer"
                        >
                          {feasible
                            .filter((c) => c.id !== line1.id)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {getRouteVisual(c.preset).shortLabel} ({(c.distanceM / 1000).toFixed(2)}km)
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : (
                      <span className="text-[#736D63] self-center">Only 1 feasible route</span>
                    )}
                  </div>

                  {line2 && dDistM !== null && dSlope !== null && dGain !== null && (
                    <div className="grid grid-cols-4 gap-1 pt-1 border-t border-[#242832] text-[10px]">
                      <div>
                        <span className="text-[#736D63]">ΔDIST </span>
                        <span className="text-[#F7F3EB]">
                          {dDistM >= 0 ? '+' : ''}
                          {dDistM.toFixed(0)}m
                        </span>
                      </div>
                      <div>
                        <span className="text-[#736D63]">ΔSLP </span>
                        <span className="text-[#D98A4E]">
                          {dSlope >= 0 ? '+' : ''}
                          {dSlope.toFixed(1)}°
                        </span>
                      </div>
                      <div>
                        <span className="text-[#736D63]">ΔGAIN </span>
                        <span className="text-[#D4B483]">
                          {dGain >= 0 ? '+' : ''}
                          {dGain.toFixed(0)}m
                        </span>
                      </div>
                      <div>
                        <span className="text-[#736D63]">ΔTIME </span>
                        <span className="text-[#EAE4D9]">
                          {dTime !== null ? `${dTime >= 0 ? '+' : ''}${dTime.toFixed(0)}m` : '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex flex-wrap gap-1">
              {routeAnalysis.candidates.map((c) => {
                const vis = getRouteVisual(c.preset);
                const isL1 = c.id === selectedRouteId;
                const isL2 = c.id === compareRouteBId && !isL1;
                const detourM = c.distanceM - directDistM;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.feasible}
                    onClick={() => c.feasible && selectRoute(c.id)}
                    className={`px-2 py-0.5 border text-[10px] font-telemetry inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 ${
                      isL1
                        ? 'bg-[#171A20] border-[#F7F3EB] text-[#F7F3EB]'
                        : isL2
                          ? 'bg-[#111317] border-[#D4B483] text-[#F7F3EB]'
                          : 'bg-[#0B0D10] border-[#242832] text-[#CEC8BC] hover:border-[#373D4B]'
                    }`}
                  >
                    <span
                      className="inline-block w-2 h-2 shrink-0"
                      style={{ backgroundColor: vis.color }}
                    />
                    <span>{vis.shortLabel}</span>
                    {isL1 && <span className="text-[#F7F3EB]">[L1]</span>}
                    {isL2 && <span className="text-[#D4B483]">[L2]</span>}
                    {c.feasible ? (
                      <span className="text-[#9D968A] tabular-nums">
                        {(c.distanceM / 1000).toFixed(2)}km (+{Math.max(0, detourM).toFixed(0)}m)
                      </span>
                    ) : (
                      <span className="text-[#C44D2B]">Blocked</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Unified Viewport View-In / Zoom / 3D Tilt Instrument Controls */}
      <div
        aria-label="Map viewport controls"
        className="hidden lg:flex flex-col gap-1 absolute bottom-16 right-3 z-20 pointer-events-auto no-print"
      >
        <div className="mp-instrument-panel flex flex-col divide-y divide-[#242832]">
          <button
            type="button"
            onClick={() => handleZoomBy(1)}
            aria-label="Zoom in"
            title="Zoom in"
            className="w-8 h-8 flex items-center justify-center text-[#EAE4D9] hover:bg-[#171A20] hover:text-[#F7F3EB] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleZoomBy(-1)}
            aria-label="Zoom out"
            title="Zoom out"
            className="w-8 h-8 flex items-center justify-center text-[#EAE4D9] hover:bg-[#171A20] hover:text-[#F7F3EB] cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggle3DPitch}
            aria-label={is3DView ? 'Switch to 2D top-down view' : 'Tilt to 3D oblique view'}
            title={is3DView ? '2D Nadir View' : '3D Oblique Pitch'}
            className={`w-8 h-8 flex items-center justify-center text-[10px] font-telemetry cursor-pointer ${
              is3DView ? 'bg-[#171A20] text-[#D4B483]' : 'text-[#9D968A] hover:bg-[#171A20] hover:text-[#EAE4D9]'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setCamera({ bearing: 0 })}
            aria-label="Reset north bearing"
            title="Align North Up"
            className="w-8 h-8 flex items-center justify-center text-[#9D968A] hover:bg-[#171A20] hover:text-[#EAE4D9] cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetCorridor}
            aria-label="Reset Gale Crater corridor view"
            title="Reset Gale Corridor View"
            className="w-8 h-8 flex items-center justify-center text-[#D4B483] hover:bg-[#171A20] hover:text-[#F7F3EB] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
