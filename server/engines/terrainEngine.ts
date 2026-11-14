import type { Feature, FeatureCollection } from 'geojson';
import {
  marsDistanceM,
  MARS_CRS_ID,
  pointInGeoJsonPolygon,
} from '../../shared/geo.js';
import type { Provenance } from '../../shared/types.js';

export interface DerivedTerrainGrid {
  id: string;
  bbox: [number, number, number, number];
  rows: number;
  cols: number;
  cellWidthM: number;
  cellHeightM: number;
  cellSizeM: number;
  crs: string;
  demSourceId: string;
  demResolution: string;
  elevations: (number | null)[][];
  slopesDeg: number[][];
  aspectsDeg: number[][];
  roughnessM: number[][];
  duneMask: boolean[][];
  scienceOpportunity: number[][];
  minElevM: number;
  maxElevM: number;
  maxSlopeDeg: number;
  meanSlopeDeg: number;
  noDataCellsCount: number;
  duneHazardCellsCount: number;
  provenance: Provenance;
}

export function gridCellToLonLat(
  bbox: [number, number, number, number],
  rows: number,
  cols: number,
  row: number,
  col: number
): [number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lon = cols === 1 ? (minLon + maxLon) / 2 : minLon + (col / (cols - 1)) * (maxLon - minLon);
  const lat = rows === 1 ? (minLat + maxLat) / 2 : maxLat - (row / (rows - 1)) * (maxLat - minLat);
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
}

export function lonLatToGridCell(
  bbox: [number, number, number, number],
  rows: number,
  cols: number,
  coord: [number, number]
): { row: number; col: number } {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const cFrac = (coord[0] - minLon) / Math.max(1e-9, maxLon - minLon);
  const rFrac = (maxLat - coord[1]) / Math.max(1e-9, maxLat - minLat);
  const col = Math.max(0, Math.min(cols - 1, Math.round(cFrac * (cols - 1))));
  const row = Math.max(0, Math.min(rows - 1, Math.round(rFrac * (rows - 1))));
  return { row, col };
}

/**
 * Derive slope (Horn 1981 3x3 weighted finite difference), aspect, and TRI roughness
 * from a regular elevation grid on Mars sphere.
 *
 * VERIFIED FACT: Mathematical Horn (1981) 3x3 gradient on metric cell spacing.
 * ASSUMPTION: Edge cells replicate adjacent valid elevation if neighbor is outside grid;
 * cells with missing (null) elevation remain NaN/0 with explicit noData tracking.
 */
