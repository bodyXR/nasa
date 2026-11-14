import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon } from 'geojson';

export type ClaimClassification = 'VERIFIED_FACT' | 'INFERENCE' | 'ASSUMPTION' | 'SIMULATION';

export type DataStatus = 'LIVE' | 'CACHED' | 'DERIVED' | 'SIMULATION';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Provenance {
  sourceId: string;
  sourceName: string;
  mission: string;
  instrument: string;
  productId?: string;
  sourceUrl: string;
  retrievedAt: string;
  processing: string[];
  license: string;
  attribution: string;
  status: DataStatus;
  confidence?: ConfidenceLevel;
  limitations: string[];
  classification: ClaimClassification;
}

export type DatasetType =
  | 'TOPOGRAPHY'
  | 'IMAGERY'
  | 'GEOLOGY'
  | 'THERMAL'
  | 'SPECTRAL'
  | 'ROVER_OBSERVATION'
  | 'ATMOSPHERIC'
  | 'RADIATION'
  | 'CHEMICAL'
  | 'SUBSURFACE';

export interface Dataset {
  id: string;
  name: string;
  type: DatasetType;
  mission: string;
  instrument: string;
  description: string;
  whatItShows: string;
  whyItMatters: string;
  scientificPurpose: string;
  spatialCoverage: GeoJSON.Polygon;
  temporalCoverage: string;
  resolution: string;
  crs: string;
  visualization: {
    kind: 'wmts' | 'geojson' | 'derived-grid' | 'timeseries';
    tileTemplate?: string;
    trekLayerId?: string;
    maxZoom?: number;
    defaultOpacity: number;
    color?: string;
    legend?: Array<{ label: string; color: string }>;
  };
  attribution: string;
  sourceUrl: string;
  productId?: string;
  status: DataStatus;
  verifiedStatus: 'VERIFIED_LIVE' | 'VERIFIED_CACHED' | 'UNAVAILABLE';
  lastSynchronized: string;
  limitations: string[];
}

export interface Region {
  id: string;
  name: string;
  subtitle: string;
  center: [number, number]; // [lonEast, latPlanetocentric]
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  defaultZoom: number;
  demCoverageBbox: [number, number, number, number];
  crs: string;
  scientificContext: string;
  keyMissions: string[];
  provenance: Provenance;
}

export interface ObjectiveRule {
  id: string;
  title: string;
  subtitle: string;
  scientificGoal: string;
  requiredEvidenceTypes: Array<'GEOLOGY_UNIT' | 'SPECTRAL_DETECTION' | 'ORBITAL_IMAGERY' | 'ROVER_PROXIMITY' | 'TERRAIN_COMPUTABLE'>;
  geologyKeywords: string[];
  spectralKeywords: string[];
  maxExclusionSlopeDeg: number;
  avoidDuneFields: boolean;
  weights: {
    geologyMatch: number;
    spectralEvidence: number;
    imageryCoverage: number;
    roverCorroboration: number;
    terrainAccessibility: number;
  };
  anchorZones: Array<{
    id: string;
    name: string;
    center: [number, number];
    radiusM: number;
    rationale: string;
  }>;
  provenance: Provenance;
}

export interface EvidenceCheck {
  criterion: string;
  required: boolean;
  passed: boolean;
  weight: number;
  contribution: number;
  recordId: string | null;
  recordSummary: string;
  provenance: Provenance | null;
}

export interface EvidenceItem {
  id: string;
  type: 'GEOLOGY_UNIT' | 'SPECTRAL_DETECTION' | 'ORBITAL_IMAGERY' | 'ROVER_PROXIMITY' | 'TERRAIN_COMPUTABLE';
  title: string;
  summary: string;
  whyItMatters: string;
  coordinates?: [number, number];
  geometry?: Geometry;
  attributes: Record<string, string | number | boolean | null>;
  provenance: Provenance;
}

export interface ScienceTarget {
  id: string;
  name: string;
  regionId: string;
  objectiveId: string;
  coordinates: [number, number]; // [lon, lat]
  elevationM: number | null;
  localSlopeDeg: number | null;
  score: number; // 0..100 transparent deterministic weighted score
  rank: number;
  classification: 'CANDIDATE_SITE';
  disclaimer: string;
  whyHere: string[];
  checks: EvidenceCheck[];
  evidenceItems: EvidenceItem[];
  nearestRoverObservation?: {
    sol: number;
    instrument: string;
    imageUrl: string;
    distanceM: number;
    observationDate: string;
    note: string;
    provenance: Provenance;
  } | null;
  provenance: Provenance;
}

export interface RoverObservation {
  id: string;
  sol: number;
  earthDate: string;
  instrument: string;
  title: string;
  caption: string;
  imageUrl: string;
  thumbUrl: string;
  site: number | null;
  drive: number | null;
  coordinates: [number, number] | null; // null if unlocated
  elevationM: number | null;
  tiltDeg: number | null;
  located: boolean;
  localizationMethod: string;
  provenance: Provenance;
}

