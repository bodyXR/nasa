import { z } from 'zod';
import { fetchCachedJson, fetchWithRetry } from '../httpClient.js';
import { readCache, writeCache } from '../db.js';
import type {
  DataStatus,
  Provenance,
  RadObservationSummary,
  RemsWeatherRecord,
  RoverObservation,
} from '../../shared/types.js';
import { normalizeLon180 } from '../../shared/geo.js';

const MSL_TRAVERSE_URL = 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json';
const MSL_WAYPOINTS_URL = 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json';
const MSL_RAW_IMAGES_URL =
  'https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=80&condition_1=msl:mission';
const MSL_REMS_URL = 'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json';
const PDS_RAD_INDEX_URL = 'https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/';

const WaypointCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      geometry: z.object({
        type: z.string(),
        coordinates: z.array(z.number()),
      }),
      properties: z.object({
        RMC: z.string().optional(),
        site: z.number().optional(),
        drive: z.number().optional(),
        sol: z.number(),
        elev_geoid: z.number().optional(),
        lon: z.number().optional(),
        lat: z.number().optional(),
        tilt: z.number().optional(),
        dist_total_m: z.number().optional(),
        yaw: z.number().optional(),
      }),
    })
  ),
});

const RawImagesResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      imageid: z.string(),
      sol: z.number(),
      instrument: z.string().optional(),
      title: z.string().optional(),
      caption: z.string().optional(),
      date_taken: z.string().optional(),
      site: z.number().nullable().optional(),
      drive: z.number().nullable().optional(),
      url: z.string(),
      https_url: z.string().optional(),
      extended: z.record(z.string(), z.any()).optional(),
    })
  ),
});

const RemsSchema = z.object({
  soles: z.array(z.record(z.string(), z.any())),
});

export interface WaypointNormalized {
  sol: number;
  site: number | null;
  drive: number | null;
  coordinates: [number, number];
  elevationM: number | null;
  tiltDeg: number | null;
  distTotalM: number | null;
}

export async function fetchCuriosityTraverseAndWaypoints(): Promise<{
  traverse: GeoJSON.FeatureCollection;
  waypoints: WaypointNormalized[];
  status: DataStatus;
  retrievedAt: string;
  provenance: Provenance;
}> {
  const [travRes, wpRes] = await Promise.all([
    fetchCachedJson('msl_traverse', 'msl-traverse', MSL_TRAVERSE_URL, 3600, (raw) => raw as GeoJSON.FeatureCollection),
    fetchCachedJson('msl_waypoints', 'msl-waypoints', MSL_WAYPOINTS_URL, 3600, (raw) =>
      WaypointCollectionSchema.parse(raw)
    ),
  ]);

  const waypoints: WaypointNormalized[] = wpRes.data.features.map((f) => {
    const p = f.properties;
    const coords = f.geometry.coordinates;
    const lon = normalizeLon180(p.lon ?? coords[0]);
    const lat = p.lat ?? coords[1];
    return {
      sol: p.sol,
      site: p.site ?? null,
      drive: p.drive ?? null,
      coordinates: [lon, lat],
      elevationM: typeof p.elev_geoid === 'number' ? Number(p.elev_geoid.toFixed(2)) : null,
      tiltDeg: typeof p.tilt === 'number' ? Number(p.tilt.toFixed(2)) : null,
      distTotalM: typeof p.dist_total_m === 'number' ? Number(p.dist_total_m.toFixed(1)) : null,
    };
  });

  const status: DataStatus = travRes.status === 'LIVE' || wpRes.status === 'LIVE' ? 'LIVE' : 'CACHED';

  return {
    traverse: travRes.data,
    waypoints,
    status,
    retrievedAt: wpRes.retrievedAt,
    provenance: {
      sourceId: 'msl-rover-observations',
      sourceName: 'NASA JPL MSL Curiosity MMGIS Traverse & Waypoints',
      mission: 'Mars Science Laboratory (Curiosity)',
      instrument: 'Rover Localization / Odometry',
      productId: 'MSL_traverse + MSL_waypoints',
      sourceUrl: MSL_WAYPOINTS_URL,
      retrievedAt: wpRes.retrievedAt,
      processing: ['Normalized MMGIS GeoJSON waypoints & 3D traverse coordinates'],
      license: 'Public Domain (NASA/JPL-Caltech)',
      attribution: 'NASA / JPL-Caltech MSL MMGIS',
      status,
      confidence: 'HIGH',
      limitations: ['Localization points reflect discrete end-of-drive positions; intermediate positions are interpolated along traverse line.'],
      classification: 'VERIFIED_FACT',
    },
  };
}