export function deriveTerrainFromElevations(params: {
  id: string;
  bbox: [number, number, number, number];
  elevations: (number | null)[][];
  demSourceId: string;
  demResolution: string;
  provenance: Provenance;
  duneFeatures?: Feature[];
  sciencePoints?: Array<{ coordinates: [number, number]; weight: number }>;
}): DerivedTerrainGrid {
  const { id, bbox, elevations, demSourceId, demResolution, provenance, duneFeatures = [], sciencePoints = [] } = params;
  const rows = elevations.length;
  const cols = rows > 0 ? elevations[0].length : 0;

  const [minLon, minLat, maxLon, maxLat] = bbox;
  const midLat = (minLat + maxLat) / 2;
  const totalWidthM = marsDistanceM([minLon, midLat], [maxLon, midLat]);
  const totalHeightM = marsDistanceM([(minLon + maxLon) / 2, minLat], [(minLon + maxLon) / 2, maxLat]);
  const cellWidthM = cols > 1 ? totalWidthM / (cols - 1) : totalWidthM;
  const cellHeightM = rows > 1 ? totalHeightM / (rows - 1) : totalHeightM;
  const cellSizeM = Number(((cellWidthM + cellHeightM) / 2).toFixed(2));

  const slopesDeg: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const aspectsDeg: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const roughnessM: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const duneMask: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const scienceOpportunity: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  let minElevM = Infinity;
  let maxElevM = -Infinity;
  let maxSlopeDeg = 0;
  let slopeSum = 0;
  let validSlopeCount = 0;
  let noDataCellsCount = 0;
  let duneHazardCellsCount = 0;

  const sampleVal = (r: number, c: number, fallback: number): number => {
    const rr = Math.max(0, Math.min(rows - 1, r));
    const cc = Math.max(0, Math.min(cols - 1, c));
    const v = elevations[rr][cc];
    return v === null || !Number.isFinite(v) ? fallback : v;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const center = elevations[r][c];
      if (center === null || !Number.isFinite(center)) {
        noDataCellsCount++;
        slopesDeg[r][c] = NaN;
        continue;
      }
      if (center < minElevM) minElevM = center;
      if (center > maxElevM) maxElevM = center;

      // 3x3 Horn stencil:
      // a b c
      // d e f
      // g h i
      const a = sampleVal(r - 1, c - 1, center);
      const b = sampleVal(r - 1, c, center);
      const cc = sampleVal(r - 1, c + 1, center);
      const d = sampleVal(r, c - 1, center);
      const f = sampleVal(r, c + 1, center);
      const g = sampleVal(r + 1, c - 1, center);
      const h = sampleVal(r + 1, c, center);
      const i = sampleVal(r + 1, c + 1, center);

      const dzdx = ((cc + 2 * f + i) - (a + 2 * d + g)) / (8 * Math.max(1e-3, cellWidthM));
      const dzdy = ((g + 2 * h + i) - (a + 2 * b + cc)) / (8 * Math.max(1e-3, cellHeightM));

      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const slopeD = Number(((slopeRad * 180) / Math.PI).toFixed(2));
      slopesDeg[r][c] = slopeD;
      if (slopeD > maxSlopeDeg) maxSlopeDeg = slopeD;
      slopeSum += slopeD;
      validSlopeCount++;

      const aspectRad = Math.atan2(dzdy, -dzdx);
      const aspectD = ((aspectRad * 180) / Math.PI + 360) % 360;
      aspectsDeg[r][c] = Number(aspectD.toFixed(1));

      // Terrain Ruggedness Index (Riley et al. 1999)
      const diffs = [a, b, cc, d, f, g, h, i].map((n) => (n - center) ** 2);
      roughnessM[r][c] = Number(Math.sqrt(diffs.reduce((s, x) => s + x, 0) / 8).toFixed(2));

      // Check dune overlap & science opportunity
      const pt = gridCellToLonLat(bbox, rows, cols, r, c);
      if (duneFeatures.length > 0) {
        const inDune = duneFeatures.some((feat) => feat.geometry && pointInGeoJsonPolygon(pt, feat.geometry));
        duneMask[r][c] = inDune;
        if (inDune) duneHazardCellsCount++;
      }

      if (sciencePoints.length > 0) {
        let best = 0;
        for (const sp of sciencePoints) {
          const dist = marsDistanceM(pt, sp.coordinates);
          if (dist < 450) {
            const contrib = sp.weight * (1 - dist / 450);
            if (contrib > best) best = contrib;
          }
        }
        scienceOpportunity[r][c] = Number(Math.min(1, best).toFixed(3));
      }
    }
  }

  return {
    id,
    bbox,
    rows,
    cols,
    cellWidthM: Number(cellWidthM.toFixed(2)),
    cellHeightM: Number(cellHeightM.toFixed(2)),
    cellSizeM,
    crs: MARS_CRS_ID,
    demSourceId,
    demResolution,
    elevations,
    slopesDeg,
    aspectsDeg,
    roughnessM,
    duneMask,
    scienceOpportunity,
    minElevM: Number.isFinite(minElevM) ? Number(minElevM.toFixed(2)) : 0,
    maxElevM: Number.isFinite(maxElevM) ? Number(maxElevM.toFixed(2)) : 0,
    maxSlopeDeg: Number(maxSlopeDeg.toFixed(2)),
    meanSlopeDeg: validSlopeCount > 0 ? Number((slopeSum / validSlopeCount).toFixed(2)) : 0,
    noDataCellsCount,
    duneHazardCellsCount,
    provenance: {
      ...provenance,
      status: 'DERIVED',
      processing: [
        ...provenance.processing,
        `Horn 3x3 slope & TRI roughness computed at ${cellSizeM} m grid spacing`,
      ],
    },
  };
}

export function buildHazardGeoJson(terrain: DerivedTerrainGrid, slopeThresholdDeg: number): {
  hazardGeoJson: FeatureCollection;
  hazardCellsCount: number;
} {
  const features: Feature[] = [];
  const halfLon = (terrain.bbox[2] - terrain.bbox[0]) / Math.max(1, (terrain.cols - 1) * 2);
  const halfLat = (terrain.bbox[3] - terrain.bbox[1]) / Math.max(1, (terrain.rows - 1) * 2);

  for (let r = 0; r < terrain.rows; r++) {
    for (let c = 0; c < terrain.cols; c++) {
      const slope = terrain.slopesDeg[r][c];
      const elev = terrain.elevations[r][c];
      const isNoData = elev === null || Number.isNaN(slope);
      const isSteep = !isNoData && slope > slopeThresholdDeg;
      const isDune = terrain.duneMask[r][c];

      if (!isNoData && !isSteep && !isDune) continue;

      const reasons: string[] = [];
      if (isNoData) reasons.push('NO_DATA');
      if (isSteep) reasons.push(`SLOPE>${slopeThresholdDeg}DEG`);
      if (isDune) reasons.push('MAPPED_DUNE_FIELD');

      const [lon, lat] = gridCellToLonLat(terrain.bbox, terrain.rows, terrain.cols, r, c);
      features.push({
        type: 'Feature',
        properties: {
          row: r,
          col: c,
          slopeDeg: Number.isFinite(slope) ? slope : null,
          elevationM: elev,
          reasons,
          severity: isNoData ? 'NO_DATA' : isDune ? 'SAND_DUNE' : slope > slopeThresholdDeg + 5 ? 'HIGH_SLOPE' : 'SLOPE_LIMIT',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [lon - halfLon, lat - halfLat],
              [lon + halfLon, lat - halfLat],
              [lon + halfLon, lat + halfLat],
              [lon - halfLon, lat + halfLat],
              [lon - halfLon, lat - halfLat],
            ],
          ],
        },
      });
    }
  }

  return {
    hazardGeoJson: { type: 'FeatureCollection', features },
    hazardCellsCount: features.length,
  };
}
