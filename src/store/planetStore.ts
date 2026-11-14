import { create } from 'zustand';

export type ExperienceMode = 'ORBIT' | 'FIELD' | 'EARTH';
export type PresentationMode = 'HABITAT' | 'TABLET' | 'HUD';
export type InspectorTab = 'WHY' | 'EVIDENCE' | 'ROVER' | 'ROUTE' | 'ENV';
export type InspectorContext = 'OVERVIEW' | 'DATASET' | 'TARGET' | 'ROUTE' | 'OBSERVATION' | 'ENV';
export type BottomTrayTab = 'PROFILE' | 'COMPARE' | 'ENV' | 'PROBE';
export type EntryIntent = 'EXPLORE' | 'EVIDENCE' | 'PLAN';

export type RoutePlanningStage =
  | 'IDLE'
  | 'PICK_A'
  | 'PICK_B'
  | 'DIRECT_READY'
  | 'ANALYZING'
  | 'ANALYZED'
  | 'STALE';

export type ActiveMapTool =
  | 'NONE'
  | 'MEASURE_DIST'
  | 'MEASURE_PATH'
  | 'INSPECT_COORD'
  | 'PROFILE'
  | 'COMPARE'
  | 'ROUTE';

export interface PointProbeState {
  lon: number;
  lat: number;
  elevationM: number | null;
  localSlopeDeg: number | null;
  dataStatus: string;
  resolution: string;
  loading: boolean;
}

export interface EndpointDemTelemetry {
  lon: number;
  lat: number;
  elevationM: number | null;
  localSlopeDeg: number | null;
  dataStatus?: string;
  resolution: string;
  loading: boolean;
}

const TOUR_STORAGE_KEY = 'marspath_tour_state';

function readTourPersistence(): { completed: boolean; skipped: boolean } {
  if (typeof window === 'undefined') return { completed: false, skipped: false };
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return { completed: false, skipped: false };
    const parsed = JSON.parse(raw) as { completed?: boolean; skipped?: boolean };
    return {
      completed: Boolean(parsed.completed),
      skipped: Boolean(parsed.skipped),
    };
  } catch {
    return { completed: false, skipped: false };
  }
}

function writeTourPersistence(completed: boolean, skipped: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      TOUR_STORAGE_KEY,
      JSON.stringify({ completed, skipped })
    );
  } catch {
    // Ignore storage quota or private mode issues
  }
}

export interface PlanetState {
  mode: ExperienceMode;
  presentationMode: PresentationMode;
  introComplete: boolean;
  entryIntent: EntryIntent | null;
  regionId: string;
  objectiveId: string;
  lat: number;
  lon: number;
  zoom: number;
  bearing: number;
  pitch: number;
  cameraSeq: number;

  // Live cursor & DEM probe telemetry shared cleanly with BottomTelemetryDeck
  hoverCoord: [number, number] | null;
  pointProbe: PointProbeState | null;

  // Contextual selection state
  inspectorContext: InspectorContext;
  selectedDatasetId: string | null;
  selectedFeatureId: string | null;
  selectedTargetId: string | null;
  selectedRouteId: string | null;
  selectedObservationId: string | null;
  selectedObservationSol: number | null;

  // Data rail & map tools
  activeLayers: string[];
  layerOpacity: Record<string, number>;
  simpleAdvanced: 'SIMPLE' | 'ADVANCED';
  activeTab: InspectorTab;
  compareMode: boolean;
  compareLayerB: string;
  measureMode: boolean;
  measureVariant: 'DISTANCE' | 'PATH';
  toolsMenuOpen: boolean;
  activeTool: ActiveMapTool;

  // Progressive disclosure drawers, command search & sheets
  leftRailOpen: boolean;
  rightRailOpen: boolean;
  bottomTrayOpen: boolean;
  bottomTrayTab: BottomTrayTab;
  searchModalOpen: boolean;
  mobileSheetOpen: boolean;
  mobileSheetView: 'DATA' | 'INSPECT' | 'ANALYSIS';

  // Signature Follow the Evidence story
  evidenceStoryActive: boolean;
  evidenceStoryStep: number; // 0..4: Terrain -> Geology -> Imagery -> Rover -> Target

  // 12-Step Interactive Mission Training Tour
  tourWelcomeOpen: boolean;
  tourActive: boolean;
  tourStep: number; // 0..11
  tourPaused: boolean;
  tourCompleted: boolean;
  tourSkipped: boolean;
  tourCompletionModalOpen: boolean;

