# API Specification — MARS//PATH

All routes are served under `/api/*` and documented dynamically at `GET /api/openapi.json` (OpenAPI 3.1.0). Errors return a structured `ApiErrorEnvelope` (`{ code, message, source, retryable }`).

## Endpoints
- **`GET /api/health`**: Returns service status, dataset count, circuit breaker snapshot, and NASA non-endorsement notice.
- **`GET /api/regions`**, **`GET /api/datasets`**, **`GET /api/objectives`**, **`GET /api/missions`**: Catalog & rule endpoints.
- **`GET /api/tiles/:layer/:z/:row/:col`**: WMTS proxy for NASA Mars Trek EQ raster tiles (`curiosity_hirise_mosaic`, `Gale_CTX_BlockAdj_dd`, `THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018`, `THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018`, `Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw`, `Mars_Viking_MDIM21_ClrMosaic_global_232m`, `SIM3292_Global_Geology`) returning `204` on out-of-bounds empty tiles.
- **`GET /api/layers/geology?bbox=...`**, **`GET /api/layers/dunes?bbox=...`**, **`GET /api/layers/spectral?bbox=...`**, **`GET /api/layers/traverse`**: Proxied normalized GeoJSON layers with provenance.
- **`GET /api/evidence?regionId=...&objectiveId=...`** & **`GET /api/targets?regionId=...&objectiveId=...`**: Evaluates objective rules across USGS geology, CRISM/OMEGA spectroscopy, Gale 1m DEM, and MSL waypoints, returning ranked `ScienceTarget[]` + 12×12 `convergenceGrid`.
- **`GET /api/observations?sol=...`**: Curiosity raw images joined against `MSL_waypoints.json` (`located: true` vs `UNLOCATED`).
- **`GET /api/environment?regionId=...`**: Historical Curiosity REMS weather + PDS-PPI RAD radiation dosimetry.
- **`GET /api/terrain/point?lon=...&lat=...`** & **`POST /api/terrain/profile`**: Live DEM elevation and local slope sampling.
- **`POST /api/routes/analyze`** & **`GET /api/routes/:id`**: Corridor DEM grid sampling, Horn 3×3 terrain derivation, 5-preset A* pathfinding, hazard GeoJSON, and slope sensitivity sweep.
- **`POST /api/mission/brief`**: Reproducible Field Plan JSON with 64-char SHA-256 `contentHash` and optional grounded Gemini summary.
- **`GET /api/search?q=...`** (alias `/api/locations`): Searches coordinates, regions, datasets, objectives, targets, and live IAU `combinedNom` planetary nomenclature.
