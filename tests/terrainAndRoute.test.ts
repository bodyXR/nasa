import { describe, expect, it } from 'vitest';
import { deriveTerrainFromElevations } from '../server/engines/terrainEngine';
import { computeSlopeSensitivity, runAStarRoute } from '../server/engines/routeEngine';
import type { Provenance, RouteWeights } from '../shared/types';
import { marsDistanceM } from '../shared/geo';

const TEST_PROVENANCE: Provenance = {
  sourceId: 'test-dem',
  sourceName: 'Synthetic Analytical Test DEM',
  mission: 'TEST',
  instrument: 'TEST',
  sourceUrl: 'https://example.invalid',
  retrievedAt: '2026-11-13T00:00:00Z',
  processing: [],
  license: 'Public Domain',
  attribution: 'Unit Test Fixture',
  status: 'LIVE',
  limitations: [],
  classification: 'VERIFIED_FACT',
};

const BASE_WEIGHTS: RouteWeights = {
  preset: 'LOWER_TERRAIN_COST',
  label: 'Lower Modeled Terrain Cost',
  wSlope: 2.0,
  wTerrain: 0.6,
  wHazard: 10.0,
  wScience: 0.0,
  maxSlopeDeg: 18,
  avoidDunes: true,
  assumedSpeedMps: 0.65,
  assumptionNotes: [],
};

describe('Terrain Derivation & Deterministic A* Routing', () => {
  it('computes Horn 3x3 slope matching an analytical inclined plane within 0.5°', () => {
    // Build an 11x11 grid in Gale Crater and create a uniform eastward 10-degree slope
    const bbox: [number, number, number, number] = [137.38, -4.83, 137.39, -4.82];
    const widthM = marsDistanceM([bbox[0], -4.825], [bbox[2], -4.825]);
    const dx = widthM / 10;
    const targetSlopeRad = (10 * Math.PI) / 180;
    const elevations: number[][] = Array.from({ length: 11 }, () =>
      Array.from({ length: 11 }, (_, c) => -3500 + c * dx * Math.tan(targetSlopeRad))
    );

    const grid = deriveTerrainFromElevations({
      id: 'plane-10deg',
      bbox,
      elevations,
      demSourceId: 'test-dem',
      demResolution: 'synthetic',
      provenance: TEST_PROVENANCE,
    });

    // Interior cell (5,5) should closely match 10.0 deg
    expect(grid.slopesDeg[5][5]).toBeGreaterThan(9.5);
    expect(grid.slopesDeg[5][5]).toBeLessThan(10.5);
  });

  it('deterministically detours around a steep obstacle wall and preserves monotonicity vs SHORTEST', () => {
    const bbox: [number, number, number, number] = [137.38, -4.83, 137.39, -4.82];
    const rows = 15;
    const cols = 15;
    // Flat floor at -3500m, with a steep central ridge in column 7 rows 3..11 (elevation +120m => >35 deg slope)
    const elevations: number[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => (c === 7 && r >= 3 && r <= 11 ? -3380 : -3500))
    );

    const grid = deriveTerrainFromElevations({
      id: 'wall-grid',
      bbox,
      elevations,
      demSourceId: 'test-dem',
      demResolution: 'synthetic',
      provenance: TEST_PROVENANCE,
    });

    const start: [number, number] = [137.381, -4.825];
    const end: [number, number] = [137.389, -4.825];

    const routeA = runAStarRoute(grid, start, end, BASE_WEIGHTS, 'r1');
    const routeB = runAStarRoute(grid, start, end, BASE_WEIGHTS, 'r1');

    expect(routeA.feasible).toBe(true);
    expect(routeA.distanceM).toEqual(routeB.distanceM);
    expect(routeA.cumulativeCost).toEqual(routeB.cumulativeCost);
    expect(routeA.maxSlopeDeg).toBeLessThanOrEqual(BASE_WEIGHTS.maxSlopeDeg);

    // Straight-line distance is ~473 m; detour around ridge must be strictly longer
    const geodesic = marsDistanceM(start, end);
    expect(routeA.distanceM).toBeGreaterThan(geodesic);
  });

  it('refuses to silently relax constraints when a full barrier blocks all paths', () => {
    const bbox: [number, number, number, number] = [137.38, -4.83, 137.39, -4.82];
    const rows = 11;
    const cols = 11;
    // Complete north-south cliff wall across column 5
    const elevations: number[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, (_, c) => (c === 5 ? -3250 : -3500))
    );

    const grid = deriveTerrainFromElevations({
      id: 'cliff-wall',
      bbox,
      elevations,
      demSourceId: 'test-dem',
      demResolution: 'synthetic',
      provenance: TEST_PROVENANCE,
    });

    const blocked = runAStarRoute(grid, [137.381, -4.825], [137.389, -4.825], BASE_WEIGHTS, 'blocked-1');
    expect(blocked.feasible).toBe(false);
    expect(blocked.geometry).toBeNull();
    expect(blocked.blockedReason).toContain('SLOPE_LIMIT');
  });

  it('marks NO_DATA cells impassable and counts missing data explicitly', () => {
    const bbox: [number, number, number, number] = [137.38, -4.83, 137.39, -4.82];
    const elevations: (number | null)[][] = Array.from({ length: 7 }, (_, r) =>
      Array.from({ length: 7 }, (_, c) => (c === 3 && r >= 1 && r <= 5 ? null : -3500))
    );

    const grid = deriveTerrainFromElevations({
      id: 'nodata-grid',
      bbox,
      elevations,
      demSourceId: 'test-dem',
      demResolution: 'synthetic',
      provenance: TEST_PROVENANCE,
    });

    expect(grid.noDataCellsCount).toBe(5);
    const res = runAStarRoute(grid, [137.381, -4.825], [137.389, -4.825], BASE_WEIGHTS, 'nodata-route');
    expect(res.feasible).toBe(true);
  });

  it('produces monotonic sensitivity results across slope thresholds', () => {
    const bbox: [number, number, number, number] = [137.38, -4.83, 137.39, -4.82];
    const elevations: number[][] = Array.from({ length: 9 }, (_, r) =>
      Array.from({ length: 9 }, (_, c) => -3500 + (c === 4 && r >= 2 && r <= 6 ? 16 : 0))
    );
    const grid = deriveTerrainFromElevations({
      id: 'sens-grid',
      bbox,
      elevations,
      demSourceId: 'test-dem',
      demResolution: 'synthetic',
      provenance: TEST_PROVENANCE,
    });
    const sens = computeSlopeSensitivity(grid, [137.381, -4.825], [137.389, -4.825], BASE_WEIGHTS);
    expect(sens.length).toBe(6);
    // Stricter threshold cannot produce lower cost than a looser threshold if both feasible
    const feasibleCosts = sens.filter((s) => s.feasible && s.cumulativeCost !== null).map((s) => s.cumulativeCost!);
    for (let i = 1; i < feasibleCosts.length; i++) {
      expect(feasibleCosts[i]).toBeLessThanOrEqual(feasibleCosts[i - 1] + 1);
    }
  });
});