export interface RouteWeights {
  preset: 'SHORTEST' | 'LOWER_TERRAIN_COST' | 'SCIENCE_ORIENTED' | 'PAIR_EVA' | 'ROVER_ASSISTED';
  label: string;
  wSlope: number;
  wTerrain: number;
  wHazard: number;
  wScience: number;
  maxSlopeDeg: number;
  avoidDunes: boolean;
  assumedSpeedMps: number;
  assumptionNotes: string[];
}

export interface RouteSegment {
  index: number;
  from: [number, number];
  to: [number, number];
  distanceM: number;
  elevationStartM: number;
  elevationEndM: number;
  elevationDeltaM: number;
  slopeDeg: number;
  roughnessM: number;
  hazardFlags: string[];
  scienceScore: number;
  cost: number;
}

export interface RouteWaypoint {
  index: number;
  label: string;
  coordinates: [number, number];
  elevationM: number;
  slopeDeg: number;
  cumulativeDistanceM: number;
  note: string;
}

export interface RouteCandidate {
  id: string;
  preset: RouteWeights['preset'];
  label: string;
  feasible: boolean;
  blockedReason?: string;
  blockingConstraint?: string;
  geometry: LineString | null;
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  maxSlopeDeg: number;
  meanSlopeDeg: number;
  cumulativeCost: number;
  estimatedTimeMin: number | null;
  speedModelAssumption: string;
  activeConstraints: string[];
  segments: RouteSegment[];
  waypoints: RouteWaypoint[];
  weights: RouteWeights;
  whyRoute: string[];
  tradeoffSummary: string;
  provenance: Provenance;
}

export interface TerrainGridSummary {
  id: string;
  bbox: [number, number, number, number];
  rows: number;
  cols: number;
  cellSizeM: number;
  crs: string;
  demSourceId: string;
  demResolution: string;
  minElevM: number;
  maxElevM: number;
  maxSlopeDeg: number;
  meanSlopeDeg: number;
  hazardCellsCount: number;
  noDataCellsCount: number;
  duneHazardCellsCount: number;
  elevations: number[][]; // [row][col], NaN serialized as null in JSON if missing
  slopesDeg: number[][];
  hazardGeoJson: FeatureCollection;
  provenance: Provenance;
}

export interface RouteAnalysisResponse {
  regionId: string;
  objectiveId: string;
  targetId?: string;
  start: [number, number];
  end: [number, number];
  terrain: TerrainGridSummary;
  candidates: RouteCandidate[];
  sensitivity: Array<{
    maxSlopeDeg: number;
    feasible: boolean;
    distanceM: number | null;
    cumulativeCost: number | null;
    blockedReason?: string;
  }>;
  limitations: string[];
  lastSynchronized: string;
  dataStatus: DataStatus;
}

export interface RemsWeatherRecord {
  sol: number;
  terrestrialDate: string;
  ls: number | null;
  season: string;
  minTempC: number | null;
  maxTempC: number | null;
  minGroundTempC: number | null;
  maxGroundTempC: number | null;
  pressurePa: number | null;
  uvIndex: string;
  opacity: string;
  sunrise: string;
  sunset: string;
}

export interface RadObservationSummary {
  sol: number;
  productId: string;
  startUtc: string;
  obsDurationSec: number;
  totalDoseB: number | null;
  totalDoseE: number | null;
  doseRateBPerDay: number | null;
  unitNote: string;
  sourceUrl: string;
}

export interface EnvironmentContextResponse {
  regionId: string;
  rems: {
    available: boolean;
    records: RemsWeatherRecord[];
    statement: string;
    provenance: Provenance;
  };
  rad: {
    available: boolean;
    records: RadObservationSummary[];
    statement: string;
    provenance: Provenance;
  };
  lastSynchronized: string;
}

export interface GazetteerEntry {
  id: string;
  name: string;
  featureType: string;
  coordinates: [number, number];
  diameterKm: number | null;
  origin: string;
  provenance: Provenance;
}

export interface MissionBrief {
  id: string;
  generatedAt: string;
  contentHash: string;
  title: string;
  region: Region;
  objective: ObjectiveRule;
  target: ScienceTarget;
  route: RouteCandidate;
  whyTarget: string[];
  whyRoute: string[];
  evidenceSummary: EvidenceItem[];
  environmentContext: {
    remsSummary: string;
    radSummary: string;
  };
  parameters: {
    weights: RouteWeights;
    demSource: string;
    gridCellSizeM: number;
    crs: string;
  };
  dataSources: Array<{
    sourceId: string;
    sourceName: string;
    mission: string;
    instrument: string;
    sourceUrl: string;
    retrievedAt: string;
    status: DataStatus;
    attribution: string;
  }>;
  limitations: {
    dataCoverage: string[];
    resolution: string[];
    temporalLimitations: string[];
    modelingAssumptions: string[];
    missingData: string[];
  };
  nasaDisclaimer: string;
  aiNarrative?: {
    label: 'AI-GENERATED FROM VERIFIED DATA';
    text: string;
    citedIds: string[];
    inputPayload: unknown;
  } | null;
}

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  source: string;
  retryable: boolean;
}