  // Modals & route interactions
  limitationsOpen: boolean;
  briefOpen: boolean;
  howThisWorksStep: number | null;
  hoveredProfileCoord: [number, number] | null;
  /** Elevation-profile sample index currently highlighted (set from map route hover or tray scrub). */
  hoveredProfileIdx: number | null;
  /** Route candidate id whose sample index is highlighted, so the tray can ignore stale indexes. */
  hoveredProfileRouteId: string | null;
  customRouteStart: [number, number] | null;
  customRouteEnd: [number, number] | null;
  pickingRouteStart: boolean;
  pickingRoutePoint: null | 'A' | 'B' | 'AB';
  routePlanningActive: boolean;
  routeStage: RoutePlanningStage;
  routeAnalysisSignature: string | null;
  pointInspectorSide: 'A' | 'B' | null;
  showAllRoutes: boolean;
  sideBySideCompare: boolean;
  compareRouteBId: string | null;
  shortcutsOpen: boolean;
  pointAData: EndpointDemTelemetry | null;
  pointBData: EndpointDemTelemetry | null;
  earthAnalogQuery: string | null;

  // Actions
  setMode: (mode: ExperienceMode) => void;
  setPresentationMode: (pm: PresentationMode) => void;
  completeIntro: (intent: EntryIntent, targetMode?: ExperienceMode) => void;
  setRegion: (regionId: string) => void;
  setObjective: (objectiveId: string) => void;
  setCamera: (cam: Partial<Pick<PlanetState, 'lat' | 'lon' | 'zoom' | 'bearing' | 'pitch'>>) => void;
  syncCameraFromMap: (cam: Partial<Pick<PlanetState, 'lat' | 'lon' | 'zoom' | 'bearing' | 'pitch'>>) => void;
  setHoverCoord: (coord: [number, number] | null) => void;
  setPointProbe: (probe: PointProbeState | null) => void;

  selectDataset: (id: string | null) => void;
  selectFeature: (id: string | null) => void;
  selectTarget: (id: string | null) => void;
  selectRoute: (id: string | null) => void;
  selectObservation: (id: string | null, sol?: number | null) => void;
  selectObservationSol: (sol: number | null) => void;
  setInspectorContext: (ctx: InspectorContext) => void;

  toggleLayer: (layerId: string) => void;
  activateLayer: (layerId: string) => void;
  setLayersExact: (layerIds: string[]) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  setSimpleAdvanced: (mode: 'SIMPLE' | 'ADVANCED') => void;
  setActiveTab: (tab: InspectorTab) => void;
  setCompareMode: (on: boolean, layerB?: string) => void;
  setMeasureMode: (on: boolean, variant?: 'DISTANCE' | 'PATH') => void;
  setToolsMenuOpen: (open: boolean) => void;
  setActiveTool: (tool: ActiveMapTool) => void;
  setLeftRailOpen: (open: boolean) => void;
  setRightRailOpen: (open: boolean) => void;
  setBottomTrayOpen: (open: boolean, tab?: BottomTrayTab) => void;
  setSearchModalOpen: (open: boolean) => void;
  setMobileSheet: (open: boolean, view?: 'DATA' | 'INSPECT' | 'ANALYSIS') => void;
  setEvidenceStory: (active: boolean, step?: number) => void;
  setLimitationsOpen: (open: boolean) => void;
  setBriefOpen: (open: boolean) => void;
  setHowThisWorksStep: (step: number | null) => void;
  setHoveredProfile: (payload: { coord: [number, number]; idx: number; routeId: string } | null) => void;

  // Point A -> Point B & Route Planning Mode
  enterRoutePlanningMode: (startPicking?: boolean) => void;
  exitRoutePlanningMode: () => void;
  setRouteStage: (stage: RoutePlanningStage, signature?: string | null) => void;
  setPointInspectorSide: (side: 'A' | 'B' | null) => void;
  setCustomRouteStart: (coord: [number, number] | null) => void;
  setCustomRouteEnd: (coord: [number, number] | null) => void;
  setPickingRouteStart: (picking: boolean) => void;
  setPickingRoutePoint: (mode: null | 'A' | 'B' | 'AB') => void;
  swapRoutePoints: () => void;
  clearRoutePoints: () => void;
  setShowAllRoutes: (show: boolean) => void;
  setSideBySideCompare: (on: boolean) => void;
  toggleSideBySideCompare: (on?: boolean) => void;
  setCompareRouteBId: (id: string | null) => void;
  setShortcutsOpen: (open: boolean) => void;
  setEarthAnalogQuery: (q: string | null) => void;
  openEarthAnalog: (presetQuery?: string) => void;
  setPointAData: (data: EndpointDemTelemetry | null) => void;
  setPointBData: (data: EndpointDemTelemetry | null) => void;

