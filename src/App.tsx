import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { marsDistanceM } from '../shared/geo';
import { usePlanetStore } from './store/planetStore';
import { apiClient } from './services/apiClient';
import type {
  Dataset,
  EnvironmentContextResponse,
  ObjectiveRule,
  Region,
  RouteAnalysisResponse,
  RoverObservation,
  ScienceTarget,
} from '../shared/types';
import { TopCommandBar } from './components/layout/TopCommandBar';
import { LeftInstrumentSpine } from './components/layout/LeftInstrumentSpine';
import { BottomTelemetryDeck } from './components/layout/BottomTelemetryDeck';
import { DataRail } from './components/data/DataRail';
import { ORIGIN_PRESETS } from './components/routes/TerrainRoutePanel';
import { ContextInspector } from './components/mission/ContextInspector';
import { EvidenceStoryOverlay } from './components/evidence/EvidenceStoryOverlay';
import { MissionBriefModal } from './components/mission/MissionBriefModal';
import { LimitationsModal } from './components/mission/LimitationsModal';
import { SearchCommandModal } from './components/mission/SearchCommandModal';
import { KeyboardShortcutsModal } from './components/mission/KeyboardShortcutsModal';
import { HowThisWorksSpotlight } from './components/mission/HowThisWorksSpotlight';
import { HudConceptOverlay } from './components/mission/PresentationModes';
import { ElevationProfileTray } from './components/routes/ElevationProfileTray';
import { EnvironmentPanel } from './components/environment/EnvironmentPanel';
import { useFirebase } from './components/auth/FirebaseProvider';
import { AlertTriangle, ChevronDown, Navigation, PanelRight, Search, X } from 'lucide-react';

const MarsOrbitScene = lazy(() =>
  import('./components/orbit/MarsOrbitScene').then((m) => ({ default: m.MarsOrbitScene }))
);
const MarsFieldMap = lazy(() =>
  import('./components/map/MarsFieldMap').then((m) => ({ default: m.MarsFieldMap }))
);
const EarthAnalogWorkbench = lazy(() =>
  import('./components/earth/EarthAnalogWorkbench').then((m) => ({
    default: m.EarthAnalogWorkbench,
  }))
);