export async function fetchCuriosityObservations(solFilter?: number): Promise<{
  observations: RoverObservation[];
  status: DataStatus;
  retrievedAt: string;
  provenance: Provenance;
}> {
  const queryUrl =
    solFilter !== undefined
      ? `https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=60&condition_1=msl:mission&condition_2=${solFilter}:sol`
      : MSL_RAW_IMAGES_URL;

  const cacheKey = `msl_raw_images:${solFilter ?? 'latest'}`;

  const [imgRes, wpBundle] = await Promise.all([
    fetchCachedJson(cacheKey, 'msl-raw-images', queryUrl, 1800, (raw) => RawImagesResponseSchema.parse(raw)),
    fetchCuriosityTraverseAndWaypoints(),
  ]);

  // Index waypoints by site_drive and by sol for exact verifiable localization matching
  const bySiteDrive = new Map<string, WaypointNormalized>();
  const bySol = new Map<number, WaypointNormalized>();
  for (const wp of wpBundle.waypoints) {
    if (wp.site !== null && wp.drive !== null) {
      bySiteDrive.set(`${wp.site}_${wp.drive}`, wp);
    }
    bySol.set(wp.sol, wp);
  }

  const observations: RoverObservation[] = imgRes.data.items.map((item) => {
    const sdKey = item.site !== null && item.site !== undefined && item.drive !== null && item.drive !== undefined
      ? `${item.site}_${item.drive}`
      : null;
    const matchSiteDrive = sdKey ? bySiteDrive.get(sdKey) : undefined;
    const matchSol = !matchSiteDrive ? bySol.get(item.sol) : undefined;
    const wp = matchSiteDrive ?? matchSol;

    const imageUrl = item.https_url || item.url;
    const located = Boolean(wp);
    const localizationMethod = matchSiteDrive
      ? `Exact MSL site/drive match (site ${item.site}, drive ${item.drive})`
      : matchSol
        ? `Exact MSL sol waypoint match (Sol ${item.sol})`
        : 'UNLOCATED — No matching site/drive/sol entry in MSL_waypoints.json';

    return {
      id: `msl-img-${item.id}`,
      sol: item.sol,
      earthDate: item.date_taken ? item.date_taken.slice(0, 10) : 'Unknown date',
      instrument: item.instrument || 'MSL Camera',
      title: item.title || `${item.instrument || 'MSL'} · Sol ${item.sol}`,
      caption: item.caption || `Curiosity raw image ${item.imageid}`,
      imageUrl,
      thumbUrl: imageUrl,
      site: item.site ?? null,
      drive: item.drive ?? null,
      coordinates: wp ? wp.coordinates : null,
      elevationM: wp ? wp.elevationM : null,
      tiltDeg: wp ? wp.tiltDeg : null,
      located,
      localizationMethod,
      provenance: {
        sourceId: 'msl-raw-images',
        sourceName: 'NASA MSL Curiosity Raw Images Feed',
        mission: 'Mars Science Laboratory (Curiosity)',
        instrument: item.instrument || 'MSL Camera',
        productId: item.imageid,
        sourceUrl: queryUrl,
        retrievedAt: imgRes.retrievedAt,
        processing: [
          located ? `Localized via ${localizationMethod}` : 'Unlocated (no estimated position assigned)',
        ],
        license: 'Public Domain (NASA/JPL-Caltech/MSSS)',
        attribution: 'NASA / JPL-Caltech / MSSS',
        status: imgRes.status,
        confidence: located ? 'HIGH' : 'LOW',
        limitations: located
          ? ['Position reflects rover localization waypoint, not camera pointing intersection on distant ridges.']
          : ['Image has no verifiable waypoint match; listed as unlocated per MARS//PATH trust policy.'],
        classification: 'VERIFIED_FACT',
      },
    };
  });

  return {
    observations,
    status: imgRes.status,
    retrievedAt: imgRes.retrievedAt,
    provenance: {
      sourceId: 'msl-raw-images',
      sourceName: 'NASA MSL Curiosity Raw Images + MMGIS Waypoints',
      mission: 'Mars Science Laboratory (Curiosity)',
      instrument: 'Navcam / Mastcam / Hazcam / MAHLI / ChemCam',
      sourceUrl: queryUrl,
      retrievedAt: imgRes.retrievedAt,
      processing: ['Joined raw image metadata with verifiable MSL_waypoints localization'],
      license: 'Public Domain (NASA/JPL-Caltech/MSSS)',
      attribution: 'NASA / JPL-Caltech / MSSS',
      status: imgRes.status,
      confidence: 'HIGH',
      limitations: ['Raw images without verifiable site/drive/sol waypoint match are marked UNLOCATED.'],
      classification: 'VERIFIED_FACT',
    },
  };
}

