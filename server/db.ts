import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let dbInstance: DatabaseSync | null = null;

export function getDb(customPath?: string): DatabaseSync {
  if (dbInstance) return dbInstance;
  const dbPath = customPath ?? process.env.MARSPATH_DB_PATH ?? resolve(process.cwd(), '.data', 'marspath.db');
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS cache_entries (
      cache_key TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      ttl_seconds INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS terrain_grids (
      grid_id TEXT PRIMARY KEY,
      bbox_json TEXT NOT NULL,
      dem_source_id TEXT NOT NULL,
      cell_size_m REAL NOT NULL,
      rows INTEGER NOT NULL,
      cols INTEGER NOT NULL,
      elevations_json TEXT NOT NULL,
      retrieved_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS route_runs (
      route_run_id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL,
      objective_id TEXT NOT NULL,
      target_id TEXT,
      params_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mission_plans (
      plan_id TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      region_id TEXT NOT NULL,
      objective_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      route_id TEXT NOT NULL,
      brief_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  dbInstance = db;
  return db;
}

export function resetDbForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export interface CacheReadResult<T> {
  hit: boolean;
  stale: boolean;
  data: T | null;
  retrievedAt: string | null;
}

const memoryCache = new Map<string, { data: unknown; retrievedAt: string; ttlSeconds: number }>();

export function clearMemoryCache(): void {
  memoryCache.clear();
}

export function readCache<T>(key: string, nowMs = Date.now()): CacheReadResult<T> {
  const mem = memoryCache.get(key);
  if (mem) {
    const ageSec = (nowMs - Date.parse(mem.retrievedAt)) / 1000;
    return {
      hit: true,
      stale: ageSec > mem.ttlSeconds,
      data: mem.data as T,
      retrievedAt: mem.retrievedAt,
    };
  }
  const db = getDb();
  const row = db
    .prepare('SELECT payload_json, retrieved_at, ttl_seconds FROM cache_entries WHERE cache_key = ?')
    .get(key) as { payload_json: string; retrieved_at: string; ttl_seconds: number } | undefined;

  if (!row) {
    return { hit: false, stale: false, data: null, retrievedAt: null };
  }
  const data = JSON.parse(row.payload_json) as T;
  memoryCache.set(key, { data, retrievedAt: row.retrieved_at, ttlSeconds: row.ttl_seconds });
  const ageSec = (nowMs - Date.parse(row.retrieved_at)) / 1000;
  return {
    hit: true,
    stale: ageSec > row.ttl_seconds,
    data,
    retrievedAt: row.retrieved_at,
  };
}

export function writeCache<T>(key: string, sourceId: string, data: T, ttlSeconds: number, retrievedAt = new Date().toISOString()): void {
  memoryCache.set(key, { data, retrievedAt, ttlSeconds });
  const db = getDb();
  db.prepare(
    `INSERT INTO cache_entries (cache_key, source_id, payload_json, retrieved_at, ttl_seconds)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       source_id = excluded.source_id,
       payload_json = excluded.payload_json,
       retrieved_at = excluded.retrieved_at,
       ttl_seconds = excluded.ttl_seconds`
  ).run(key, sourceId, JSON.stringify(data), retrievedAt, ttlSeconds);
}
