# Database Schema — MARS//PATH

MARS//PATH uses Node 22's built-in `node:sqlite` (`DatabaseSync`) with WAL mode enabled in `.data/marspath.db` (or `:memory:` in isolated unit/integration tests).

## Tables (`server/db.ts`)
1. **`cache_entries`**:
   - `cache_key TEXT PRIMARY KEY`
   - `source_id TEXT NOT NULL`
   - `payload_json TEXT NOT NULL`
   - `retrieved_at TEXT NOT NULL`
   - `ttl_seconds INTEGER NOT NULL`
   - Purpose: Persistent upstream NASA/USGS response cache with explicit TTL & stale-while-revalidate support.
2. **`terrain_grids`**:
   - `grid_id TEXT PRIMARY KEY`
   - `bbox_json TEXT NOT NULL`
   - `dem_source_id TEXT NOT NULL`
   - `cell_size_m REAL NOT NULL`
   - `rows INTEGER NOT NULL`
   - `cols INTEGER NOT NULL`
   - `elevations_json TEXT NOT NULL`
   - `retrieved_at TEXT NOT NULL`
   - Purpose: Caches sampled `Gale_DEM_SMG_1m` / MOLA corridor elevation matrices so repeated route sensitivity runs require zero duplicate DEM HTTP calls.
3. **`route_runs`**:
   - `route_run_id TEXT PRIMARY KEY`
   - `region_id TEXT NOT NULL`
   - `objective_id TEXT NOT NULL`
   - `target_id TEXT`
   - `params_json TEXT NOT NULL`
   - `result_json TEXT NOT NULL`
   - `created_at TEXT NOT NULL`
   - Purpose: Audit log of computed A* multi-candidate route analyses retrievable via `GET /api/routes/:id` and referenced by `POST /api/mission/brief`.
4. **`mission_plans`**:
   - `plan_id TEXT PRIMARY KEY`
   - `content_hash TEXT NOT NULL`
   - `region_id TEXT NOT NULL`
   - `objective_id TEXT NOT NULL`
   - `target_id TEXT NOT NULL`
   - `route_id TEXT NOT NULL`
   - `brief_json TEXT NOT NULL`
   - `created_at TEXT NOT NULL`
   - Purpose: Stores generated Field Plans keyed by deterministic content hash prefix.