export async function fetchRemsWeatherSeries(limit = 30): Promise<{
  records: RemsWeatherRecord[];
  status: DataStatus;
  retrievedAt: string;
  provenance: Provenance;
}> {
  const res = await fetchCachedJson('msl_rems_weather', 'msl-rems-weather', MSL_REMS_URL, 3600, (raw) =>
    RemsSchema.parse(raw)
  );

  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '--' || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const records: RemsWeatherRecord[] = res.data.soles.slice(0, limit).map((s) => ({
    sol: Number(s.sol),
    terrestrialDate: String(s.terrestrial_date ?? ''),
    ls: toNum(s.ls),
    season: String(s.season ?? 'Unknown'),
    minTempC: toNum(s.min_temp),
    maxTempC: toNum(s.max_temp),
    minGroundTempC: toNum(s.min_gts_temp),
    maxGroundTempC: toNum(s.max_gts_temp),
    pressurePa: toNum(s.pressure),
    uvIndex: String(s.local_uv_irradiance_index ?? 'DATA UNAVAILABLE'),
    opacity: String(s.atmo_opacity ?? 'DATA UNAVAILABLE'),
    sunrise: String(s.sunrise ?? '--'),
    sunset: String(s.sunset ?? '--'),
  }));

  return {
    records,
    status: res.status,
    retrievedAt: res.retrievedAt,
    provenance: {
      sourceId: 'msl-rems-weather',
      sourceName: 'NASA / CAB MSL REMS Surface Meteorology Feed',
      mission: 'Mars Science Laboratory (Curiosity)',
      instrument: 'REMS (Rover Environmental Monitoring Station)',
      sourceUrl: MSL_REMS_URL,
      retrievedAt: res.retrievedAt,
      processing: ['Parsed latest Gale Crater sol environmental series'],
      license: 'Public Domain / CAB Outreach Terms',
      attribution: 'Centro de Astrobiología (CAB) / NASA MSL REMS',
      status: res.status,
      confidence: 'HIGH',
      limitations: [
        'Historical rover-surface measurements only — NOT an atmospheric forecast.',
        'Wind speed/direction marked "--" in recent sols due to REMS wind-sensor hardware limits.',
      ],
      classification: 'VERIFIED_FACT',
    },
  };
}

