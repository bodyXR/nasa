import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { DATASETS, NASA_NON_ENDORSEMENT_DISCLAIMER, OBJECTIVES, REGIONS, ROUTE_PRESETS } from './catalog.js';
import { getDb } from './db.js';
import { getBreakerSnapshot, SourceAdapterError } from './httpClient.js';
import { sampleDemGrid, samplePointElevation } from './adapters/trekDem.js';
import {
  fetchDuneFields,
  fetchGeologyUnits,
  fetchSpectralDetections,
  searchIauNomenclature,
} from './adapters/trekFeatures.js';
import {
  fetchCuriosityObservations,
  fetchCuriosityTraverseAndWaypoints,
  fetchRadContext,
  fetchRemsWeatherSeries,
} from './adapters/mslRover.js';
import { buildHazardGeoJson, deriveTerrainFromElevations } from './engines/terrainEngine.js';
import { computeSlopeSensitivity, runAStarRoute } from './engines/routeEngine.js';
import { evaluateEvidenceTargets } from './engines/evidenceEngine.js';
import { generateMissionBrief } from './engines/briefEngine.js';
import { handleTrekTileProxy } from './tileProxy.js';
import { marsDistanceM, normalizeLon180 } from '../shared/geo.js';
import type { ApiErrorEnvelope, RouteAnalysisResponse, RouteWeights } from '../shared/types.js';

function parseBboxQuery(raw: unknown, fallback: [number, number, number, number]): [number, number, number, number] {
  if (typeof raw !== 'string') return fallback;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return fallback;
  return [parts[0], parts[1], parts[2], parts[3]];
}

const AnalyzeRouteBodySchema = z.object({
  regionId: z.string().default('gale-crater'),
  objectiveId: z.string().default('ancient-water'),
  targetId: z.string().optional(),
  start: z.tuple([z.number(), z.number()]),
  end: z.tuple([z.number(), z.number()]),
  gridSize: z.number().int().min(12).max(32).default(24),
  customWeights: z
    .object({
      maxSlopeDeg: z.number().min(5).max(40).optional(),
      wSlope: z.number().min(0).max(10).optional(),
      wTerrain: z.number().min(0).max(10).optional(),
      wHazard: z.number().min(0).max(20).optional(),
      wScience: z.number().min(0).max(0.8).optional(),
      avoidDunes: z.boolean().optional(),
    })
    .optional(),
});

const TerrainProfileBodySchema = z.object({
  points: z.array(z.tuple([z.number(), z.number()])).min(2).max(25),
});

const BriefBodySchema = z.object({
  regionId: z.string().default('gale-crater'),
  objectiveId: z.string().default('ancient-water'),
  targetId: z.string(),
  routeId: z.string(),
  routeAnalysisId: z.string().optional(),
  includeAiSummary: z.boolean().default(false),
});

