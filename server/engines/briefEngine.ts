import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { getDb } from '../db.js';
import { NASA_NON_ENDORSEMENT_DISCLAIMER } from '../catalog.js';
import type {
  EnvironmentContextResponse,
  MissionBrief,
  ObjectiveRule,
  Region,
  RouteCandidate,
  ScienceTarget,
} from '../../shared/types.js';

export async function generateMissionBrief(params: {
  region: Region;
  objective: ObjectiveRule;
  target: ScienceTarget;
  route: RouteCandidate;
  demSource: string;
  gridCellSizeM: number;
  env: EnvironmentContextResponse;
  includeAiSummary?: boolean;
}): Promise<MissionBrief> {
  const { region, objective, target, route, demSource, gridCellSizeM, env, includeAiSummary } = params;

  const dataSourceMap = new Map<
    string,
    {
      sourceId: string;
      sourceName: string;
      mission: string;
      instrument: string;
      sourceUrl: string;
      retrievedAt: string;
      status: MissionBrief['dataSources'][number]['status'];
      attribution: string;
    }
  >();

  const registerProv = (p: ScienceTarget['provenance'] | null | undefined) => {
    if (!p) return;
    dataSourceMap.set(p.sourceId, {
      sourceId: p.sourceId,
      sourceName: p.sourceName,
      mission: p.mission,
      instrument: p.instrument,
      sourceUrl: p.sourceUrl,
      retrievedAt: p.retrievedAt,
      status: p.status,
      attribution: p.attribution,
    });
  };

  registerProv(region.provenance);
  registerProv(route.provenance);
  target.evidenceItems.forEach((ev) => registerProv(ev.provenance));
  if (target.nearestRoverObservation) registerProv(target.nearestRoverObservation.provenance);
  registerProv(env.rems.provenance);
  registerProv(env.rad.provenance);

  const latestRems = env.rems.records[0];
  const remsSummary = latestRems
    ? `Latest REMS Sol ${latestRems.sol} (${latestRems.terrestrialDate}): Air ${latestRems.minTempC ?? 'N/A'}°C to ${latestRems.maxTempC ?? 'N/A'}°C, Pressure ${latestRems.pressurePa ?? 'N/A'} Pa, UV ${latestRems.uvIndex}. Historical rover meteorology only — not a forecast.`
    : 'REMS meteorological data unavailable for current request.';

  const latestRad = env.rad.records[env.rad.records.length - 1];
  const radSummary = latestRad
    ? `PDS RAD Sol ${latestRad.sol} (${latestRad.productId}): Observed dose rate ~${latestRad.doseRateBPerDay ?? 'N/A'} uGy/Earth-day (Detector B). Historical rover dosimetry only — not a crew dose prediction.`
    : 'MSL RAD historical dosimetry unavailable in current response.';

  const deterministicInput = {
    regionId: region.id,
    objectiveId: objective.id,
    targetId: target.id,
    targetScore: target.score,
    routeId: route.id,
    routePreset: route.preset,
    weights: route.weights,
    distanceM: route.distanceM,
    elevationGainM: route.elevationGainM,
    maxSlopeDeg: route.maxSlopeDeg,
    demSource,
    gridCellSizeM,
  };

  const contentHash = createHash('sha256')
    .update(JSON.stringify(deterministicInput))
    .digest('hex');

  const briefId = `brief-${contentHash.slice(0, 16)}`;
  const generatedAt = new Date().toISOString();

  let aiNarrative: MissionBrief['aiNarrative'] = null;
  if (includeAiSummary && process.env.GEMINI_API_KEY) {
    try {
      const groundedPayload = {
        target: { id: target.id, name: target.name, score: target.score, whyHere: target.whyHere },
        route: {
          id: route.id,
          preset: route.preset,
          feasible: route.feasible,
          distanceM: route.distanceM,
          elevationGainM: route.elevationGainM,
          maxSlopeDeg: route.maxSlopeDeg,
          meanSlopeDeg: route.meanSlopeDeg,
          activeConstraints: route.activeConstraints,
        },
        provenanceIds: [...dataSourceMap.keys()],
      };
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are a planetary mission planner summarizing verified Marswalk data. Write a concise 3-sentence factual field summary strictly using ONLY the JSON values below. You MUST cite at least two provenanceIds in square brackets (e.g. [trek-gale-dem-1m]). Never invent numbers, and never make unverified safety guarantees or claim a corridor is flight-certified. JSON:\n${JSON.stringify(groundedPayload)}`,
      });
      const text = response.text?.trim() ?? '';
      const citedIds = [...dataSourceMap.keys()].filter((id) => text.includes(id));
      if (text && citedIds.length > 0 && !/guaranteed/i.test(text)) {
        aiNarrative = {
          label: 'AI-GENERATED FROM VERIFIED DATA',
          text,
          citedIds,
          inputPayload: groundedPayload,
        };
      }
    } catch {
      aiNarrative = null;
    }
  }

  const brief: MissionBrief = {
    id: briefId,
    generatedAt,
    contentHash,
    title: `MARS//PATH Field Plan — ${target.name}`,
    region,
    objective,
    target,
    route,
    whyTarget: target.whyHere,
    whyRoute: route.whyRoute,
    evidenceSummary: target.evidenceItems,
    environmentContext: {
      remsSummary,
      radSummary,
    },
    parameters: {
      weights: route.weights,
      demSource,
      gridCellSizeM,
      crs: region.crs,
    },
    dataSources: [...dataSourceMap.values()],
    limitations: {
      dataCoverage: [
        'High-resolution 1 m/px Gale_DEM_SMG_1m covers 137.1225..137.7298°E, -4.9255..-4.2490°N only.',
        'USGS SIM 3292 is mapped at 1:20,000,000 global scale and generalizes crater-floor contacts.',
      ],
      resolution: [
        `Routing terrain grid resampled to ${gridCellSizeM} m spacing; sub-grid boulders, small craters (<${gridCellSizeM} m), and loose dust drifts are NOT resolved.`,
        'THEMIS Night IR thermal inertia proxy is 100 m/px.',
      ],
      temporalLimitations: [
        'REMS weather and PDS RAD dosimetry represent historical Curiosity rover observations, not real-time forecasts or solar particle event warnings.',
      ],
      modelingAssumptions: [
        'ASSUMPTION: Slope penalties adapt terrestrial Tobler walking effort rather than flight-certified Mars EVA suit metabolic curves.',
        'ASSUMPTION: Max slope limits (12°–22°) and walking speeds (0.55–0.75 m/s) are configurable planning assumptions.',
      ],
      missingData: [
        'Subsurface ground-penetrating radar (SHARAD) polygons and high-res 1:50k local Gale geologic vector polygons are not available via verified live REST feeds.',
      ],
    },
    nasaDisclaimer: NASA_NON_ENDORSEMENT_DISCLAIMER,
    aiNarrative,
  };

  try {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO mission_plans (plan_id, content_hash, region_id, objective_id, target_id, route_id, brief_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(brief.id, brief.contentHash, region.id, objective.id, target.id, route.id, JSON.stringify(brief), brief.generatedAt);
  } catch {
    // Non-fatal if DB read-only
  }

  return brief;
}