export function parseRadRdrText(text: string, sourceUrl: string, productId: string): RadObservationSummary | null {
  const solMatch = text.match(/START_SOL=(\d+)/);
  const timeMatch = text.match(/START_TIME="([^"]+)"/);
  const durMatch = text.match(/OBS_DURATION=(\d+)/);
  const doseBMatches = [...text.matchAll(/\[DOSIMETRY_TOTAL_DOSE_B:\s*\d+\]\s*([0-9.eE+-]+)/g)];
  const doseEMatches = [...text.matchAll(/\[DOSIMETRY_TOTAL_DOSE_E:\s*\d+\]\s*([0-9.eE+-]+)/g)];
  const durations = [...text.matchAll(/OBS_DURATION=(\d+)/g)].map((m) => Number(m[1]));

  if (!solMatch) return null;
  const sol = Number(solMatch[1]);
  const totalDur = durations.reduce((a, b) => a + b, 0) || (durMatch ? Number(durMatch[1]) : 0);

  const avgB = doseBMatches.length
    ? doseBMatches.reduce((a, m) => a + Number(m[1]), 0) / doseBMatches.length
    : null;
  const avgE = doseEMatches.length
    ? doseEMatches.reduce((a, m) => a + Number(m[1]), 0) / doseEMatches.length
    : null;

  // Dose values in PDS MSL RAD Level-3 RDR DOSIMETRY_TOTAL_DOSE_B are total dose per observation interval in microgray (uGy)
  // Average observation duration ~ 961 s -> compute rate in uGy/day (86400 s/day, Mars sol ~ 88775 s) only when duration > 0
  const firstObsDur = durMatch ? Number(durMatch[1]) : 0;
  const doseRateBPerDay =
    avgB !== null && firstObsDur > 0 ? Number(((avgB / firstObsDur) * 86400).toFixed(1)) : null;

  return {
    sol,
    productId,
    startUtc: timeMatch ? timeMatch[1] : 'Unknown',
    obsDurationSec: totalDur,
    totalDoseB: avgB !== null ? Number(avgB.toFixed(4)) : null,
    totalDoseE: avgE !== null ? Number(avgE.toFixed(4)) : null,
    doseRateBPerDay,
    unitNote: 'Silicon detector B / Tissue-equivalent plastic E RDR dose values (uGy per obs; scaled to uGy/Earth-day from OBS_DURATION)',
    sourceUrl,
  };
}