function sendError(res: Response, status: number, envelope: ApiErrorEnvelope): void {
  res.status(status).json(envelope);
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  // Structured request logging
  router.use((req: Request, res: Response, next: NextFunction) => {
    const startMs = Date.now();
    res.on('finish', () => {
      if (!req.path.startsWith('/tiles/')) {
        const ms = Date.now() - startMs;
        console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
      }
    });
    next();
  });

  // WMTS Equirectangular tile proxy
  router.get('/tiles/:layer/:z/:row/:col', handleTrekTileProxy);

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'mars-path-api',
      timestamp: new Date().toISOString(),
      verifiedDatasetCount: DATASETS.length,
      circuitBreakers: getBreakerSnapshot(),
      disclaimer: NASA_NON_ENDORSEMENT_DISCLAIMER,
    });
  });

  router.get('/config/maps', (_req, res) => {
    const apiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      '';
    res.json({ configured: Boolean(apiKey), apiKey });
  });

  router.get('/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'MARS//PATH Planetary Data & Marswalk Planning API',
        version: '1.0.0',
        description: 'Grounded NASA/USGS planetary data fusion, terrain modeling, and deterministic A* route analysis API.',
      },
      paths: {
        '/api/health': { get: { summary: 'Service health and circuit breaker state' } },
        '/api/regions': { get: { summary: 'Verified planetary study regions' } },
        '/api/datasets': { get: { summary: 'Verified NASA/USGS datasets with provenance' } },
        '/api/objectives': { get: { summary: 'Data-driven scientific mission objectives' } },
        '/api/missions': { get: { summary: 'Missions and instruments index' } },
        '/api/evidence': { get: { summary: 'Evaluate objective rules over spatial datasets' } },
        '/api/targets': { get: { summary: 'Candidate scientific targets with transparent evidence checks' } },
        '/api/observations': { get: { summary: 'Curiosity rover raw imagery joined to verifiable waypoints' } },
        '/api/environment': { get: { summary: 'Historical MSL REMS meteorology and PDS RAD radiation context' } },
        '/api/terrain/point': { get: { summary: 'Live DEM elevation sample at (lon, lat)' } },
        '/api/terrain/profile': { post: { summary: 'Elevation and slope profile along polyline' } },
        '/api/routes/analyze': { post: { summary: 'Windowed DEM terrain derivation and multi-preset A* routing' } },
        '/api/routes/{id}': { get: { summary: 'Retrieve cached route analysis run' } },
        '/api/mission/brief': { post: { summary: 'Generate reproducible Field Plan brief with SHA-256 hash' } },
        '/api/search': { get: { summary: 'Universal search across IAU gazetteer, datasets, targets, and coords' } },
      },
    });
  });

  router.get('/regions', (_req, res) => {
    res.json({ regions: REGIONS, lastSynchronized: new Date().toISOString() });
  });

  router.get('/datasets', (_req, res) => {
    res.json({ datasets: DATASETS, lastSynchronized: new Date().toISOString() });
  });

  router.get('/objectives', (_req, res) => {
    res.json({ objectives: OBJECTIVES, presets: ROUTE_PRESETS });
  });

  router.get('/missions', (_req, res) => {
    const missionsMap = new Map<string, { mission: string; instruments: Set<string>; datasets: string[] }>();
    for (const ds of DATASETS) {
      const existing = missionsMap.get(ds.mission) ?? {
        mission: ds.mission,
        instruments: new Set<string>(),
        datasets: [],
      };
      existing.instruments.add(ds.instrument);
      existing.datasets.push(ds.id);
      missionsMap.set(ds.mission, existing);
    }
    res.json({
      missions: [...missionsMap.values()].map((m) => ({
        mission: m.mission,
        instruments: [...m.instruments],
        datasets: m.datasets,
      })),
    });
  });

  router.get('/layers/geology', async (req, res) => {
    try {
      const bbox = parseBboxQuery(req.query.bbox, REGIONS[0].bbox);
      const data = await fetchGeologyUnits(bbox);
      res.json(data);
    } catch (err) {
      handleAdapterError(res, err, 'usgs-sim3292-geo');
    }
  });

  router.get('/layers/dunes', async (req, res) => {
    try {
      const bbox = parseBboxQuery(req.query.bbox, REGIONS[0].bbox);
      const data = await fetchDuneFields(bbox);
      res.json(data);
    } catch (err) {
      handleAdapterError(res, err, 'trek-dune-fields');
    }
  });

  router.get('/layers/spectral', async (req, res) => {
    try {
      const bbox = parseBboxQuery(req.query.bbox, [136.8, -5.8, 138.2, -4.1]);
      const data = await fetchSpectralDetections(bbox);
      res.json(data);
    } catch (err) {
      handleAdapterError(res, err, 'trek-crism-spectral');
    }
  });

  router.get('/layers/traverse', async (_req, res) => {
    try {
      const data = await fetchCuriosityTraverseAndWaypoints();
      res.json(data);
    } catch (err) {
      handleAdapterError(res, err, 'msl-rover-observations');
    }
  });

  router.get('/observations', async (req, res) => {
    try {
      const solRaw = req.query.sol !== undefined ? Number(req.query.sol) : undefined;
      const solFilter = solRaw !== undefined && Number.isFinite(solRaw) ? solRaw : undefined;
      const data = await fetchCuriosityObservations(solFilter);
      res.json(data);
    } catch (err) {
      handleAdapterError(res, err, 'msl-raw-images');
    }
  });

  router.get('/environment', async (req, res) => {
    const regionId = String(req.query.regionId ?? 'gale-crater');
    try {
      const [remsRes, radRes] = await Promise.all([fetchRemsWeatherSeries(30), fetchRadContext()]);
      res.json({
        regionId,
        rems: {
          available: remsRes.records.length > 0,
          records: remsRes.records,
          statement:
            'Historical Curiosity REMS surface meteorological measurements in Gale Crater. Not a weather forecast.',
          provenance: remsRes.provenance,
        },
        rad: {
          available: radRes.available,
          records: radRes.records,
          statement:
            'Historical Curiosity RAD Level-3 RDR surface dosimetry from NASA PDS-PPI. Not a space-weather forecast or astronaut crew dose prediction.',
          provenance: radRes.provenance,
        },
        lastSynchronized: new Date().toISOString(),
      });
    } catch (err) {
      handleAdapterError(res, err, 'msl-rems-rad-env');
    }
  });

  const evidenceMemo = new Map<string, { payload: Awaited<ReturnType<typeof buildEvidenceAndTargetsInternal>>; expiresAt: number }>();
  const inflightEvidence = new Map<string, Promise<Awaited<ReturnType<typeof buildEvidenceAndTargetsInternal>>>>();

  async function buildEvidenceAndTargetsInternal(regionId: string, objectiveId: string) {
    const region = REGIONS.find((r) => r.id === regionId) ?? REGIONS[0];
    const objective = OBJECTIVES.find((o) => o.id === objectiveId) ?? OBJECTIVES[0];

    const [geoRes, specRes, duneRes, travRes, obsRes] = await Promise.all([
      fetchGeologyUnits(region.bbox),
      fetchSpectralDetections([136.8, -5.8, 138.2, -4.1]),
      fetchDuneFields(region.bbox),
      fetchCuriosityTraverseAndWaypoints(),
      fetchCuriosityObservations(),
    ]);

    const evaluated = await evaluateEvidenceTargets({
      objective,
      regionId: region.id,
      geologyFeatures: geoRes.collection.features,
      geologyProvenance: geoRes.provenance,
      spectralPoints: specRes.points.collection.features,
      spectralFootprints: specRes.frtFootprints.collection.features,
      spectralProvenance: specRes.points.provenance,
      frtProvenance: specRes.frtFootprints.provenance,
      duneFeatures: duneRes.collection.features,
      waypoints: travRes.waypoints,
      waypointsProvenance: travRes.provenance,
      observations: obsRes.observations,
    });

    return {
      region,
      objective,
      targets: evaluated.targets,
      convergenceGrid: evaluated.convergenceGrid,
      dataStatus: geoRes.status === 'LIVE' || obsRes.status === 'LIVE' ? 'LIVE' : 'CACHED',
      lastSynchronized: new Date().toISOString(),
    };
  }

  async function buildEvidenceAndTargets(regionId: string, objectiveId: string) {
    const key = `${regionId}:${objectiveId}`;
    const hit = evidenceMemo.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.payload;
    }
    let job = inflightEvidence.get(key);
    if (!job) {
      job = buildEvidenceAndTargetsInternal(regionId, objectiveId)
        .then((payload) => {
          evidenceMemo.set(key, { payload, expiresAt: Date.now() + 120_000 });
          return payload;
        })
        .finally(() => {
          inflightEvidence.delete(key);
        });
      inflightEvidence.set(key, job);
    }
    return job;
  }

  const terrainPointMemo = new Map<string, { payload: unknown; expiresAt: number }>();
  const terrainPreviewMemo = new Map<string, { payload: unknown; expiresAt: number }>();

  router.get('/evidence', async (req, res) => {
    try {
      const regionId = String(req.query.regionId ?? 'gale-crater');
      const objectiveId = String(req.query.objectiveId ?? 'ancient-water');
      const out = await buildEvidenceAndTargets(regionId, objectiveId);
      res.json(out);
    } catch (err) {
      handleAdapterError(res, err, 'evidence-engine');
    }
  });

  router.get('/targets', async (req, res) => {
    try {
      const regionId = String(req.query.regionId ?? 'gale-crater');
      const objectiveId = String(req.query.objectiveId ?? 'ancient-water');
      const out = await buildEvidenceAndTargets(regionId, objectiveId);
      res.json({
        regionId: out.region.id,
        objectiveId: out.objective.id,
        targets: out.targets,
        lastSynchronized: out.lastSynchronized,
      });
    } catch (err) {
      handleAdapterError(res, err, 'target-engine');
    }
  });

  router.get('/terrain/point', async (req, res) => {
    const lon = Number(req.query.lon);
    const lat = Number(req.query.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      sendError(res, 400, {
        code: 'INVALID_COORDS',
        message: 'Query parameters lon and lat must be finite numbers.',
        source: 'terrain-point',
        retryable: false,
      });
      return;
    }
    const cacheKey = `${lon.toFixed(5)}:${lat.toFixed(5)}`;
    const memo = terrainPointMemo.get(cacheKey);
    if (memo && memo.expiresAt > Date.now()) {
      res.json(memo.payload);
      return;
    }
    try {
      // Sample center + 25m offsets to estimate local slope cleanly on demand
      const dLat = 0.00042;
      const dLon = 0.00042;
      const [center, north, east] = await Promise.all([
        samplePointElevation(lon, lat),
        samplePointElevation(lon, lat + dLat),
        samplePointElevation(lon + dLon, lat),
      ]);
      let localSlopeDeg: number | null = null;
      if (center.elevationM !== null && north.elevationM !== null && east.elevationM !== null) {
        const dy = marsDistanceM([lon, lat], [lon, lat + dLat]);
        const dx = marsDistanceM([lon, lat], [lon + dLon, lat]);
        const dzdy = (north.elevationM - center.elevationM) / Math.max(1, dy);
        const dzdx = (east.elevationM - center.elevationM) / Math.max(1, dx);
        localSlopeDeg = Number(((Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180) / Math.PI).toFixed(2));
      }
      const payload = {
        lon: normalizeLon180(lon),
        lat,
        elevationM: center.elevationM,
        localSlopeDeg,
        dataStatus: center.elevationM !== null ? 'AVAILABLE' : 'DATA UNAVAILABLE',
        resolution: center.resolution,
        provenance: center.provenance,
      };
      if (terrainPointMemo.size > 300) {
        const first = terrainPointMemo.keys().next().value;
        if (first) terrainPointMemo.delete(first);
      }
      terrainPointMemo.set(cacheKey, { payload, expiresAt: Date.now() + 600_000 });
      res.json(payload);
    } catch (err) {
      handleAdapterError(res, err, 'trek-gale-dem-1m');
    }
  });

  router.get('/terrain/preview', async (req, res) => {
    const fallbackBbox: [number, number, number, number] = [137.36, -4.845, 137.415, -4.74];
    const bbox = parseBboxQuery(req.query.bbox, fallbackBbox);
    const key = bbox.map((v) => v.toFixed(4)).join(',');
    const hit = terrainPreviewMemo.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      res.json(hit.payload);
      return;
    }
    try {
      const [demGrid, duneRes] = await Promise.all([
        sampleDemGrid(bbox, 16, 16),
        fetchDuneFields(bbox),
      ]);
      const derived = deriveTerrainFromElevations({
        id: demGrid.gridId,
        bbox,
        elevations: demGrid.elevations,
        demSourceId: demGrid.demSourceId,
        demResolution: demGrid.resolution,
        provenance: demGrid.provenance,
        duneFeatures: duneRes.collection.features,
        sciencePoints: [],
      });
      const hazardOverlay = buildHazardGeoJson(derived, 18);
      const payload = {
        bbox,
        cellSizeM: derived.cellSizeM,
        demSourceId: derived.demSourceId,
        resolution: derived.demResolution,
        hazardGeoJson: hazardOverlay.hazardGeoJson,
        retrievedAt: demGrid.retrievedAt,
      };
      terrainPreviewMemo.set(key, { payload, expiresAt: Date.now() + 600_000 });
      res.json(payload);
    } catch (err) {
      handleAdapterError(res, err, 'trek-gale-dem-1m');
    }
  });

  router.post('/terrain/profile', async (req, res) => {
    const parsed = TerrainProfileBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, {
        code: 'INVALID_PROFILE_INPUT',
        message: parsed.error.message,
        source: 'terrain-profile',
        retryable: false,
      });
      return;
    }
    try {
      const samples = await Promise.all(
        parsed.data.points.map(([lon, lat]) => samplePointElevation(lon, lat))
      );
      let cumDistM = 0;
      const profile = samples.map((s, idx) => {
        if (idx > 0) {
          cumDistM += marsDistanceM(parsed.data.points[idx - 1], parsed.data.points[idx]);
        }
        const prev = idx > 0 ? samples[idx - 1] : null;
        let segSlopeDeg: number | null = null;
        if (prev && prev.elevationM !== null && s.elevationM !== null) {
          const d = marsDistanceM(parsed.data.points[idx - 1], parsed.data.points[idx]);
          segSlopeDeg = Number(
            ((Math.atan2(Math.abs(s.elevationM - prev.elevationM), Math.max(1, d)) * 180) / Math.PI).toFixed(2)
          );
        }
        return {
          index: idx,
          coordinates: parsed.data.points[idx],
          distanceM: Number(cumDistM.toFixed(1)),
          elevationM: s.elevationM,
          slopeDeg: segSlopeDeg,
          demSourceId: s.demSourceId,
        };
      });
      res.json({
        profile,
        provenance: samples[0]?.provenance ?? null,
      });
    } catch (err) {
      handleAdapterError(res, err, 'trek-gale-dem-1m');
    }
  });

  router.post('/routes/analyze', async (req, res) => {
    const parsed = AnalyzeRouteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, {
        code: 'INVALID_ROUTE_INPUT',
        message: parsed.error.message,
        source: 'route-engine',
        retryable: false,
      });
      return;
    }

    const { regionId, objectiveId, targetId, start, end, gridSize, customWeights } = parsed.data;
    try {
      // Build corridor bounding box around start/end with generous margin (~35%)
      const spanLon = Math.max(0.018, Math.abs(end[0] - start[0]) * 1.45);
      const spanLat = Math.max(0.018, Math.abs(end[1] - start[1]) * 1.45);
      const midLon = (start[0] + end[0]) / 2;
      const midLat = (start[1] + end[1]) / 2;
      const bbox: [number, number, number, number] = [
        Number((midLon - spanLon / 2).toFixed(5)),
        Number((midLat - spanLat / 2).toFixed(5)),
        Number((midLon + spanLon / 2).toFixed(5)),
        Number((midLat + spanLat / 2).toFixed(5)),
      ];

      const [demGrid, duneRes, specRes] = await Promise.all([
        sampleDemGrid(bbox, gridSize, gridSize),
        fetchDuneFields(bbox),
        fetchSpectralDetections([bbox[0] - 0.1, bbox[1] - 0.1, bbox[2] + 0.1, bbox[3] + 0.1]),
      ]);

      const sciPoints = specRes.points.collection.features.flatMap((f) =>
        f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates)
          ? [{ coordinates: f.geometry.coordinates as [number, number], weight: 0.9 }]
          : []
      );

      // Include objective anchor zone science bonus
      const obj = OBJECTIVES.find((o) => o.id === objectiveId) ?? OBJECTIVES[0];
      obj.anchorZones.forEach((az) => sciPoints.push({ coordinates: az.center, weight: 1.0 }));

      const derived = deriveTerrainFromElevations({
        id: demGrid.gridId,
        bbox,
        elevations: demGrid.elevations,
        demSourceId: demGrid.demSourceId,
        demResolution: demGrid.resolution,
        provenance: demGrid.provenance,
        duneFeatures: duneRes.collection.features,
        sciencePoints: sciPoints,
      });

      const presetKeys: RouteWeights['preset'][] = [
        'SHORTEST',
        'LOWER_TERRAIN_COST',
        'SCIENCE_ORIENTED',
        'PAIR_EVA',
        'ROVER_ASSISTED',
      ];

      const candidates = presetKeys.map((presetKey) => {
        const baseW = ROUTE_PRESETS[presetKey];
        const merged: RouteWeights =
          presetKey === 'LOWER_TERRAIN_COST' && customWeights
            ? { ...baseW, ...customWeights }
            : baseW;
        return runAStarRoute(
          derived,
          start,
          end,
          merged,
          `route-${presetKey.toLowerCase()}-${Date.now().toString(36)}`
        );
      });

      const sensitivity = computeSlopeSensitivity(
        derived,
        start,
        end,
        { ...ROUTE_PRESETS.LOWER_TERRAIN_COST, ...(customWeights ?? {}) }
      );

      const activeSlopeCutoff = customWeights?.maxSlopeDeg ?? ROUTE_PRESETS.LOWER_TERRAIN_COST.maxSlopeDeg;
      const hazardOverlay = buildHazardGeoJson(derived, activeSlopeCutoff);

      const responsePayload: RouteAnalysisResponse = {
        regionId,
        objectiveId,
        targetId,
        start,
        end,
        terrain: {
          id: derived.id,
          bbox: derived.bbox,
          rows: derived.rows,
          cols: derived.cols,
          cellSizeM: derived.cellSizeM,
          crs: derived.crs,
          demSourceId: derived.demSourceId,
          demResolution: derived.demResolution,
          minElevM: derived.minElevM,
          maxElevM: derived.maxElevM,
          maxSlopeDeg: derived.maxSlopeDeg,
          meanSlopeDeg: derived.meanSlopeDeg,
          hazardCellsCount: hazardOverlay.hazardCellsCount,
          noDataCellsCount: derived.noDataCellsCount,
          duneHazardCellsCount: derived.duneHazardCellsCount,
          elevations: derived.elevations.map((row) => row.map((v) => v ?? NaN)),
          slopesDeg: derived.slopesDeg,
          hazardGeoJson: hazardOverlay.hazardGeoJson,
          provenance: derived.provenance,
        },
        candidates,
        sensitivity,
        limitations: [
          `Terrain cost grid cell spacing is ${derived.cellSizeM} m derived from ${derived.demSourceId} (${derived.demResolution}).`,
          'MOLA/CTX/HiRISE orbital DEMs do not resolve sub-grid boulders, small craters, or loose sand bearing strength.',
          'ASSUMPTION: Slope penalties and EVA walking speeds are adapted terrestrial models, NOT NASA-certified suit measurements.',
        ],
        lastSynchronized: demGrid.retrievedAt,
        dataStatus: demGrid.status,
      };

      const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        const db = getDb();
        db.prepare(
          `INSERT INTO route_runs (route_run_id, region_id, objective_id, target_id, params_json, result_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          runId,
          regionId,
          objectiveId,
          targetId ?? null,
          JSON.stringify(parsed.data),
          JSON.stringify(responsePayload),
          new Date().toISOString()
        );
      } catch {
        // Non-fatal
      }

      res.json({ runId, ...responsePayload });
    } catch (err) {
      handleAdapterError(res, err, 'route-engine');
    }
  });

  router.get('/routes/:id', (req, res) => {
    const db = getDb();
    const row = db
      .prepare('SELECT result_json FROM route_runs WHERE route_run_id = ?')
      .get(req.params.id) as { result_json: string } | undefined;
    if (!row) {
      sendError(res, 404, {
        code: 'ROUTE_NOT_FOUND',
        message: `Route run ${req.params.id} not found`,
        source: 'route-store',
        retryable: false,
      });
      return;
    }
    res.json(JSON.parse(row.result_json));
  });

  router.post('/mission/brief', async (req, res) => {
    const parsed = BriefBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, {
        code: 'INVALID_BRIEF_INPUT',
        message: parsed.error.message,
        source: 'brief-engine',
        retryable: false,
      });
      return;
    }
    try {
      const { regionId, objectiveId, targetId, routeId, routeAnalysisId, includeAiSummary } = parsed.data;
      const evidenceOut = await buildEvidenceAndTargets(regionId, objectiveId);
      const target = evidenceOut.targets.find((t) => t.id === targetId) ?? evidenceOut.targets[0];
      if (!target) {
        sendError(res, 404, {
          code: 'TARGET_NOT_FOUND',
          message: 'No candidate target available to build mission brief.',
          source: 'brief-engine',
          retryable: false,
        });
        return;
      }

      let analysis: RouteAnalysisResponse | null = null;
      if (routeAnalysisId) {
        const row = getDb()
          .prepare('SELECT result_json FROM route_runs WHERE route_run_id = ?')
          .get(routeAnalysisId) as { result_json: string } | undefined;
        if (row) analysis = JSON.parse(row.result_json);
      }

      const route = analysis?.candidates.find((c) => c.id === routeId) ?? analysis?.candidates.find((c) => c.feasible) ?? analysis?.candidates[0];
      if (!route) {
        sendError(res, 400, {
          code: 'ROUTE_REQUIRED',
          message: 'Run terrain route analysis before generating a Field Plan brief.',
          source: 'brief-engine',
          retryable: false,
        });
        return;
      }

      const [remsRes, radRes] = await Promise.all([fetchRemsWeatherSeries(10), fetchRadContext()]);
      const env = {
        regionId,
        rems: {
          available: remsRes.records.length > 0,
          records: remsRes.records,
          statement: 'Historical Curiosity REMS meteorological data.',
          provenance: remsRes.provenance,
        },
        rad: {
          available: radRes.available,
          records: radRes.records,
          statement: 'Historical Curiosity PDS-PPI RAD dosimetry.',
          provenance: radRes.provenance,
        },
        lastSynchronized: new Date().toISOString(),
      };

      const brief = await generateMissionBrief({
        region: evidenceOut.region,
        objective: evidenceOut.objective,
        target,
        route,
        demSource: analysis?.terrain.demSourceId ?? 'trek-gale-dem-1m',
        gridCellSizeM: analysis?.terrain.cellSizeM ?? 45,
        env,
        includeAiSummary,
      });
      res.json(brief);
    } catch (err) {
      handleAdapterError(res, err, 'brief-engine');
    }
  });

  const searchHandler = async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      res.json({ results: [], query: q });
      return;
    }

    const results: Array<{
      kind: 'COORDINATE' | 'REGION' | 'DATASET' | 'OBJECTIVE' | 'GAZETTEER' | 'TARGET';
      id: string;
      title: string;
      subtitle: string;
      coordinates?: [number, number];
      datasetId?: string;
      objectiveId?: string;
      provenanceNote: string;
    }> = [];

    // 1. Check lat, lon coordinate match (e.g., "-4.826, 137.389" or "137.389, -4.826")
    const coordMatch = q.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      const n1 = Number(coordMatch[1]);
      const n2 = Number(coordMatch[2]);
      // Heuristic: Gale Crater lat is negative ~ -4.8, lon is ~ 137.4 (or -90..90 vs -180..360)
      const isFirstLat = Math.abs(n1) <= 90 && Math.abs(n2) > 90;
      const lat = isFirstLat ? n1 : Math.abs(n2) <= 90 ? n2 : n1;
      const lon = normalizeLon180(isFirstLat ? n2 : Math.abs(n2) <= 90 ? n1 : n2);
      results.push({
        kind: 'COORDINATE',
        id: `coord-${lat}-${lon}`,
        title: `Inspect Coordinate ${lat.toFixed(4)}°, ${lon.toFixed(4)}°E`,
        subtitle: 'Fly map and sample live DEM elevation & slope',
        coordinates: [lon, lat],
        provenanceNote: 'Direct EPSG:104905 planetocentric coordinate input',
      });
    }

    const ql = q.toLowerCase();
    for (const r of REGIONS) {
      if (r.name.toLowerCase().includes(ql) || r.subtitle.toLowerCase().includes(ql)) {
        results.push({
          kind: 'REGION',
          id: r.id,
          title: r.name,
          subtitle: r.subtitle,
          coordinates: r.center,
          provenanceNote: r.provenance.sourceName,
        });
      }
    }

    for (const ds of DATASETS) {
      if (
        ds.name.toLowerCase().includes(ql) ||
        ds.mission.toLowerCase().includes(ql) ||
        ds.instrument.toLowerCase().includes(ql) ||
        ds.type.toLowerCase().includes(ql)
      ) {
        results.push({
          kind: 'DATASET',
          id: ds.id,
          title: ds.name,
          subtitle: `${ds.mission} · ${ds.instrument} · ${ds.resolution}`,
          datasetId: ds.id,
          provenanceNote: ds.attribution,
        });
      }
    }

    for (const obj of OBJECTIVES) {
      if (obj.title.toLowerCase().includes(ql) || obj.scientificGoal.toLowerCase().includes(ql)) {
        results.push({
          kind: 'OBJECTIVE',
          id: obj.id,
          title: obj.title,
          subtitle: obj.subtitle,
          objectiveId: obj.id,
          coordinates: obj.anchorZones[0]?.center,
          provenanceNote: 'MARS//PATH Objective Rule Schema',
        });
      }
      for (const az of obj.anchorZones) {
        if (az.name.toLowerCase().includes(ql) || az.rationale.toLowerCase().includes(ql)) {
          results.push({
            kind: 'TARGET',
            id: az.id,
            title: az.name,
            subtitle: `Candidate target (${obj.title})`,
            objectiveId: obj.id,
            coordinates: az.center,
            provenanceNote: obj.provenance.sourceName,
          });
        }
      }
    }

    // Query live IAU Planetary Nomenclature via Mars Trek combinedNom
    try {
      const gaz = await searchIauNomenclature(q);
      for (const g of gaz.entries.slice(0, 12)) {
        results.push({
          kind: 'GAZETTEER',
          id: g.id,
          title: g.name,
          subtitle: `IAU ${g.featureType}${g.diameterKm ? ` · Ø ${g.diameterKm.toFixed(1)} km` : ''}`,
          coordinates: g.coordinates,
          provenanceNote: g.provenance.attribution,
        });
      }
    } catch {
      // Non-fatal if gazetteer temporarily unreachable
    }

    res.json({ query: q, results });
  };

  router.get('/search', searchHandler);
  router.get('/locations', searchHandler);

  return router;
}

function handleAdapterError(res: Response, err: unknown, fallbackSource: string): void {
  if (err instanceof SourceAdapterError) {
    const status = err.envelope.code.startsWith('HTTP_4') ? 400 : 502;
    sendError(res, status, err.envelope);
    return;
  }
  sendError(res, 500, {
    code: 'INTERNAL_SERVER_ERROR',
    message: err instanceof Error ? err.message : 'Unexpected server error',
    source: fallbackSource,
    retryable: true,
  });
}
