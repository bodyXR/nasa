import { z } from 'zod';
import { getDb } from '../db.js';
import { fetchWithRetry } from '../httpClient.js';
import type { DataStatus, Provenance } from '../../shared/types.js';
import { MARS_CRS_ID } from '../../shared/geo.js';

const GALE_DEM_BASE = 'https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer';
const MOLA_HRSC_BASE = 'https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw/ImageServer';

export const GALE_DEM_EXTENT = {
  xmin: 137.12247113204074,
  ymin: -4.925474311955841,
  xmax: 137.72981290693286,
  ymax: -4.248963057145466,
};

const IdentifySchema = z.object({
  value: z.union([z.string(), z.number()]).optional(),
  location: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

const GetSamplesSchema = z.object({
  samples: z.array(
    z.object({
      location: z.object({ x: z.number(), y: z.number() }),
      locationId: z.number().optional(),
      value: z.union([z.string(), z.number()]),
      resolution: z.number().optional(),
    })
  ),
});

export function isInsideGaleDemExtent(lon: number, lat: number): boolean {
  return (
    lon >= GALE_DEM_EXTENT.xmin &&
    lon <= GALE_DEM_EXTENT.xmax &&
    lat >= GALE_DEM_EXTENT.ymin &&
    lat <= GALE_DEM_EXTENT.ymax
  );
}

export interface PointElevationResult {
  lon: number;
  lat: number;
  elevationM: number | null;
  demSourceId: string;
  resolution: string;
  provenance: Provenance;
}

export async function samplePointElevation(lon: number, lat: number): Promise<PointElevationResult> {
  const useGale = isInsideGaleDemExtent(lon, lat);
  const baseUrl = useGale ? GALE_DEM_BASE : MOLA_HRSC_BASE;
  const sourceId = useGale ? 'trek-gale-dem-1m' : 'trek-mola-hrsc-dem';
  const resolution = useGale ? '~1 m/px (Gale_DEM_SMG_1m)' : '~200 m/px (MOLA+HRSC Blend)';

  const geom = encodeURIComponent(JSON.stringify({ x: lon, y: lat }));
  const url = `${baseUrl}/identify?geometry=${geom}&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=false&f=json`;
  const res = await fetchWithRetry(url, sourceId, 10_000, 1);
  const raw = await res.json();
  const parsed = IdentifySchema.parse(raw);

  const numVal = parsed.value !== undefined && parsed.value !== 'NoData' ? Number(parsed.value) : NaN;
  const elevationM = Number.isFinite(numVal) ? Number(numVal.toFixed(2)) : null;

  return {
    lon,
    lat,
    elevationM,
    demSourceId: sourceId,
    resolution,
    provenance: {
      sourceId,
      sourceName: useGale ? 'NASA Mars Trek Gale Crater 1m DEM' : 'NASA MOLA + ESA HRSC 200m Blended DEM',
      mission: useGale ? 'MRO / Mars Express' : 'MGS / Mars Express',
      instrument: useGale ? 'HiRISE / CTX / HRSC Stereo DEM' : 'MOLA + HRSC',
      productId: useGale ? 'Gale_DEM_SMG_1m' : 'Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw',
      sourceUrl: baseUrl,
      retrievedAt: new Date().toISOString(),
      processing: ['ArcGIS ImageServer point identify query'],
      license: 'Public Domain (NASA/JPL/ESA)',
      attribution: 'NASA / JPL-Caltech Mars Trek',
      status: 'LIVE',
      confidence: elevationM !== null ? 'HIGH' : 'LOW',
      limitations: useGale
        ? ['Single-point DEM value reflects ~1 m/px stereo elevation without sub-meter boulder/regolith strength info.']
        : ['200 m/px global DEM smooths local steep slopes and scarps.'],
      classification: 'VERIFIED_FACT',
    },
  };
}

export interface SampledDemGrid {
  gridId: string;
  bbox: [number, number, number, number];
  rows: number;
  cols: number;
  elevations: (number | null)[][];
  demSourceId: string;
  resolution: string;
  status: DataStatus;
  retrievedAt: string;
  provenance: Provenance;
}

export async function sampleDemGrid(
  bbox: [number, number, number, number],
  rows: number,
  cols: number
): Promise<SampledDemGrid> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const useGale =
    isInsideGaleDemExtent(minLon, minLat) && isInsideGaleDemExtent(maxLon, maxLat);
  const sourceId = useGale ? 'trek-gale-dem-1m' : 'trek-mola-hrsc-dem';
  const baseUrl = useGale ? GALE_DEM_BASE : MOLA_HRSC_BASE;
  const resolution = useGale
    ? '1.687e-5 deg/px (~1 m/px native) resampled to grid'
    : '200 m/px global blended DEM resampled to grid';

  const gridId = `${sourceId}:${minLon.toFixed(4)}:${minLat.toFixed(4)}:${maxLon.toFixed(4)}:${maxLat.toFixed(4)}:${rows}x${cols}`;

  const db = getDb();
  const cachedRow = db
    .prepare('SELECT elevations_json, retrieved_at FROM terrain_grids WHERE grid_id = ?')
    .get(gridId) as { elevations_json: string; retrieved_at: string } | undefined;

  if (cachedRow) {
    const elevations = JSON.parse(cachedRow.elevations_json) as (number | null)[][];
    return {
      gridId,
      bbox,
      rows,
      cols,
      elevations,
      demSourceId: sourceId,
      resolution,
      status: 'CACHED',
      retrievedAt: cachedRow.retrieved_at,
      provenance: {
        sourceId,
        sourceName: useGale ? 'NASA Mars Trek Gale Crater 1m DEM' : 'NASA MOLA + HRSC 200m DEM',
        mission: useGale ? 'MRO / Mars Express' : 'MGS / Mars Express',
        instrument: useGale ? 'HiRISE / CTX / HRSC Stereo DEM' : 'MOLA + HRSC',
        productId: useGale ? 'Gale_DEM_SMG_1m' : 'Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw',
        sourceUrl: baseUrl,
        retrievedAt: cachedRow.retrieved_at,
        processing: [
          `Windowed multipoint sampling (${rows}x${cols} = ${rows * cols} points)`,
          'Persisted in local SQLite terrain_grids cache',
        ],
        license: 'Public Domain (NASA/JPL/ESA)',
        attribution: 'NASA / JPL-Caltech Mars Trek',
        status: 'CACHED',
        confidence: 'HIGH',
        limitations: [
          'MOLA/CTX/HiRISE orbital DEMs do not resolve individual rocks, small craters below grid spacing, or loose sand bearing strength.',
        ],
        classification: 'VERIFIED_FACT',
      },
    };
  }

  // Build row-major multipoint coordinates (row 0 = top maxLat -> row rows-1 = bottom minLat)
  const points: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    const lat = rows === 1 ? (minLat + maxLat) / 2 : maxLat - (r / (rows - 1)) * (maxLat - minLat);
    for (let c = 0; c < cols; c++) {
      const lon = cols === 1 ? (minLon + maxLon) / 2 : minLon + (c / (cols - 1)) * (maxLon - minLon);
      points.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
    }
  }

  const batchSize = 100;
  const batches: Array<{ startIdx: number; pts: Array<[number, number]> }> = [];
  for (let i = 0; i < points.length; i += batchSize) {
    batches.push({ startIdx: i, pts: points.slice(i, i + batchSize) });
  }

  const flatValues: (number | null)[] = new Array(points.length).fill(null);

  // Execute batches with bounded concurrency = 4
  const concurrency = 4;
  for (let i = 0; i < batches.length; i += concurrency) {
    const slice = batches.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (batch) => {
        const geom = encodeURIComponent(JSON.stringify({ points: batch.pts }));
        const url = `${baseUrl}/getSamples?geometry=${geom}&geometryType=esriGeometryMultipoint&returnFirstValueOnly=true&f=json`;
        const res = await fetchWithRetry(url, sourceId, 15_000, 2);
        const raw = await res.json();
        const parsed = GetSamplesSchema.parse(raw);
        parsed.samples.forEach((s, localIdx) => {
          const targetIdx = batch.startIdx + (s.locationId ?? localIdx);
          const v = s.value !== 'NoData' ? Number(s.value) : NaN;
          if (targetIdx >= 0 && targetIdx < flatValues.length) {
            flatValues[targetIdx] = Number.isFinite(v) ? Number(v.toFixed(3)) : null;
          }
        });
      })
    );
  }

  const elevations: (number | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    elevations.push(flatValues.slice(r * cols, (r + 1) * cols));
  }

  const retrievedAt = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO terrain_grids
      (grid_id, bbox_json, dem_source_id, cell_size_m, rows, cols, elevations_json, retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(gridId, JSON.stringify(bbox), sourceId, 0, rows, cols, JSON.stringify(elevations), retrievedAt);

  return {
    gridId,
    bbox,
    rows,
    cols,
    elevations,
    demSourceId: sourceId,
    resolution,
    status: 'LIVE',
    retrievedAt,
    provenance: {
      sourceId,
      sourceName: useGale ? 'NASA Mars Trek Gale Crater 1m DEM' : 'NASA MOLA + HRSC 200m DEM',
      mission: useGale ? 'MRO / Mars Express' : 'MGS / Mars Express',
      instrument: useGale ? 'HiRISE / CTX / HRSC Stereo DEM' : 'MOLA + HRSC',
      productId: useGale ? 'Gale_DEM_SMG_1m' : 'Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw',
      sourceUrl: baseUrl,
      retrievedAt,
      processing: [
        `Windowed multipoint sampling via ArcGIS ImageServer/getSamples (${rows}x${cols})`,
        `CRS: ${MARS_CRS_ID}`,
      ],
      license: 'Public Domain (NASA/JPL/ESA)',
      attribution: 'NASA / JPL-Caltech Mars Trek',
      status: 'LIVE',
      confidence: 'HIGH',
      limitations: [
        'MOLA/CTX/HiRISE orbital DEMs do not resolve individual rocks, small craters below grid spacing, or loose sand bearing strength.',
      ],
      classification: 'VERIFIED_FACT',
    },
  };
}
