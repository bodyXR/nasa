# Backend Architecture — MARS//PATH

## 1. Runtime & Process Model
- Single unified Node.js (v22) + Express 5 server (`server.ts`) listening on port `3000`.
- In development (`npm run dev`), `server.ts` mounts `/api/*` via `createApiRouter()` and serves the React SPA through Vite middleware (`server.middlewareMode: true`).
- In production (`npm run start`), `server.ts` serves prebuilt `dist/` assets with SPA fallback alongside `/api/*`.

## 2. Resilience & Proxy Architecture
- **No Browser Calls to NASA/USGS**: All browser tile requests go through `/api/tiles/:layer/:z/:row/:col` (`server/tileProxy.ts`) and all vector/DEM/telemetry calls go through `/api/*`, resolving CORS restrictions (`SIM3292` and `MSL_traverse.json`).
- **Circuit Breaker & Retry (`server/httpClient.ts`)**: Per-source exponential backoff retries (`2` attempts), request timeouts, and automatic circuit-breaker open window (`60s` cooldown after 3 consecutive failures) with stale-while-revalidate SQLite fallback.

## 3. Modular Layers (`/server/`)
- `catalog.ts`: Verified `REGIONS`, `DATASETS`, `OBJECTIVES`, `ROUTE_PRESETS`, and `NASA_NON_ENDORSEMENT_DISCLAIMER`.
- `db.ts`: Built-in `node:sqlite` (`DatabaseSync`) persistence + hot in-memory TTL cache.
- `adapters/`: `trekDem.ts` (Gale 1m DEM + MOLA fallback), `trekFeatures.ts` (SIM3292, Dune_Field, CRISM/OMEGA, FRT footprints, IAU `combinedNom`), `mslRover.ts` (Traverse, Waypoints, Raw Images, REMS, PDS-PPI RAD).
- `engines/`: `terrainEngine.ts`, `routeEngine.ts`, `evidenceEngine.ts`, `briefEngine.ts`.