export const App: React.FC = () => {
  const {
    mode,
    presentationMode,
    regionId,
    objectiveId,
    rightRailOpen,
    mobileSheetOpen,
    mobileSheetView,
    limitationsOpen,
    briefOpen,
    selectedTargetId,
    customRouteStart,
    customRouteEnd,
    pickingRoutePoint,
    simpleAdvanced,
    routeStage,
    setMode,
    setRightRailOpen,
    setBottomTrayOpen,
    setMobileSheet,
    setInspectorContext,
    setLimitationsOpen,
    setBriefOpen,
    setSearchModalOpen,
    selectTarget,
    selectRoute,
    setCompareRouteBId,
    setPointAData,
    setPointBData,
    setCamera,
    activateLayer,
    setRouteStage,
    setCustomRouteStart,
    setCustomRouteEnd,
    enterRoutePlanningMode,
    startTour,
  } = usePlanetStore();

  const { user, userProfile, quotaExceededUrl, syncPreferences } = useFirebase();
  const [quotaBannerDismissed, setQuotaBannerDismissed] = useState(false);

  const [regions, setRegions] = useState<Region[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveRule[]>([]);
  const [lastSynced, setLastSynced] = useState('');

  const [targets, setTargets] = useState<ScienceTarget[]>([]);
  const [convergenceGrid, setConvergenceGrid] = useState<GeoJSON.FeatureCollection | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  const [geologyGeoJson, setGeologyGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [dunesGeoJson, setDunesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [spectralPoints, setSpectralPoints] = useState<GeoJSON.FeatureCollection | null>(null);
  const [frtFootprints, setFrtFootprints] = useState<GeoJSON.FeatureCollection | null>(null);
  const [traverseGeoJson, setTraverseGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [waypoints, setWaypoints] = useState<
    Array<{
      sol: number;
      coordinates: [number, number];
      elevationM: number | null;
      tiltDeg: number | null;
      distTotalM: number | null;
    }>
  >([]);
  const [observations, setObservations] = useState<RoverObservation[]>([]);
  const [obsLoading, setObsLoading] = useState(false);

  const [environment, setEnvironment] = useState<EnvironmentContextResponse | null>(null);
  const [envLoading, setEnvLoading] = useState(false);

  const [selectedOriginId, setSelectedOriginId] = useState<string>(ORIGIN_PRESETS[0].id);
  const [maxSlopeDeg, setMaxSlopeDeg] = useState<number>(18);
  const [avoidDunes, setAvoidDunes] = useState<boolean>(true);
  const [routeAnalysis, setRouteAnalysis] = useState<
    (RouteAnalysisResponse & { runId?: string }) | null
  >(null);
  const [demPreviewGeoJson, setDemPreviewGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [analyzingRoute, setAnalyzingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  const activeLayers = usePlanetStore((s) => s.activeLayers);

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    Promise.all([
      apiClient.getRegions(),
      apiClient.getDatasets(),
      apiClient.getObjectives(),
    ])
      .then(([regRes, dsRes, objRes]) => {
        setRegions(regRes.regions);
        setDatasets(dsRes.datasets);
        setLastSynced(dsRes.lastSynchronized);
        setObjectives(objRes.objectives);
      })
      .catch((e) => console.error('Catalog load error:', e));

    const galeBbox: [number, number, number, number] = [137.24, -4.91, 137.56, -4.54];
    apiClient.getGeology(galeBbox).then((r) => setGeologyGeoJson(r.collection)).catch(() => {});
    apiClient.getDunes(galeBbox).then((r) => setDunesGeoJson(r.collection)).catch(() => {});
    apiClient
      .getSpectral([136.8, -5.8, 138.2, -4.1])
      .then((r) => {
        setSpectralPoints(r.points.collection);
        setFrtFootprints(r.frtFootprints.collection);
      })
      .catch(() => {});
    apiClient
      .getTraverse()
      .then((r) => {
        setTraverseGeoJson(r.traverse);
        setWaypoints(r.waypoints);
      })
      .catch(() => {});

    setObsLoading(true);
    apiClient
      .getObservations()
      .then((r) => setObservations(r.observations))
      .catch(() => {})
      .finally(() => setObsLoading(false));
  }, []);

  useEffect(() => {
    setEnvLoading(true);
    apiClient
      .getEnvironment(regionId)
      .then((res) => setEnvironment(res))
      .catch(() => setEnvironment(null))
      .finally(() => setEnvLoading(false));
  }, [regionId]);

  useEffect(() => {
    if (!activeLayers.includes('trek-gale-dem-1m') || demPreviewGeoJson) return;
    apiClient
      .getTerrainPreview()
      .then((res) => setDemPreviewGeoJson(res.hazardGeoJson))
      .catch(() => {});
  }, [activeLayers, demPreviewGeoJson]);

  useEffect(() => {
    let cancelled = false;
    setEvidenceLoading(true);
    apiClient
      .getEvidence(regionId, objectiveId)
      .then((res) => {
        if (cancelled) return;
        setTargets(res.targets);
        setConvergenceGrid(res.convergenceGrid);
        if (res.targets.length > 0) {
          const currentExists = res.targets.some(
            (t) => t.id === usePlanetStore.getState().selectedTargetId
          );
          if (!currentExists) {
            selectTarget(res.targets[0].id);
          }
        }
      })
      .catch((e) => console.error('Evidence load error:', e))
      .finally(() => {
        if (!cancelled) setEvidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [regionId, objectiveId, selectTarget]);

  const activeRegion = regions.find((r) => r.id === regionId) ?? regions[0] ?? null;
  const activeObjective = objectives.find((o) => o.id === objectiveId) ?? objectives[0] ?? null;

  const lastAutoPairRef = useRef<string | null>(null);

  const runRouteAnalysis = useCallback(
    async (
      overrideTarget?: ScienceTarget,
      overridePoints?: {
        start?: [number, number];
        end?: [number, number];
        maxSlopeDeg?: number;
        avoidDunes?: boolean;
      }
    ) => {
      const target =
        overrideTarget ?? targets.find((t) => t.id === selectedTargetId) ?? targets[0];
      const originPreset =
        ORIGIN_PRESETS.find((p) => p.id === selectedOriginId) ?? ORIGIN_PRESETS[0];

      const start = overridePoints?.start ?? customRouteStart ?? originPreset.coordinates;
      const end = overridePoints?.end ?? customRouteEnd ?? target?.coordinates;
      if (!end) return;

      const effMaxSlope = overridePoints?.maxSlopeDeg ?? maxSlopeDeg;
      const effAvoidDunes = overridePoints?.avoidDunes ?? avoidDunes;

      setAnalyzingRoute(true);
      setRouteError(null);
      setRouteStage('ANALYZING');

      // Spatial transition: frame corridor & emphasize terrain + dune hazard layers
      const distM = marsDistanceM(start, end);
      const fitZoom =
        distM < 1200 ? 14.2 : distM < 2800 ? 13.4 : distM < 6000 ? 12.6 : 11.7;
      setCamera({
        lon: (start[0] + end[0]) / 2,
        lat: (start[1] + end[1]) / 2,
        zoom: fitZoom,
      });
      activateLayer('trek-gale-dem-1m');
      activateLayer('trek-dune-fields');

      try {
        const res = await apiClient.analyzeRoutes({
          regionId,
          objectiveId,
          targetId: overridePoints?.end || customRouteEnd ? undefined : target?.id,
          start,
          end,
          gridSize: 22,
          customWeights: {
            maxSlopeDeg: effMaxSlope,
            avoidDunes: effAvoidDunes,
          },
        });
        setRouteAnalysis(res);
        const pairSig = `${start[0].toFixed(5)},${start[1].toFixed(5)}->${end[0].toFixed(5)},${end[1].toFixed(5)}`;
        setRouteStage('ANALYZED', pairSig);

        const preferred =
          res.candidates.find((c) => c.preset === 'LOWER_TERRAIN_COST' && c.feasible) ??
          res.candidates.find((c) => c.feasible) ??
          res.candidates[0];
        if (preferred) selectRoute(preferred.id);

        const secondary =
          res.candidates.find((c) => c.preset === 'SHORTEST' && c.feasible && c.id !== preferred?.id) ??
          res.candidates.find((c) => c.feasible && c.id !== preferred?.id) ??
          null;
        setCompareRouteBId(secondary ? secondary.id : null);

        setBottomTrayOpen(true, 'PROFILE');
      } catch (err) {
        setRouteError(err instanceof Error ? err.message : 'Route analysis failed.');
        setRouteStage(customRouteStart && customRouteEnd ? 'DIRECT_READY' : 'IDLE');
      } finally {
        setAnalyzingRoute(false);
      }
    },
    [
      targets,
      selectedTargetId,
      selectedOriginId,
      customRouteStart,
      customRouteEnd,
      regionId,
      objectiveId,
      maxSlopeDeg,
      avoidDunes,
      activateLayer,
      selectRoute,
      setCompareRouteBId,
      setBottomTrayOpen,
      setCamera,
      setRouteStage,
    ]
  );

  // Sample live NASA 1m DEM elevation & slope for active Point A and Point B
  const originCoord =
    customRouteStart ??
    routeAnalysis?.start ??
    (ORIGIN_PRESETS.find((p) => p.id === selectedOriginId) ?? ORIGIN_PRESETS[0]).coordinates;
  const activeTargetObj = targets.find((t) => t.id === selectedTargetId) ?? targets[0] ?? null;
  const destCoord = customRouteEnd ?? routeAnalysis?.end ?? activeTargetObj?.coordinates ?? null;

  useEffect(() => {
    let cancelled = false;
    const [lon, lat] = originCoord;
    setPointAData({
      lon,
      lat,
      elevationM: null,
      localSlopeDeg: null,
      resolution: 'Gale_DEM_SMG_1m',
      loading: true,
    });
    apiClient
      .getTerrainPoint(lon, lat)
      .then((res) => {
        if (cancelled) return;
        setPointAData({
          lon: res.lon,
          lat: res.lat,
          elevationM: res.elevationM,
          localSlopeDeg: res.localSlopeDeg,
          resolution: res.resolution,
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPointAData({
          lon,
          lat,
          elevationM: null,
          localSlopeDeg: null,
          resolution: 'Unavailable',
          loading: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [originCoord[0], originCoord[1], setPointAData]);

  useEffect(() => {
    if (!destCoord) {
      setPointBData(null);
      return;
    }
    let cancelled = false;
    const [lon, lat] = destCoord;
    setPointBData({
      lon,
      lat,
      elevationM: null,
      localSlopeDeg: null,
      resolution: 'Gale_DEM_SMG_1m',
      loading: true,
    });
    apiClient
      .getTerrainPoint(lon, lat)
      .then((res) => {
        if (cancelled) return;
        setPointBData({
          lon: res.lon,
          lat: res.lat,
          elevationM: res.elevationM,
          localSlopeDeg: res.localSlopeDeg,
          resolution: res.resolution,
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPointBData({
          lon,
          lat,
          elevationM: null,
          localSlopeDeg: null,
          resolution: 'Unavailable',
          loading: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [destCoord?.[0], destCoord?.[1], setPointBData]);

  // Point A -> Point B Direct Path first: do NOT auto-analyze; wait for user's ANALYZE TERRAIN
  useEffect(() => {
    if (!customRouteStart || !customRouteEnd) {
      lastAutoPairRef.current = null;
      return;
    }
    const pairKey = `${customRouteStart[0].toFixed(5)},${customRouteStart[1].toFixed(5)}->${customRouteEnd[0].toFixed(5)},${customRouteEnd[1].toFixed(5)}`;
    if (lastAutoPairRef.current === pairKey) return;
    lastAutoPairRef.current = pairKey;

    setInspectorContext('ROUTE');
    setRightRailOpen(true);

    // Frame A -> B direct chord gently when Point B is freshly placed
    const distM = marsDistanceM(customRouteStart, customRouteEnd);
    const fitZoom =
      distM < 1200 ? 13.8 : distM < 2800 ? 13.1 : distM < 6000 ? 12.4 : 11.6;
    setCamera({
      lon: (customRouteStart[0] + customRouteEnd[0]) / 2,
      lat: (customRouteStart[1] + customRouteEnd[1]) / 2,
      zoom: fitZoom,
    });
  }, [customRouteStart, customRouteEnd, setInspectorContext, setRightRailOpen, setCamera]);

  // Mark prior route analysis stale if terrain constraints change after analysis
  const handleChangeMaxSlopeDeg = (deg: number) => {
    setMaxSlopeDeg(deg);
    if (routeAnalysis && routeStage === 'ANALYZED') {
      setRouteStage('STALE');
    }
  };

  const handleChangeAvoidDunes = (avoid: boolean) => {
    setAvoidDunes(avoid);
    if (routeAnalysis && routeStage === 'ANALYZED') {
      setRouteStage('STALE');
    }
  };

  const handleClearAnalysis = useCallback(() => {
    setRouteAnalysis(null);
    setRouteError(null);
    lastAutoPairRef.current = null;
  }, []);

  const handleLoadSavedPlan = useCallback(
    (plan: {
      start: [number, number];
      end: [number, number];
      maxSlopeDeg: number;
      avoidDunes: boolean;
    }) => {
      setCustomRouteStart(plan.start);
      setCustomRouteEnd(plan.end);
      setMaxSlopeDeg(plan.maxSlopeDeg);
      setAvoidDunes(plan.avoidDunes);
      setMode('FIELD');
      setInspectorContext('ROUTE');
      setRightRailOpen(true);
      void runRouteAnalysis(undefined, {
        start: plan.start,
        end: plan.end,
        maxSlopeDeg: plan.maxSlopeDeg,
        avoidDunes: plan.avoidDunes,
      });
    },
    [setCustomRouteStart, setCustomRouteEnd, setMode, setInspectorContext, setRightRailOpen, runRouteAnalysis]
  );

  // Sync user's Simple/Advanced view preference to Firestore when signed in
  const lastSyncedSaRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !userProfile) return;
    if (lastSyncedSaRef.current === null) {
      lastSyncedSaRef.current = userProfile.preferredSimpleAdvanced;
      return;
    }
    if (lastSyncedSaRef.current !== simpleAdvanced) {
      lastSyncedSaRef.current = simpleAdvanced;
      void syncPreferences({ preferredSimpleAdvanced: simpleAdvanced });
    }
  }, [user, userProfile, simpleAdvanced, syncPreferences]);

  const handlePlanWalkToTarget = (target: ScienceTarget) => {
    selectTarget(target.id);
    setInspectorContext('ROUTE');
    setRightRailOpen(true);
    void runRouteAnalysis(target);
  };

  const handleOpenFieldPlan = () => {
    if (!routeAnalysis) {
      setMode('FIELD');
      setInspectorContext('ROUTE');
      void runRouteAnalysis();
    }
    setBriefOpen(true);
  };

  const isTablet = presentationMode === 'TABLET';

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07080A] text-[#EAE4D9] overflow-hidden">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {quotaExceededUrl && !quotaBannerDismissed && (
        <div
          role="alert"
          className="bg-[#171A20] border-b border-[#D98A4E] text-[#EAE4D9] px-4 py-2 text-xs flex items-center justify-between gap-3 sticky top-0 z-50"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-[#D98A4E] shrink-0" />
            <span className="truncate">
              Cloud Firestore quota reached on the Spark tier. Mars science browsing stays online; cloud saves resume after upgrade:{' '}
              <a
                href={quotaExceededUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[#D4B483] hover:text-[#F7F3EB]"
              >
                Firebase Console Upgrade
              </a>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setQuotaBannerDismissed(true)}
            aria-label="Dismiss Firestore quota notice"
            className="text-[#9D968A] hover:text-[#F7F3EB] shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Strict 3-Zone Top Command Bar */}
      <TopCommandBar onOpenFieldPlan={handleOpenFieldPlan} />

      {/* Main Spatial Workbench */}
      <main className="flex-1 relative min-h-0 overflow-hidden">
        {mode === 'ORBIT' ? (
          <div className="w-full h-full">
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center bg-[#07080A] text-xs font-telemetry text-[#D4B483]">
                  Initializing 3D Mars globe…
                </div>
              }
            >
              <MarsOrbitScene />
            </Suspense>
          </div>
        ) : mode === 'EARTH' ? (
          <div className="w-full h-full">
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center bg-[#07080A] text-xs font-telemetry text-[#D4B483]">
                  Loading Google Maps Earth Analog Workbench…
                </div>
              }
            >
              <EarthAnalogWorkbench />
            </Suspense>
          </div>
        ) : (
          <div className="w-full h-full flex relative overflow-hidden">
            {/* 1. Left Vertical Instrument Spine + Slide-Out Data Blade */}
            {!isTablet && (
              <LeftInstrumentSpine datasets={datasets} lastSynchronized={lastSynced} />
            )}

            {/* 2. Central Full-Bleed Mars Geospatial Canvas + Docked Bottom Telemetry */}
            <div className="flex-1 relative min-w-0 h-full overflow-hidden">
              <Suspense
                fallback={
                  <div className="w-full h-full flex items-center justify-center bg-[#07080A] text-xs font-telemetry text-[#D4B483]">
                    Loading Mars geospatial canvas…
                  </div>
                }
              >
                <MarsFieldMap
                  datasets={datasets}
                  targets={targets}
                  convergenceGrid={convergenceGrid}
                  geologyGeoJson={geologyGeoJson}
                  dunesGeoJson={dunesGeoJson}
                  spectralPoints={spectralPoints}
                  frtFootprints={frtFootprints}
                  traverseGeoJson={traverseGeoJson}
                  observations={observations}
                  routeAnalysis={routeAnalysis}
                  demPreviewGeoJson={demPreviewGeoJson}
                  onRunAnalysis={() => void runRouteAnalysis()}
                  onClearAnalysis={handleClearAnalysis}
                />
              </Suspense>

              {presentationMode === 'HUD' && (
                <HudConceptOverlay targets={targets} routeAnalysis={routeAnalysis} />
              )}

              {!pickingRoutePoint && (
                <EvidenceStoryOverlay
                  targets={targets}
                  onPlanWalkToTarget={handlePlanWalkToTarget}
                />
              )}

              {/* Re-open Right Inspector Button when collapsed */}
              {!isTablet && !rightRailOpen && (
                <button
                  type="button"
                  onClick={() => setRightRailOpen(true)}
                  aria-label="Open science & route inspector"
                  className="hidden lg:flex mp-instrument-panel absolute top-3 right-3 z-20 min-h-[34px] px-3 hover:border-[#D4B483] text-xs font-medium text-[#EAE4D9] items-center gap-1.5 cursor-pointer whitespace-nowrap no-print"
                >
                  <PanelRight className="w-3.5 h-3.5 text-[#D4B483]" />
                  <span>Inspect</span>
                </button>
              )}

              {/* Unified Bottom Telemetry & Elevation Deck (zero corner collision) */}
              {!isTablet && (
                <div className="hidden lg:block absolute bottom-3 left-3 right-12 z-20 no-print">
                  <BottomTelemetryDeck
                    activeObjective={activeObjective}
                    targets={targets}
                    routeAnalysis={routeAnalysis}
                    environment={environment}
                    envLoading={envLoading}
                    onStartTour={() => startTour(0)}
                  />
                </div>
              )}
            </div>

            {/* 3. Right Docked Contextual Precision Inspector */}
            {!isTablet && rightRailOpen && (
              <aside
                data-tour="right-inspector"
                aria-label="Context Inspector"
                className="hidden lg:block w-[360px] xl:w-[376px] h-full shrink-0 z-20 no-print"
              >
                <ContextInspector
                  region={activeRegion}
                  datasets={datasets}
                  objectives={objectives}
                  activeObjective={activeObjective}
                  targets={targets}
                  evidenceLoading={evidenceLoading}
                  observations={observations}
                  waypoints={waypoints}
                  obsLoading={obsLoading}
                  environment={environment}
                  envLoading={envLoading}
                  selectedOriginId={selectedOriginId}
                  onSelectOriginId={setSelectedOriginId}
                  maxSlopeDeg={maxSlopeDeg}
                  onChangeMaxSlopeDeg={handleChangeMaxSlopeDeg}
                  avoidDunes={avoidDunes}
                  onChangeAvoidDunes={handleChangeAvoidDunes}
                  routeAnalysis={routeAnalysis}
                  analyzingRoute={analyzingRoute}
                  routeError={routeError}
                  onRunAnalysis={() => void runRouteAnalysis()}
                  onClearAnalysis={handleClearAnalysis}
                  onLoadSavedPlan={handleLoadSavedPlan}
                  onPlanWalkToTarget={handlePlanWalkToTarget}
                  onOpenBrief={() => setBriefOpen(true)}
                />
              </aside>
            )}

            {/* MOBILE & TABLET SINGLE-ACTIVE BOTTOM SHEET */}
            <div
              className={`${
                isTablet ? 'block' : 'lg:hidden'
              } absolute inset-x-0 bottom-0 z-30 no-print`}
            >
              <div className="bg-[#0B0D10] border-t border-[#242832] flex items-center justify-between px-2 gap-1">
                <button
                  type="button"
                  aria-label="Search Mars"
                  onClick={() => setSearchModalOpen(true)}
                  className="mp-btn-secondary min-w-[40px] min-h-[40px] flex items-center justify-center text-[#D4B483] cursor-pointer shrink-0"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Plan a Route"
                  onClick={() => {
                    enterRoutePlanningMode(true);
                    setMobileSheet(false);
                  }}
                  className="mp-btn-secondary min-w-[40px] min-h-[40px] flex items-center justify-center text-[#C44D2B] cursor-pointer shrink-0"
                >
                  <Navigation className="w-4 h-4" />
                </button>

                <div className="flex-1 grid grid-cols-3 gap-1 py-1">
                  {(
                    [
                      { id: 'DATA', label: 'Data' },
                      { id: 'INSPECT', label: 'Inspect' },
                      { id: 'ANALYSIS', label: 'Analysis' },
                    ] as const
                  ).map((item) => {
                    const active = mobileSheetOpen && mobileSheetView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (active) {
                            setMobileSheet(false);
                          } else {
                            setMobileSheet(true, item.id);
                          }
                        }}
                        className={`min-h-[40px] px-2 text-xs font-medium cursor-pointer ${
                          active ? 'mp-btn-primary' : 'mp-btn-secondary'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {mobileSheetOpen && (
                  <button
                    type="button"
                    aria-label="Collapse bottom sheet"
                    onClick={() => setMobileSheet(false)}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                )}
              </div>

              {mobileSheetOpen && (
                <div className="bg-[#111317] border-t border-[#242832] h-[52vh] overflow-y-auto mp-scroll mp-settle-in">
                  {mobileSheetView === 'DATA' && (
                    <div className="h-full">
                      <DataRail datasets={datasets} lastSynchronized={lastSynced} />
                    </div>
                  )}
                  {mobileSheetView === 'INSPECT' && (
                    <div className="h-full">
                      <ContextInspector
                        region={activeRegion}
                        datasets={datasets}
                        objectives={objectives}
                        activeObjective={activeObjective}
                        targets={targets}
                        evidenceLoading={evidenceLoading}
                        observations={observations}
                        waypoints={waypoints}
                        obsLoading={obsLoading}
                        environment={environment}
                        envLoading={envLoading}
                        selectedOriginId={selectedOriginId}
                        onSelectOriginId={setSelectedOriginId}
                        maxSlopeDeg={maxSlopeDeg}
                        onChangeMaxSlopeDeg={handleChangeMaxSlopeDeg}
                        avoidDunes={avoidDunes}
                        onChangeAvoidDunes={handleChangeAvoidDunes}
                        routeAnalysis={routeAnalysis}
                        analyzingRoute={analyzingRoute}
                        routeError={routeError}
                        onRunAnalysis={() => void runRouteAnalysis()}
                        onClearAnalysis={handleClearAnalysis}
                        onLoadSavedPlan={handleLoadSavedPlan}
                        onPlanWalkToTarget={handlePlanWalkToTarget}
                        onOpenBrief={() => setBriefOpen(true)}
                        hideCloseButton
                      />
                    </div>
                  )}
                  {mobileSheetView === 'ANALYSIS' && (
                    <div className="p-3 space-y-4">
                      <ElevationProfileTray routeAnalysis={routeAnalysis} />
                      <EnvironmentPanel environment={environment} loading={envLoading} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Quiet Attribution & Non-Endorsement Footer */}
      <footer className="shrink-0 bg-[#07080A] border-t border-[#242832] px-3 py-1 flex flex-wrap items-center justify-between gap-2 text-[10px] font-telemetry text-[#736D63] no-print">
        <span>
          Planetary Data: NASA Mars Trek, USGS Astrogeology, MRO (HiRISE/CTX/CRISM), Odyssey THEMIS, MGS MOLA, MSL Curiosity &amp; PDS-PPI.
        </span>
        <span>
          NASA &amp; USGS do not endorse MARS//PATH. Decision support only — does not certify passability or EVA safety.
        </span>
      </footer>

      <SearchCommandModal />
      <KeyboardShortcutsModal />

      <MissionBriefModal
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        targets={targets}
        routeAnalysis={routeAnalysis}
      />

      <LimitationsModal open={limitationsOpen} onClose={() => setLimitationsOpen(false)} />
      <HowThisWorksSpotlight routeAnalysis={routeAnalysis} />
    </div>
  );
};