export async function fetchRadContext(): Promise<{
  available: boolean;
  records: RadObservationSummary[];
  status: DataStatus;
  retrievedAt: string;
  provenance: Provenance;
}> {
  const cacheKey = 'msl_rad_latest_summary';
  const cached = readCache<RadObservationSummary[]>(cacheKey);
  if (cached.hit && !cached.stale && cached.data && cached.retrievedAt) {
    return {
      available: cached.data.length > 0,
      records: cached.data,
      status: 'CACHED',
      retrievedAt: cached.retrievedAt,
      provenance: {
        sourceId: 'pds-msl-rad',
        sourceName: 'NASA PDS-PPI MSL RAD Level-3 RDR Dosimetry',
        mission: 'Mars Science Laboratory (Curiosity)',
        instrument: 'RAD (Radiation Assessment Detector)',
        productId: 'MSL-M-RAD-3-RDR-V1.0',
        sourceUrl: PDS_RAD_INDEX_URL,
        retrievedAt: cached.retrievedAt,
        processing: ['Parsed PDS-PPI RAD RDR TXT dosimetry blocks across recent archived sols'],
        license: 'Public Domain (NASA PDS)',
        attribution: 'NASA PDS-PPI (UCLA) / SwRI MSL RAD Science Team',
        status: 'CACHED',
        confidence: 'HIGH',
        limitations: [
          'Historical surface rover dosimetry only — NOT a solar particle event forecast and NOT an astronaut organ/effective crew dose prediction.',
        ],
        classification: 'VERIFIED_FACT',
      },
    };
  }

  try {
    const dirRes = await fetchWithRetry(PDS_RAD_INDEX_URL, 'pds-msl-rad', 12_000, 1);
    const dirHtml = await dirRes.text();
    const dirs = [...dirHtml.matchAll(/href="(SOL_[^"]+)"/g)].map((m) => m[1]);
    const latestDir = dirs[dirs.length - 1];
    if (!latestDir) throw new Error('No SOL directories found in PDS RAD archive');

    const subRes = await fetchWithRetry(`${PDS_RAD_INDEX_URL}${latestDir}`, 'pds-msl-rad', 12_000, 1);
    const subHtml = await subRes.text();
    const txts = [...subHtml.matchAll(/href="(RAD_RDR_[^"]+\.TXT)"/g)].map((m) => m[1]);

    // Sample up to 4 evenly spaced sols in the latest PDS archive folder to keep response fast
    const picks: string[] = [];
    if (txts.length > 0) {
      const step = Math.max(1, Math.floor(txts.length / 4));
      for (let i = 0; i < txts.length && picks.length < 4; i += step) {
        picks.push(txts[i]);
      }
    }

    const records: RadObservationSummary[] = [];
    await Promise.all(
      picks.map(async (fname) => {
        const fileUrl = `${PDS_RAD_INDEX_URL}${latestDir}${fname}`;
        const r = await fetchWithRetry(fileUrl, 'pds-msl-rad', 12_000, 1);
        const body = await r.text();
        const parsed = parseRadRdrText(body, fileUrl, fname.replace(/\.TXT$/, ''));
        if (parsed) records.push(parsed);
      })
    );
    records.sort((a, b) => a.sol - b.sol);

    const retrievedAt = new Date().toISOString();
    writeCache(cacheKey, 'pds-msl-rad', records, 43_200, retrievedAt);

    return {
      available: records.length > 0,
      records,
      status: 'LIVE',
      retrievedAt,
      provenance: {
        sourceId: 'pds-msl-rad',
        sourceName: 'NASA PDS-PPI MSL RAD Level-3 RDR Dosimetry',
        mission: 'Mars Science Laboratory (Curiosity)',
        instrument: 'RAD (Radiation Assessment Detector)',
        productId: 'MSL-M-RAD-3-RDR-V1.0',
        sourceUrl: `${PDS_RAD_INDEX_URL}${latestDir}`,
        retrievedAt,
        processing: ['Parsed PDS-PPI RAD RDR TXT dosimetry blocks from latest archive directory'],
        license: 'Public Domain (NASA PDS)',
        attribution: 'NASA PDS-PPI (UCLA) / SwRI MSL RAD Science Team',
        status: 'LIVE',
        confidence: 'HIGH',
        limitations: [
          'Historical surface rover dosimetry only — NOT a solar particle event forecast and NOT an astronaut organ/effective crew dose prediction.',
        ],
        classification: 'VERIFIED_FACT',
      },
    };
  } catch {
    return {
      available: false,
      records: [],
      status: 'LIVE',
      retrievedAt: new Date().toISOString(),
      provenance: {
        sourceId: 'pds-msl-rad',
        sourceName: 'NASA PDS-PPI MSL RAD Level-3 RDR Dosimetry',
        mission: 'Mars Science Laboratory (Curiosity)',
        instrument: 'RAD',
        sourceUrl: PDS_RAD_INDEX_URL,
        retrievedAt: new Date().toISOString(),
        processing: ['Upstream fetch unavailable'],
        license: 'Public Domain (NASA PDS)',
        attribution: 'NASA PDS-PPI / SwRI',
        status: 'LIVE',
        confidence: 'LOW',
        limitations: ['RAD archive unreachable during request; live crew dose data unavailable.'],
        classification: 'VERIFIED_FACT',
      },
    };
  }
}
