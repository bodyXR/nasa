import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { createApiRouter } from '../server/api';
import { getDb, resetDbForTests } from '../server/db';

let server: Server;
let baseUrl = '';

describe('Express API Integration & Contract Verification', () => {
  beforeAll(async () => {
    getDb(':memory:');
    const app = express();
    app.use(express.json());
    app.use('/api', createApiRouter());
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetDbForTests();
  });

  it('serves /api/health, /api/openapi.json, /api/regions, /api/datasets, and /api/objectives', async () => {
    const [health, spec, regions, datasets, objectives] = await Promise.all([
      fetch(`${baseUrl}/api/health`).then((r) => r.json()),
      fetch(`${baseUrl}/api/openapi.json`).then((r) => r.json()),
      fetch(`${baseUrl}/api/regions`).then((r) => r.json()),
      fetch(`${baseUrl}/api/datasets`).then((r) => r.json()),
      fetch(`${baseUrl}/api/objectives`).then((r) => r.json()),
    ]);

    expect(health.status).toBe('ok');
    expect(health.disclaimer).toContain('do not endorse');
    expect(spec.openapi).toBe('3.1.0');
    expect(regions.regions.length).toBeGreaterThan(0);
    expect(datasets.datasets.length).toBeGreaterThanOrEqual(8);
    expect(objectives.objectives.length).toBeGreaterThanOrEqual(2);
  });

  it('validates /api/terrain/point query parameters cleanly with ApiErrorEnvelope', async () => {
    const res = await fetch(`${baseUrl}/api/terrain/point?lon=abc&lat=xyz`);
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.code).toBe('INVALID_COORDS');
    expect(err.retryable).toBe(false);
  });

  it('returns 404 ROUTE_NOT_FOUND envelope for missing route analysis runs', async () => {
    const res = await fetch(`${baseUrl}/api/routes/nonexistent-id`);
    expect(res.status).toBe(404);
    const err = await res.json();
    expect(err.code).toBe('ROUTE_NOT_FOUND');
  });

  it('parses direct coordinates in /api/search without network latency', async () => {
    const res = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent('-4.826, 137.389')}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const coordResult = data.results.find((r: { kind: string }) => r.kind === 'COORDINATE');
    expect(coordResult).toBeDefined();
    expect(coordResult.coordinates[0]).toBeCloseTo(137.389, 3);
    expect(coordResult.coordinates[1]).toBeCloseTo(-4.826, 3);
  }, 15000);
});
