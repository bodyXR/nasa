import { afterEach, describe, expect, it } from 'vitest';
import {
  clearMemoryCache,
  getDb,
  readCache,
  resetDbForTests,
  writeCache,
} from '../server/db';

describe('SQLite Cache & MSL Data Parsing Integrity', () => {
  afterEach(() => {
    clearMemoryCache();
    resetDbForTests();
  });

  it('stores and retrieves cached payloads with accurate freshness vs stale TTL state', () => {
    getDb(':memory:');
    const now = Date.now();
    const pastIso = new Date(now - 120_000).toISOString();

    writeCache('test:fresh', 'unit-source', { value: 42 }, 3600, new Date(now).toISOString());
    const fresh = readCache<{ value: number }>('test:fresh', now);
    expect(fresh.hit).toBe(true);
    expect(fresh.stale).toBe(false);
    expect(fresh.data?.value).toBe(42);

    writeCache('test:stale', 'unit-source', { value: 99 }, 60, pastIso);
    clearMemoryCache();
    const stale = readCache<{ value: number }>('test:stale', now);
    expect(stale.hit).toBe(true);
    expect(stale.stale).toBe(true);
    expect(stale.data?.value).toBe(99);
  });

  it('verifies deterministic SHA-256 Brief hash generation structure', async () => {
    const { generateMissionBrief } = await import('../server/engines/briefEngine');
    const { REGIONS, OBJECTIVES, ROUTE_PRESETS } = await import('../server/catalog');

    const prov = REGIONS[0].provenance;
    const dummyTarget = {
      id: 't1',
      name: 'Boxwork Ridge Site',
      regionId: 'gale-crater',
      objectiveId: 'boxwork-formations',
      coordinates: [137.391, -4.828] as [number, number],
      elevationM: -3465,
      localSlopeDeg: 8.2,
      score: 88,
      rank: 1,
      classification: 'CANDIDATE_SITE' as const,
      disclaimer: 'Candidate site for evaluation.',
      whyHere: ['Overlaps boxwork geological zone.'],
      checks: [],
      evidenceItems: [],
      nearestRoverObservation: null,
      provenance: prov,
    };

    const dummyRoute = {
      id: 'r1',
      preset: 'LOWER_TERRAIN_COST' as const,
      label: 'Lower Modeled Terrain Cost',
      feasible: true,
      geometry: { type: 'LineString' as const, coordinates: [[137.3889, -4.826], [137.391, -4.828]] },
      distanceM: 250,
      elevationGainM: 12,
      elevationLossM: 3,
      maxSlopeDeg: 9.1,
      meanSlopeDeg: 5.4,
      cumulativeCost: 270,
      estimatedTimeMin: 7.2,
      speedModelAssumption: 'ASSUMPTION: 0.65 m/s Tobler-adapted pace',
      activeConstraints: ['Max slope <= 18 deg'],
      segments: [],
      waypoints: [],
      weights: ROUTE_PRESETS.LOWER_TERRAIN_COST,
      whyRoute: ['Minimizes slope effort.'],
      tradeoffSummary: '0.25 km',
      provenance: prov,
    };

    const env = {
      regionId: 'gale-crater',
      rems: { available: true, records: [], statement: 'Historical REMS', provenance: prov },
      rad: { available: true, records: [], statement: 'Historical RAD', provenance: prov },
      lastSynchronized: '2026-11-13T00:00:00Z',
    };

    const brief1 = await generateMissionBrief({
      region: REGIONS[0],
      objective: OBJECTIVES[1],
      target: dummyTarget,
      route: dummyRoute,
      demSource: 'trek-gale-dem-1m',
      gridCellSizeM: 42,
      env,
      includeAiSummary: false,
    });
    const brief2 = await generateMissionBrief({
      region: REGIONS[0],
      objective: OBJECTIVES[1],
      target: dummyTarget,
      route: dummyRoute,
      demSource: 'trek-gale-dem-1m',
      gridCellSizeM: 42,
      env,
      includeAiSummary: false,
    });

    expect(brief1.contentHash).toHaveLength(64);
    expect(brief1.contentHash).toBe(brief2.contentHash);
    expect(brief1.nasaDisclaimer).toContain('do not endorse MARS//PATH');
  });
});
