import type { LineString } from 'geojson';
import { marsDistanceM } from '../../shared/geo.js';
import type {
  RouteCandidate,
  RouteSegment,
  RouteWaypoint,
  RouteWeights,
} from '../../shared/types.js';
import {
  gridCellToLonLat,
  lonLatToGridCell,
  type DerivedTerrainGrid,
} from './terrainEngine.js';

interface NodeRecord {
  r: number;
  c: number;
  g: number;
  f: number;
}

class MinHeap {
  private data: NodeRecord[] = [];
  get size(): number {
    return this.data.length;
  }
  push(item: NodeRecord): void {
    this.data.push(item);
    let idx = this.data.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.data[parent].f <= this.data[idx].f) break;
      [this.data[parent], this.data[idx]] = [this.data[idx], this.data[parent]];
      idx = parent;
    }
  }
  pop(): NodeRecord | undefined {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      let idx = 0;
      const n = this.data.length;
      while (true) {
        let smallest = idx;
        const left = idx * 2 + 1;
        const right = idx * 2 + 2;
        if (left < n && this.data[left].f < this.data[smallest].f) smallest = left;
        if (right < n && this.data[right].f < this.data[smallest].f) smallest = right;
        if (smallest === idx) break;
        [this.data[idx], this.data[smallest]] = [this.data[smallest], this.data[idx]];
        idx = smallest;
      }
    }
    return top;
  }
}

/**
 * Adapted Tobler-style slope effort multiplier (ASSUMPTION: adapted from terrestrial
 * hiking model, NOT a NASA-certified Mars suit metabolic measurement).
 * Strictly >= 1.0 so A* edge weights never become negative.
 */
export function slopeEffortMultiplier(slopeDeg: number): number {
  const rad = (Math.min(60, Math.max(0, slopeDeg)) * Math.PI) / 180;
  const tanS = Math.tan(rad);
  // Normalized so 0 deg = 1.0; increases smoothly with grade
  const raw = Math.exp(3.2 * tanS);
  return Number(raw.toFixed(4));
}

export function isCellPassable(
  terrain: DerivedTerrainGrid,
  r: number,
  c: number,
  weights: RouteWeights
): { passable: boolean; reason?: string } {
  const elev = terrain.elevations[r]?.[c];
  const slope = terrain.slopesDeg[r]?.[c];
  if (elev === null || elev === undefined || !Number.isFinite(slope)) {
    return { passable: false, reason: 'NO_DATA' };
  }
  if (slope > weights.maxSlopeDeg) {
    return { passable: false, reason: `SLOPE_LIMIT (>${weights.maxSlopeDeg}°)` };
  }
  if (weights.avoidDunes && terrain.duneMask[r]?.[c]) {
    return { passable: false, reason: 'MAPPED_DUNE_FIELD' };
  }
  return { passable: true };
}

function edgeTraversalCost(
  terrain: DerivedTerrainGrid,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  weights: RouteWeights
): number {
  const p1 = gridCellToLonLat(terrain.bbox, terrain.rows, terrain.cols, r1, c1);
  const p2 = gridCellToLonLat(terrain.bbox, terrain.rows, terrain.cols, r2, c2);
  const distM = marsDistanceM(p1, p2);
  const e1 = terrain.elevations[r1][c1] ?? 0;
  const e2 = terrain.elevations[r2][c2] ?? 0;
  const segSlopeDeg = (Math.atan2(Math.abs(e2 - e1), Math.max(1, distM)) * 180) / Math.PI;
  const cellSlopeDeg = Math.max(segSlopeDeg, terrain.slopesDeg[r2][c2] ?? 0);
  const roughness = terrain.roughnessM[r2][c2] ?? 0;
  const duneFlag = terrain.duneMask[r2][c2] ? 1 : 0;
  const sci = terrain.scienceOpportunity[r2][c2] ?? 0;

  const slopeMult = slopeEffortMultiplier(cellSlopeDeg) - 1;
  const terrainPenalty = 1 + weights.wSlope * slopeMult + weights.wTerrain * (roughness / 3) + weights.wHazard * duneFlag;
  // Multiplicative science reward clamped at >= 0.35 so edge cost is always strictly positive
  const scienceFactor = Math.max(0.35, 1 - weights.wScience * sci);
  return distM * terrainPenalty * scienceFactor;
}

/**
 * Check whether straight grid-interpolated corridor between two cells avoids blocked cells
 * and stays near the same terrain cost regime (safe string-pull smoothing).
 */