  // Guided Tour Actions
  openTourWelcome: () => void;
  startTour: (fromStep?: number) => void;
  setTourStep: (step: number) => void;
  pauseTour: () => void;
  resumeTour: () => void;
  skipTour: () => void;
  completeTour: () => void;
  closeTourCompletionModal: () => void;
  hydrateTourFlags: (completed: boolean, skipped: boolean) => void;
}

const DEFAULT_ACTIVE_LAYERS = [
  'trek-ctx-gale',
  'trek-hirise-curiosity',
  'msl-rover-observations',
  'trek-dune-fields',
];

const DEFAULT_OPACITY: Record<string, number> = {
  'trek-mola-hrsc-clr': 0.85,
  'trek-ctx-gale': 0.85,
  'trek-hirise-curiosity': 0.95,
  'trek-themis-night-ir': 0.72,
  'usgs-sim3292-geo': 0.45,
  'trek-crism-spectral': 0.9,
  'trek-dune-fields': 0.65,
  'msl-rover-observations': 1,
  'trek-gale-dem-1m': 0.75,
};

function readInitialUrlState(): Partial<PlanetState> {
  if (typeof window === 'undefined') return {};
  try {
    const sp = new URLSearchParams(window.location.search);
    const modeParam = sp.get('mode');
    const mode: ExperienceMode =
      modeParam === 'FIELD' ? 'FIELD' : modeParam === 'EARTH' ? 'EARTH' : 'ORBIT';
    const pmRaw = sp.get('pm');
    const presentationMode: PresentationMode =
      pmRaw === 'TABLET' || pmRaw === 'HUD' ? pmRaw : 'HABITAT';
    const lat = Number(sp.get('lat'));
    const lon = Number(sp.get('lon'));
    const zoom = Number(sp.get('z'));
    const bearing = Number(sp.get('b'));
    const pitch = Number(sp.get('p'));
    const layersRaw = sp.get('layers');
    const objectiveId = sp.get('obj');
    const targetId = sp.get('target');
    const routeId = sp.get('route');
    const sa = sp.get('sa') === 'ADVANCED' ? 'ADVANCED' : 'SIMPLE';

    return {
      mode,
      introComplete: mode === 'FIELD' || mode === 'EARTH',
      presentationMode,
      regionId: sp.get('region') || 'gale-crater',
      objectiveId: objectiveId === 'boxwork-formations' ? 'boxwork-formations' : 'ancient-water',
      lat: Number.isFinite(lat) && lat !== 0 ? lat : -4.775,
      lon: Number.isFinite(lon) && lon !== 0 ? lon : 137.3889,
      zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 12.2,
      bearing: Number.isFinite(bearing) ? bearing : 0,
      pitch: Number.isFinite(pitch) ? pitch : 0,
      selectedTargetId: targetId || null,
      selectedRouteId: routeId || null,
      activeLayers: layersRaw ? layersRaw.split(',').filter(Boolean) : DEFAULT_ACTIVE_LAYERS,
      simpleAdvanced: sa,
    };
  } catch {
    return {};
  }
}

function syncStateToUrl(s: PlanetState): void {
  if (typeof window === 'undefined') return;
  try {
    const sp = new URLSearchParams();
    sp.set('mode', s.mode);
    if (s.presentationMode !== 'HABITAT') sp.set('pm', s.presentationMode);
    sp.set('region', s.regionId);
    sp.set('obj', s.objectiveId);
    sp.set('lat', s.lat.toFixed(4));
    sp.set('lon', s.lon.toFixed(4));
    sp.set('z', s.zoom.toFixed(2));
    if (Math.abs(s.bearing) > 0.5) sp.set('b', s.bearing.toFixed(1));
    if (Math.abs(s.pitch) > 0.5) sp.set('p', s.pitch.toFixed(1));
    if (s.selectedTargetId) sp.set('target', s.selectedTargetId);
    if (s.selectedRouteId) sp.set('route', s.selectedRouteId);
    if (s.simpleAdvanced !== 'SIMPLE') sp.set('sa', s.simpleAdvanced);
    sp.set('layers', s.activeLayers.join(','));
    const nextUrl = `${window.location.pathname}?${sp.toString()}`;
    window.history.replaceState(null, '', nextUrl);
  } catch {
    // Ignore restricted history API
  }
}

