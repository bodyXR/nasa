import type {
  Dataset,
  EnvironmentContextResponse,
  MissionBrief,
  ObjectiveRule,
  Provenance,
  Region,
  RouteAnalysisResponse,
  RouteWeights,
  RoverObservation,
  ScienceTarget,
} from '../../shared/types';

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = payload?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return payload as T;
}

export const apiClient = {
  getRegions: () => apiFetch<{ regions: Region[]; lastSynchronized: string }>('/api/regions'),
  getDatasets: () => apiFetch<{ datasets: Dataset[]; lastSynchronized: string }>('/api/datasets'),
  getObjectives: () =>
    apiFetch<{ objectives: ObjectiveRule[]; presets: Record<RouteWeights['preset'], RouteWeights> }>('/api/objectives'),

  getEvidence: (regionId: string, objectiveId: string) =>
    apiFetch<{
      region: Region;
      objective: ObjectiveRule;
      targets: ScienceTarget[];
      convergenceGrid: GeoJSON.FeatureCollection;
      dataStatus: string;
      lastSynchronized: string;
    }>(`/api/evidence?regionId=${encodeURIComponent(regionId)}&objectiveId=${encodeURIComponent(objectiveId)}`),

  getGeology: (bbox: [number, number, number, number]) =>
    apiFetch<{ collection: GeoJSON.FeatureCollection; provenance: Provenance }>(
      `/api/layers/geology?bbox=${bbox.join(',')}`
    ),

  getDunes: (bbox: [number, number, number, number]) =>
    apiFetch<{ collection: GeoJSON.FeatureCollection; provenance: Provenance }>(
      `/api/layers/dunes?bbox=${bbox.join(',')}`
    ),

  getSpectral: (bbox: [number, number, number, number]) =>
    apiFetch<{
      points: { collection: GeoJSON.FeatureCollection; provenance: Provenance };
      frtFootprints: { collection: GeoJSON.FeatureCollection; provenance: Provenance };
    }>(`/api/layers/spectral?bbox=${bbox.join(',')}`),

  getTraverse: () =>
    apiFetch<{
      traverse: GeoJSON.FeatureCollection;
      waypoints: Array<{
        sol: number;
        site: number | null;
        drive: number | null;
        coordinates: [number, number];
        elevationM: number | null;
        tiltDeg: number | null;
        distTotalM: number | null;
      }>;
      provenance: Provenance;
    }>('/api/layers/traverse'),

  getObservations: (sol?: number) =>
    apiFetch<{
      observations: RoverObservation[];
      status: string;
      retrievedAt: string;
      provenance: Provenance;
    }>(sol !== undefined ? `/api/observations?sol=${sol}` : '/api/observations'),

  getEnvironment: (regionId: string) =>
    apiFetch<EnvironmentContextResponse>(`/api/environment?regionId=${encodeURIComponent(regionId)}`),

  getTerrainPoint: (lon: number, lat: number) =>
    apiFetch<{
      lon: number;
      lat: number;
      elevationM: number | null;
      localSlopeDeg: number | null;
      dataStatus: 'AVAILABLE' | 'DATA UNAVAILABLE';
      resolution: string;
      provenance: Provenance;
    }>(`/api/terrain/point?lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}`),

  getTerrainPreview: (bbox?: [number, number, number, number]) =>
    apiFetch<{
      bbox: [number, number, number, number];
      cellSizeM: number;
      demSourceId: string;
      resolution: string;
      hazardGeoJson: GeoJSON.FeatureCollection;
      retrievedAt: string;
    }>(bbox ? `/api/terrain/preview?bbox=${bbox.join(',')}` : '/api/terrain/preview'),

  analyzeRoutes: (body: {
    regionId: string;
    objectiveId: string;
    targetId?: string;
    start: [number, number];
    end: [number, number];
    gridSize?: number;
    customWeights?: {
      maxSlopeDeg?: number;
      avoidDunes?: boolean;
      wSlope?: number;
      wScience?: number;
    };
  }) =>
    apiFetch<RouteAnalysisResponse & { runId: string }>('/api/routes/analyze', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  generateBrief: (body: {
    regionId: string;
    objectiveId: string;
    targetId: string;
    routeId: string;
    routeAnalysisId?: string;
    includeAiSummary?: boolean;
  }) =>
    apiFetch<MissionBrief>('/api/mission/brief', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  search: (q: string) =>
    apiFetch<{
      query: string;
      results: Array<{
        kind: 'COORDINATE' | 'REGION' | 'DATASET' | 'OBJECTIVE' | 'GAZETTEER' | 'TARGET';
        id: string;
        title: string;
        subtitle: string;
        coordinates?: [number, number];
        datasetId?: string;
        objectiveId?: string;
        provenanceNote: string;
      }>;
    }>(`/api/search?q=${encodeURIComponent(q)}`),
};