function canSmoothDirect(
  terrain: DerivedTerrainGrid,
  a: [number, number],
  b: [number, number],
  weights: RouteWeights
): boolean {
  const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2;
  if (steps <= 1) return true;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const rr = Math.round(a[0] + (b[0] - a[0]) * t);
    const cc = Math.round(a[1] + (b[1] - a[1]) * t);
    if (!isCellPassable(terrain, rr, cc, weights).passable) return false;
  }
  return true;
}

function smoothGridPath(
  terrain: DerivedTerrainGrid,
  path: Array<[number, number]>,
  weights: RouteWeights
): Array<[number, number]> {
  if (path.length <= 2) return path;
  // For science-oriented routes, keep finer bends near science zones; only smooth collinear-like jitter
  const maxSkip = weights.wScience > 0.2 ? 3 : 6;
  const out: Array<[number, number]> = [path[0]];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let next = Math.min(path.length - 1, anchor + maxSkip);
    while (next > anchor + 1) {
      if (canSmoothDirect(terrain, path[anchor], path[next], weights)) {
        break;
      }
      next--;
    }
    out.push(path[next]);
    anchor = next;
  }
  return out;
}

export function runAStarRoute(
  terrain: DerivedTerrainGrid,
  startCoord: [number, number],
  endCoord: [number, number],
  weights: RouteWeights,
  routeId: string
): RouteCandidate {
  const startCell = lonLatToGridCell(terrain.bbox, terrain.rows, terrain.cols, startCoord);
  const endCell = lonLatToGridCell(terrain.bbox, terrain.rows, terrain.cols, endCoord);

  const activeConstraints = [
    `ASSUMPTION: Max modeled slope <= ${weights.maxSlopeDeg}°`,
    weights.avoidDunes ? 'Mapped dune fields excluded (Dune_Field)' : 'Dune fields penalized only',
    `Grid resolution: ${terrain.cellSizeM} m (${terrain.demSourceId})`,
  ];

  const startPass = isCellPassable(terrain, startCell.row, startCell.col, weights);
  const endPass = isCellPassable(terrain, endCell.row, endCell.col, weights);

  const failResult = (reason: string, blockingConstraint: string): RouteCandidate => ({
    id: routeId,
    preset: weights.preset,
    label: weights.label,
    feasible: false,
    blockedReason: reason,
    blockingConstraint,
    geometry: null,
    distanceM: 0,
    elevationGainM: 0,
    elevationLossM: 0,
    maxSlopeDeg: 0,
    meanSlopeDeg: 0,
    cumulativeCost: 0,
    estimatedTimeMin: null,
    speedModelAssumption: `ASSUMPTION: Flat nominal ${weights.assumedSpeedMps} m/s with Tobler-style slope reduction`,
    activeConstraints,
    segments: [],
    waypoints: [],
    weights,
    whyRoute: [`No feasible route under constraint: ${blockingConstraint}.`],
    tradeoffSummary: reason,
    provenance: {
      ...terrain.provenance,
      status: 'DERIVED',
      classification: 'ASSUMPTION',
      processing: [...terrain.provenance.processing, `A* pathfinding (${weights.preset}) blocked by ${blockingConstraint}`],
    },
  });

  if (!startPass.passable) {
    return failResult(
      `Start location fails ${startPass.reason} (modeled slope ${terrain.slopesDeg[startCell.row]?.[startCell.col] ?? 'N/A'}°).`,
      startPass.reason ?? 'START_BLOCKED'
    );
  }
  if (!endPass.passable) {
    return failResult(
      `Destination location fails ${endPass.reason} (modeled slope ${terrain.slopesDeg[endCell.row]?.[endCell.col] ?? 'N/A'}°).`,
      endPass.reason ?? 'END_BLOCKED'
    );
  }

  const rows = terrain.rows;
  const cols = terrain.cols;
  const total = rows * cols;
  const idxOf = (r: number, c: number) => r * cols + c;

  const gScore = new Float64Array(total).fill(Infinity);
  const closed = new Uint8Array(total);
  const parent = new Int32Array(total).fill(-1);

  const endLonLat = gridCellToLonLat(terrain.bbox, rows, cols, endCell.row, endCell.col);
  // Admissible heuristic: lower-bound geodesic distance * 0.35 (minimum possible science discount)
  const heuristic = (r: number, c: number) =>
    marsDistanceM(gridCellToLonLat(terrain.bbox, rows, cols, r, c), endLonLat) * 0.35;

  const startIdx = idxOf(startCell.row, startCell.col);
  const endIdx = idxOf(endCell.row, endCell.col);
  gScore[startIdx] = 0;

  const heap = new MinHeap();
  heap.push({
    r: startCell.row,
    c: startCell.col,
    g: 0,
    f: heuristic(startCell.row, startCell.col),
  });

  const dirs: Array<[number, number]> = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];

  let found = false;
  let maxBlockedSlopeSeen = 0;
  let duneBlockedCount = 0;

  while (heap.size > 0) {
    const cur = heap.pop()!;
    const cIdx = idxOf(cur.r, cur.c);
    if (closed[cIdx]) continue;
    closed[cIdx] = 1;

    if (cIdx === endIdx) {
      found = true;
      break;
    }

    for (const [dr, dc] of dirs) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nIdx = idxOf(nr, nc);
      if (closed[nIdx]) continue;

      const pass = isCellPassable(terrain, nr, nc, weights);
      if (!pass.passable) {
        const sl = terrain.slopesDeg[nr]?.[nc];
        if (Number.isFinite(sl) && sl > maxBlockedSlopeSeen) maxBlockedSlopeSeen = sl;
        if (terrain.duneMask[nr]?.[nc]) duneBlockedCount++;
        continue;
      }

      const stepCost = edgeTraversalCost(terrain, cur.r, cur.c, nr, nc, weights);
      const tentativeG = gScore[cIdx] + stepCost;
      if (tentativeG < gScore[nIdx]) {
        gScore[nIdx] = tentativeG;
        parent[nIdx] = cIdx;
        heap.push({ r: nr, c: nc, g: tentativeG, f: tentativeG + heuristic(nr, nc) });
      }
    }
  }

  if (!found) {
    const blocker =
      duneBlockedCount > 0 && maxBlockedSlopeSeen <= weights.maxSlopeDeg
        ? 'MAPPED_DUNE_FIELD'
        : `SLOPE_LIMIT (>${weights.maxSlopeDeg}°)`;
    return failResult(
      `No continuous corridor connects start to target under ${blocker}. Constraints were NOT silently relaxed.`,
      blocker
    );
  }

  // Reconstruct cell path
  const rawCells: Array<[number, number]> = [];
  let cursor = endIdx;
  while (cursor !== -1) {
    const r = Math.floor(cursor / cols);
    const c = cursor % cols;
    rawCells.push([r, c]);
    cursor = parent[cursor];
  }
  rawCells.reverse();

  const smoothed = smoothGridPath(terrain, rawCells, weights);

  const coords: Array<[number, number]> = smoothed.map(([r, c]) =>
    gridCellToLonLat(terrain.bbox, rows, cols, r, c)
  );
  // Pin exact start/end endpoints if they fall inside the same terminal cell
  coords[0] = startCoord;
  coords[coords.length - 1] = endCoord;

  const segments: RouteSegment[] = [];
  const waypoints: RouteWaypoint[] = [];

  let distanceM = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let maxSlopeDeg = 0;
  let weightedSlopeSum = 0;
  let cumulativeCost = 0;

  for (let i = 0; i < smoothed.length; i++) {
    const [r, c] = smoothed[i];
    const elev = terrain.elevations[r][c] ?? 0;
    const slope = terrain.slopesDeg[r][c] ?? 0;

    if (i === 0 || i === smoothed.length - 1 || i % Math.max(2, Math.floor(smoothed.length / 5)) === 0) {
      waypoints.push({
        index: waypoints.length,
        label: i === 0 ? 'EVA Start' : i === smoothed.length - 1 ? 'Target Site' : `WP-${waypoints.length}`,
        coordinates: coords[i],
        elevationM: Number(elev.toFixed(2)),
        slopeDeg: Number(slope.toFixed(2)),
        cumulativeDistanceM: Number(distanceM.toFixed(1)),
        note:
          i === 0
            ? 'Traverse origin'
            : i === smoothed.length - 1
              ? 'Candidate science objective target'
              : `Modeled grade ${slope.toFixed(1)}°`,
      });
    }

    if (i < smoothed.length - 1) {
      const [nr, nc] = smoothed[i + 1];
      const nextElev = terrain.elevations[nr][nc] ?? elev;
      const segDist = marsDistanceM(coords[i], coords[i + 1]);
      const dElev = nextElev - elev;
      const segSlope = (Math.atan2(Math.abs(dElev), Math.max(1, segDist)) * 180) / Math.PI;
      const effectiveSlope = Math.max(segSlope, terrain.slopesDeg[nr][nc] ?? segSlope);
      const rough = terrain.roughnessM[nr][nc] ?? 0;
      const sci = terrain.scienceOpportunity[nr][nc] ?? 0;
      const flags: string[] = [];
      if (effectiveSlope > 12) flags.push(`SLOPE_${effectiveSlope.toFixed(0)}DEG`);
      if (terrain.duneMask[nr][nc]) flags.push('DUNE_ADJACENT');
      const segCost = segDist * (1 + weights.wSlope * (slopeEffortMultiplier(effectiveSlope) - 1) + weights.wTerrain * (rough / 3)) * Math.max(0.35, 1 - weights.wScience * sci);

      distanceM += segDist;
      if (dElev > 0) elevationGainM += dElev;
      else elevationLossM += Math.abs(dElev);
      if (effectiveSlope > maxSlopeDeg) maxSlopeDeg = effectiveSlope;
      weightedSlopeSum += effectiveSlope * segDist;
      cumulativeCost += segCost;

      segments.push({
        index: i,
        from: coords[i],
        to: coords[i + 1],
        distanceM: Number(segDist.toFixed(1)),
        elevationStartM: Number(elev.toFixed(2)),
        elevationEndM: Number(nextElev.toFixed(2)),
        elevationDeltaM: Number(dElev.toFixed(2)),
        slopeDeg: Number(effectiveSlope.toFixed(2)),
        roughnessM: Number(rough.toFixed(2)),
        hazardFlags: flags,
        scienceScore: sci,
        cost: Number(segCost.toFixed(1)),
      });
    }
  }

  const meanSlopeDeg = distanceM > 0 ? weightedSlopeSum / distanceM : 0;
  // Estimate time using Tobler-scaled speed assumption
  const meanMult = slopeEffortMultiplier(meanSlopeDeg);
  const estSeconds = (distanceM / Math.max(0.1, weights.assumedSpeedMps)) * meanMult;
  const estimatedTimeMin = Number((estSeconds / 60).toFixed(1));

  const geometry: LineString = {
    type: 'LineString',
    coordinates: coords,
  };

  const whyRoute = [
    `Optimized for "${weights.label}" across ${terrain.rows}x${terrain.cols} real DEM cells (${terrain.cellSizeM} m spacing).`,
    `Modeled max slope ${maxSlopeDeg.toFixed(1)}° (ceiling ${weights.maxSlopeDeg}°), net elevation +${elevationGainM.toFixed(1)} m / -${elevationLossM.toFixed(1)} m.`,
    weights.wScience > 0.2
      ? 'Corridor intentionally biases toward orbital CRISM mineral detections and rover-verified outcrops.'
      : 'Corridor prioritizes terrain efficiency and slope avoidance.',
  ];

  const tradeoffSummary = `${(distanceM / 1000).toFixed(2)} km · max ${maxSlopeDeg.toFixed(1)}° · +${elevationGainM.toFixed(0)}m gain · cost ${cumulativeCost.toFixed(0)}`;

  return {
    id: routeId,
    preset: weights.preset,
    label: weights.label,
    feasible: true,
    geometry,
    distanceM: Number(distanceM.toFixed(1)),
    elevationGainM: Number(elevationGainM.toFixed(1)),
    elevationLossM: Number(elevationLossM.toFixed(1)),
    maxSlopeDeg: Number(maxSlopeDeg.toFixed(2)),
    meanSlopeDeg: Number(meanSlopeDeg.toFixed(2)),
    cumulativeCost: Number(cumulativeCost.toFixed(1)),
    estimatedTimeMin,
    speedModelAssumption: `ASSUMPTION: ${weights.assumedSpeedMps} m/s nominal flat pace scaled by terrestrial Tobler slope factor (not NASA EVA suit telemetry).`,
    activeConstraints,
    segments,
    waypoints,
    weights,
    whyRoute,
    tradeoffSummary,
    provenance: {
      ...terrain.provenance,
      status: 'DERIVED',
      classification: 'ASSUMPTION',
      processing: [
        ...terrain.provenance.processing,
        `Deterministic 8-connected A* (${weights.preset}) with corridor smoothing`,
      ],
    },
  };
}

export function computeSlopeSensitivity(
  terrain: DerivedTerrainGrid,
  startCoord: [number, number],
  endCoord: [number, number],
  baseWeights: RouteWeights
): Array<{
  maxSlopeDeg: number;
  feasible: boolean;
  distanceM: number | null;
  cumulativeCost: number | null;
  blockedReason?: string;
}> {
  const limits = [10, 12, 15, 18, 22, 26];
  return limits.map((limit) => {
    const res = runAStarRoute(
      terrain,
      startCoord,
      endCoord,
      { ...baseWeights, maxSlopeDeg: limit },
      `sens-${limit}`
    );
    return {
      maxSlopeDeg: limit,
      feasible: res.feasible,
      distanceM: res.feasible ? res.distanceM : null,
      cumulativeCost: res.feasible ? res.cumulativeCost : null,
      blockedReason: res.feasible ? undefined : res.blockingConstraint,
    };
  });
}