const init = readInitialUrlState();
const initTour = readTourPersistence();

export const usePlanetStore = create<PlanetState>((set, get) => ({
  mode: init.mode ?? 'ORBIT',
  presentationMode: init.presentationMode ?? 'HABITAT',
  introComplete: init.introComplete ?? false,
  entryIntent: null,
  regionId: init.regionId ?? 'gale-crater',
  objectiveId: init.objectiveId ?? 'ancient-water',
  lat: init.lat ?? -4.775,
  lon: init.lon ?? 137.3889,
  zoom: init.zoom ?? 12.2,
  bearing: init.bearing ?? 0,
  pitch: init.pitch ?? 0,
  cameraSeq: 0,

  hoverCoord: null,
  pointProbe: null,

  inspectorContext: 'OVERVIEW',
  selectedDatasetId: null,
  selectedFeatureId: null,
  selectedTargetId: init.selectedTargetId ?? null,
  selectedRouteId: init.selectedRouteId ?? null,
  selectedObservationId: null,
  selectedObservationSol: null,

  activeLayers: init.activeLayers ?? DEFAULT_ACTIVE_LAYERS,
  layerOpacity: DEFAULT_OPACITY,
  simpleAdvanced: init.simpleAdvanced ?? 'SIMPLE',
  activeTab: 'WHY',
  compareMode: false,
  compareLayerB: 'trek-themis-night-ir',
  measureMode: false,
  measureVariant: 'DISTANCE',
  toolsMenuOpen: false,
  activeTool: 'NONE',

  leftRailOpen: false,
  rightRailOpen: true,
  bottomTrayOpen: false,
  bottomTrayTab: 'PROFILE',
  searchModalOpen: false,
  mobileSheetOpen: false,
  mobileSheetView: 'INSPECT',

  evidenceStoryActive: false,
  evidenceStoryStep: 0,

  tourWelcomeOpen:
    (init.mode ?? 'ORBIT') === 'FIELD' && !initTour.completed && !initTour.skipped,
  tourActive: false,
  tourStep: 0,
  tourPaused: false,
  tourCompleted: initTour.completed,
  tourSkipped: initTour.skipped,
  tourCompletionModalOpen: false,

  limitationsOpen: false,
  briefOpen: false,
  howThisWorksStep: null,
  hoveredProfileCoord: null,
  hoveredProfileIdx: null,
  hoveredProfileRouteId: null,
  customRouteStart: null,
  customRouteEnd: null,
  pickingRouteStart: false,
  pickingRoutePoint: null,
  routePlanningActive: false,
  routeStage: 'IDLE',
  routeAnalysisSignature: null,
  pointInspectorSide: null,
  showAllRoutes: true,
  sideBySideCompare: false,
  compareRouteBId: null,
  shortcutsOpen: false,
  pointAData: null,
  pointBData: null,
  earthAnalogQuery: null,

  setMode: (mode) => {
    set({ mode, toolsMenuOpen: false });
    syncStateToUrl(get());
  },
  setEarthAnalogQuery: (earthAnalogQuery) => set({ earthAnalogQuery }),
  openEarthAnalog: (presetQuery) => {
    set({
      mode: 'EARTH',
      introComplete: true,
      toolsMenuOpen: false,
      ...(presetQuery ? { earthAnalogQuery: presetQuery } : {}),
    });
    syncStateToUrl(get());
  },
  setPresentationMode: (presentationMode) => {
    set({
      presentationMode,
      leftRailOpen: false,
      rightRailOpen: presentationMode === 'HABITAT',
    });
    syncStateToUrl(get());
  },
  completeIntro: (entryIntent, targetMode = 'FIELD') => {
    const s = get();
    const tab: InspectorTab =
      entryIntent === 'EVIDENCE' ? 'EVIDENCE' : entryIntent === 'PLAN' ? 'ROUTE' : 'WHY';
    const ctx: InspectorContext =
      entryIntent === 'EVIDENCE' ? 'TARGET' : entryIntent === 'PLAN' ? 'ROUTE' : 'OVERVIEW';
    const shouldShowWelcome =
      targetMode === 'FIELD' && !s.tourCompleted && !s.tourSkipped && !s.tourActive;

    set({
      introComplete: true,
      entryIntent,
      mode: targetMode,
      activeTab: tab,
      inspectorContext: ctx,
      rightRailOpen: true,
      evidenceStoryActive: entryIntent === 'EVIDENCE',
      evidenceStoryStep: 0,
      ...(entryIntent === 'PLAN'
        ? {
            routePlanningActive: true,
            pickingRoutePoint: 'AB',
            pickingRouteStart: true,
            routeStage: 'PICK_A',
          }
        : {}),
      tourWelcomeOpen: shouldShowWelcome,
    });
    syncStateToUrl(get());
  },
  setRegion: (regionId) => {
    set({ regionId });
    syncStateToUrl(get());
  },
  setObjective: (objectiveId) => {
    set({ objectiveId, selectedTargetId: null, selectedRouteId: null });
    syncStateToUrl(get());
  },
  setCamera: (cam) => {
    set((s) => ({ ...cam, cameraSeq: s.cameraSeq + 1 }));
    syncStateToUrl(get());
  },
  syncCameraFromMap: (cam) => {
    set(cam);
    syncStateToUrl(get());
  },
  setHoverCoord: (hoverCoord) => set({ hoverCoord }),
  setPointProbe: (pointProbe) =>
    set((s) => ({
      pointProbe,
      ...(pointProbe
        ? { bottomTrayOpen: true, bottomTrayTab: 'PROBE' as const }
        : {
            bottomTrayTab: s.bottomTrayTab === 'PROBE' ? 'PROFILE' : s.bottomTrayTab,
          }),
    })),

  selectDataset: (selectedDatasetId) =>
    set({
      selectedDatasetId,
      inspectorContext: selectedDatasetId ? 'DATASET' : 'OVERVIEW',
      rightRailOpen: true,
    }),

  selectFeature: (selectedFeatureId) => set({ selectedFeatureId }),

  selectTarget: (selectedTargetId) => {
    set({
      selectedTargetId,
      inspectorContext: selectedTargetId ? 'TARGET' : 'OVERVIEW',
      activeTab: 'EVIDENCE',
      rightRailOpen: true,
    });
    syncStateToUrl(get());
  },

  selectRoute: (selectedRouteId) => {
    set({
      selectedRouteId,
      inspectorContext: selectedRouteId ? 'ROUTE' : 'TARGET',
      activeTab: 'ROUTE',
      rightRailOpen: true,
    });
    syncStateToUrl(get());
  },

  selectObservation: (selectedObservationId, sol = null) =>
    set({
      selectedObservationId,
      selectedObservationSol: sol !== undefined ? sol : get().selectedObservationSol,
      inspectorContext: selectedObservationId ? 'OBSERVATION' : 'OVERVIEW',
      activeTab: 'ROVER',
      rightRailOpen: true,
    }),

  selectObservationSol: (selectedObservationSol) => set({ selectedObservationSol }),

  setInspectorContext: (inspectorContext) => set({ inspectorContext }),

  toggleLayer: (layerId) => {
    const cur = get().activeLayers;
    const isAdding = !cur.includes(layerId);
    const next = isAdding ? [...cur, layerId] : cur.filter((id) => id !== layerId);
    set({
      activeLayers: next,
      ...(isAdding ? { selectedDatasetId: layerId } : {}),
    });
    syncStateToUrl(get());
  },
  activateLayer: (layerId) => {
    const cur = get().activeLayers;
    if (!cur.includes(layerId)) {
      set({ activeLayers: [...cur, layerId] });
      syncStateToUrl(get());
    }
  },
  setLayersExact: (layerIds) => {
    set({ activeLayers: layerIds });
    syncStateToUrl(get());
  },
  setLayerOpacity: (layerId, opacity) => {
    set({ layerOpacity: { ...get().layerOpacity, [layerId]: opacity } });
  },
  setSimpleAdvanced: (simpleAdvanced) => {
    set({ simpleAdvanced });
    syncStateToUrl(get());
  },
  setActiveTab: (activeTab) => {
    const ctxMap: Record<InspectorTab, InspectorContext> = {
      WHY: 'OVERVIEW',
      EVIDENCE: 'TARGET',
      ROVER: 'OBSERVATION',
      ROUTE: 'ROUTE',
      ENV: 'ENV',
    };
    set({ activeTab, inspectorContext: ctxMap[activeTab], rightRailOpen: true });
  },
  setCompareMode: (compareMode, layerB) =>
    set((s) => ({
      compareMode,
      compareLayerB: layerB ?? s.compareLayerB,
      activeTool: compareMode ? 'COMPARE' : s.activeTool === 'COMPARE' ? 'NONE' : s.activeTool,
      toolsMenuOpen: false,
    })),
  setMeasureMode: (measureMode, variant) =>
    set((s) => {
      const nextVariant = variant ?? s.measureVariant;
      return {
        measureMode,
        measureVariant: nextVariant,
        activeTool: measureMode
          ? nextVariant === 'PATH'
            ? 'MEASURE_PATH'
            : 'MEASURE_DIST'
          : s.activeTool === 'MEASURE_DIST' || s.activeTool === 'MEASURE_PATH'
            ? 'NONE'
            : s.activeTool,
        toolsMenuOpen: false,
      };
    }),
  setToolsMenuOpen: (toolsMenuOpen) => set({ toolsMenuOpen }),
  setActiveTool: (activeTool) => {
    const s = get();
    if (activeTool === 'MEASURE_DIST') {
      set({
        activeTool,
        measureMode: true,
        measureVariant: 'DISTANCE',
        pickingRoutePoint: null,
        pickingRouteStart: false,
        toolsMenuOpen: false,
      });
    } else if (activeTool === 'MEASURE_PATH') {
      set({
        activeTool,
        measureMode: true,
        measureVariant: 'PATH',
        pickingRoutePoint: null,
        pickingRouteStart: false,
        toolsMenuOpen: false,
      });
    } else if (activeTool === 'INSPECT_COORD') {
      set({
        activeTool,
        measureMode: false,
        pickingRoutePoint: null,
        pickingRouteStart: false,
        bottomTrayOpen: true,
        bottomTrayTab: 'PROBE',
        toolsMenuOpen: false,
      });
    } else if (activeTool === 'PROFILE') {
      set({
        activeTool,
        bottomTrayOpen: !s.bottomTrayOpen || s.bottomTrayTab !== 'PROFILE',
        bottomTrayTab: 'PROFILE',
        toolsMenuOpen: false,
      });
    } else if (activeTool === 'COMPARE') {
      set({
        activeTool: s.compareMode ? 'NONE' : 'COMPARE',
        compareMode: !s.compareMode,
        toolsMenuOpen: false,
      });
    } else if (activeTool === 'ROUTE') {
      s.enterRoutePlanningMode(true);
    } else {
      set({
        activeTool: 'NONE',
        measureMode: false,
        toolsMenuOpen: false,
      });
    }
  },
  setLeftRailOpen: (leftRailOpen) => set({ leftRailOpen }),
  setRightRailOpen: (rightRailOpen) => set({ rightRailOpen }),
  setBottomTrayOpen: (bottomTrayOpen, tab) =>
    set({
      bottomTrayOpen,
      bottomTrayTab: tab ?? get().bottomTrayTab,
    }),
  setSearchModalOpen: (searchModalOpen) => set({ searchModalOpen }),
  setMobileSheet: (mobileSheetOpen, view) =>
    set({
      mobileSheetOpen,
      mobileSheetView: view ?? get().mobileSheetView,
    }),
  setEvidenceStory: (evidenceStoryActive, step) =>
    set({
      evidenceStoryActive,
      evidenceStoryStep: step !== undefined ? step : get().evidenceStoryStep,
    }),
  setLimitationsOpen: (limitationsOpen) => set({ limitationsOpen }),
  setBriefOpen: (briefOpen) => set({ briefOpen }),
  setHowThisWorksStep: (howThisWorksStep) => {
    if (howThisWorksStep === null) {
      set({ howThisWorksStep: null, tourActive: false });
    } else {
      set({
        howThisWorksStep,
        tourWelcomeOpen: false,
        tourActive: true,
        tourStep: howThisWorksStep,
        tourPaused: false,
        tourCompletionModalOpen: false,
      });
    }
  },
  setHoveredProfile: (payload) =>
    set(
      payload
        ? {
            hoveredProfileCoord: payload.coord,
            hoveredProfileIdx: payload.idx,
            hoveredProfileRouteId: payload.routeId,
          }
        : {
            hoveredProfileCoord: null,
            hoveredProfileIdx: null,
            hoveredProfileRouteId: null,
          }
    ),

  enterRoutePlanningMode: (startPicking = true) =>
    set((s) => {
      const hasBoth = Boolean(s.customRouteStart && s.customRouteEnd);
      const nextPick: null | 'A' | 'B' | 'AB' = !startPicking
        ? null
        : !s.customRouteStart
          ? 'AB'
          : !s.customRouteEnd
            ? 'B'
            : 'AB';
      const nextStage: RoutePlanningStage =
        nextPick === 'AB'
          ? 'PICK_A'
          : nextPick === 'B'
            ? 'PICK_B'
            : hasBoth
              ? s.routeStage === 'ANALYZED'
                ? 'ANALYZED'
                : 'DIRECT_READY'
              : 'PICK_A';
      return {
        routePlanningActive: true,
        pickingRoutePoint: nextPick,
        pickingRouteStart: nextPick === 'AB',
        routeStage: nextStage,
        measureMode: false,
        activeTool: 'ROUTE',
        toolsMenuOpen: false,
        evidenceStoryActive: false,
        leftRailOpen: false,
        inspectorContext: 'ROUTE',
        activeTab: 'ROUTE',
        rightRailOpen: true,
      };
    }),
  exitRoutePlanningMode: () =>
    set({
      routePlanningActive: false,
      pickingRoutePoint: null,
      pickingRouteStart: false,
      pointInspectorSide: null,
      activeTool: 'NONE',
    }),
  setRouteStage: (routeStage, signature) =>
    set((s) => ({
      routeStage,
      ...(signature !== undefined ? { routeAnalysisSignature: signature } : {}),
      ...(routeStage === 'ANALYZED' ? { routePlanningActive: true } : {}),
      ...(routeStage === 'IDLE' ? { routeAnalysisSignature: s.routeAnalysisSignature } : {}),
    })),
  setPointInspectorSide: (pointInspectorSide) => set({ pointInspectorSide }),

  setCustomRouteStart: (customRouteStart) =>
    set((s) => {
      const wasAnalyzed =
        s.routeStage === 'ANALYZED' ||
        s.routeStage === 'STALE' ||
        Boolean(s.routeAnalysisSignature);
      const nextPick =
        customRouteStart && s.pickingRoutePoint === 'AB'
          ? 'B'
          : customRouteStart && s.pickingRoutePoint === 'A' && !s.customRouteEnd
            ? 'B'
            : null;
      const nextStage: RoutePlanningStage = !customRouteStart
        ? 'IDLE'
        : !s.customRouteEnd
          ? nextPick === 'B'
            ? 'PICK_B'
            : 'PICK_B'
          : wasAnalyzed
            ? 'STALE'
            : 'DIRECT_READY';

      return {
        customRouteStart,
        pickingRouteStart: false,
        pickingRoutePoint: nextPick,
        routePlanningActive: customRouteStart ? true : s.routePlanningActive,
        routeStage: nextStage,
        inspectorContext: 'ROUTE',
        rightRailOpen: true,
      };
    }),
  setCustomRouteEnd: (customRouteEnd) =>
    set((s) => {
      const wasAnalyzed =
        s.routeStage === 'ANALYZED' ||
        s.routeStage === 'STALE' ||
        Boolean(s.routeAnalysisSignature);
      const nextStage: RoutePlanningStage = !customRouteEnd
        ? s.customRouteStart
          ? 'PICK_B'
          : 'IDLE'
        : wasAnalyzed
          ? 'STALE'
          : 'DIRECT_READY';

      return {
        customRouteEnd,
        pickingRouteStart: false,
        pickingRoutePoint: null,
        routePlanningActive: customRouteEnd ? true : s.routePlanningActive,
        routeStage: nextStage,
        inspectorContext: 'ROUTE',
        rightRailOpen: true,
      };
    }),
  setPickingRouteStart: (pickingRouteStart) =>
    set({
      pickingRouteStart,
      pickingRoutePoint: pickingRouteStart ? 'A' : null,
      routePlanningActive: pickingRouteStart,
      routeStage: pickingRouteStart ? 'PICK_A' : get().routeStage,
    }),
  setPickingRoutePoint: (pickingRoutePoint) =>
    set((s) => ({
      pickingRoutePoint,
      pickingRouteStart: pickingRoutePoint === 'A' || pickingRoutePoint === 'AB',
      routePlanningActive: pickingRoutePoint ? true : s.routePlanningActive,
      measureMode: pickingRoutePoint ? false : s.measureMode,
      routeStage:
        pickingRoutePoint === 'A' || pickingRoutePoint === 'AB'
          ? 'PICK_A'
          : pickingRoutePoint === 'B'
            ? 'PICK_B'
            : s.routeStage,
      ...(pickingRoutePoint ? { evidenceStoryActive: false, leftRailOpen: false } : {}),
    })),
  swapRoutePoints: () =>
    set((s) => {
      const wasAnalyzed =
        s.routeStage === 'ANALYZED' ||
        s.routeStage === 'STALE' ||
        Boolean(s.routeAnalysisSignature);
      return {
        customRouteStart: s.customRouteEnd,
        customRouteEnd: s.customRouteStart,
        pointAData: s.pointBData,
        pointBData: s.pointAData,
        pointInspectorSide:
          s.pointInspectorSide === 'A'
            ? 'B'
            : s.pointInspectorSide === 'B'
              ? 'A'
              : null,
        routeStage:
          s.customRouteStart && s.customRouteEnd
            ? wasAnalyzed
              ? 'STALE'
              : 'DIRECT_READY'
            : s.routeStage,
      };
    }),
  clearRoutePoints: () =>
    set({
      customRouteStart: null,
      customRouteEnd: null,
      pickingRouteStart: false,
      pickingRoutePoint: null,
      routePlanningActive: false,
      routeStage: 'IDLE',
      routeAnalysisSignature: null,
      pointInspectorSide: null,
      pointAData: null,
      pointBData: null,
      selectedRouteId: null,
      compareRouteBId: null,
      sideBySideCompare: false,
      showAllRoutes: true,
      activeTool: 'NONE',
    }),
  setShowAllRoutes: (showAllRoutes) =>
    set({
      showAllRoutes,
      ...(showAllRoutes ? { sideBySideCompare: false } : {}),
    }),
  setSideBySideCompare: (on) =>
    set({
      sideBySideCompare: on,
      showAllRoutes: !on,
    }),
  toggleSideBySideCompare: (on) =>
    set((s) => {
      const next = on !== undefined ? on : !s.sideBySideCompare;
      return {
        sideBySideCompare: next,
        showAllRoutes: !next,
      };
    }),
  setCompareRouteBId: (compareRouteBId) => set({ compareRouteBId }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setPointAData: (pointAData) => set({ pointAData }),
  setPointBData: (pointBData) => set({ pointBData }),

  // Guided Tour Actions
  openTourWelcome: () =>
    set({
      tourWelcomeOpen: true,
      tourActive: false,
      tourPaused: false,
      tourCompletionModalOpen: false,
    }),
  startTour: (fromStep = 0) =>
    set({
      mode: 'FIELD',
      introComplete: true,
      tourWelcomeOpen: false,
      tourActive: true,
      tourStep: Math.max(0, Math.min(11, fromStep)),
      tourPaused: false,
      tourCompletionModalOpen: false,
      howThisWorksStep: Math.max(0, Math.min(11, fromStep)),
    }),
  setTourStep: (step) => {
    const clamped = Math.max(0, Math.min(11, step));
    set({
      tourActive: true,
      tourStep: clamped,
      tourPaused: false,
      howThisWorksStep: clamped,
    });
  },
  pauseTour: () => set({ tourPaused: true }),
  resumeTour: () => set({ tourPaused: false }),
  skipTour: () => {
    writeTourPersistence(get().tourCompleted, true);
    set({
      tourWelcomeOpen: false,
      tourActive: false,
      tourPaused: false,
      tourSkipped: true,
      tourCompletionModalOpen: false,
      howThisWorksStep: null,
    });
  },
  completeTour: () => {
    writeTourPersistence(true, false);
    set({
      tourWelcomeOpen: false,
      tourActive: false,
      tourPaused: false,
      tourCompleted: true,
      tourSkipped: false,
      tourCompletionModalOpen: true,
      howThisWorksStep: null,
    });
  },
  closeTourCompletionModal: () => set({ tourCompletionModalOpen: false }),
  hydrateTourFlags: (completed, skipped) =>
    set((s) => {
      const mergedCompleted = s.tourCompleted || completed;
      const mergedSkipped = s.tourSkipped || skipped;
      writeTourPersistence(mergedCompleted, mergedSkipped);
      return {
        tourCompleted: mergedCompleted,
        tourSkipped: mergedSkipped,
        ...(mergedCompleted || mergedSkipped ? { tourWelcomeOpen: false } : {}),
      };
    }),
}));
