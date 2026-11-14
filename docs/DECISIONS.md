# MARS//PATH — Architecture Decision Records (ADR)

## ADR-001: Replace Template Landing Page with Full-Stack React + Express + SQLite Architecture
- **Status**: Accepted
- **Context**: The repository started as a static single-file HTML ESG dashboard template (`Folio`, 6,375 lines in `index.html`). MARS//PATH requires a server-side NASA/USGS adapter layer, SQLite windowed cache, terrain slope/hazard computation, deterministic A* pathfinding, Three.js 3D Mars globe, and MapLibre GL JS geospatial workbench.
- **Decision**: Build a unified TypeScript codebase with Vite + React 19 + Tailwind CSS v4 + Zustand + Three.js + MapLibre GL JS on the frontend, and Express + Node 22 built-in `node:sqlite` + Zod on the backend (`server.ts` serving Vite middleware in dev and `dist/` in production on port 3000).
- **Consequences**: Single-port deployment on `:3000`, zero external database server dependencies, strict separation so the frontend never calls NASA/USGS REST APIs directly (except verified public tile endpoints/proxy).

## ADR-002: Equirectangular-to-Web-Mercator Tile Reprojection for NASA Mars Trek WMTS
- **Status**: Accepted
- **Context**: Live inspection of NASA Mars Trek `WMTSCapabilities.xml` confirmed that all Mars EQ layers use `urn:ogc:def:crs:EPSG::104905` (Equirectangular Plate Carrée, `TopLeftCorner: -180 90`, `MatrixWidth = 2^(z+1)`, `MatrixHeight = 2^z`). MapLibre GL JS renders raster tiles in Web Mercator (`EPSG:3857`) where `MatrixWidth = MatrixHeight = 2^z`.
- **Decision**: Implement a custom `trek://` protocol handler in MapLibre (`maplibregl.addProtocol`) backed by `/api/tiles/:layer/:z/:y/:x` proxy (for CORS-restricted layers like `SIM3292_Global_Geology` and caching). Because longitude columns at Web Mercator zoom `z` (`2^z` cols) align 1:1 with Trek EQ zoom `z_eq = z - 1` (`2^((z-1)+1) = 2^z` cols), we remap each output pixel row `py` via exact inverse Mercator latitude `lat = atan(sinh(pi * (1 - 2*(y + py/256)/2^z))) * 180/pi` to the exact Equirectangular source row across the 1–2 overlapping Trek tiles.
- **Consequences**: Orbital HiRISE, CTX, MOLA, THEMIS, and SIM 3292 geology rasters align pixel-accurately with Curiosity GeoJSON traverse, waypoints, CRISM footprints, and computed routes.

## ADR-003: Real Terrain Cost Grid from `Gale_DEM_SMG_1m/ImageServer/getSamples`
- **Status**: Accepted
- **Context**: Mars Trek `TrekWS/rest/elev` is 404 and `ImageServer/exportImage` returns ArcGIS error 400, whereas `Gale_DEM_SMG_1m/ImageServer/getSamples` (`~1 m/px` F32 DEM) and `Mars_MOLA_blend200ppx_HRSC_DEM/ImageServer/getSamples` (`200 m/px`) return HTTP 200 with exact floating-point elevation values.
- **Decision**: Sample a real windowed DEM grid over the target corridor in Gale Crater (default lower Mount Sharp / Boxwork to Vera Rubin Ridge / Glen Torridon study area, or any user-requested corridor within `Gale_DEM_SMG_1m` bounds) via batched `getSamples` calls, persist the sampled grid in SQLite with provenance + `retrievedAt`, compute Horn 3x3 slope/aspect/roughness and verifiable hazards (`slope > limit`, `no-data`, `Dune_Field` overlap), and run deterministic 8-connected A* pathfinding.
- **Consequences**: Every elevation, slope, and route metric traces back to a real NASA DEM sample with zero fabricated terrain.

## ADR-004: Honest Marswalk Modeling Assumptions & Non-Endorsement
- **Status**: Accepted
- **Context**: Terrestrial Tobler hiking functions and assumed EVA suit slope limits are NOT NASA-certified Mars suit telemetry.
- **Decision**: Label every slope cost function, traverse speed estimate, pair-EVA slope cap, and rover-assisted threshold explicitly as `ASSUMPTION`, never use `"SAFE ROUTE"` or `"guaranteed"`, include mandatory NASA non-endorsement disclaimers in the footer and exported Field Plan brief, and enforce an automated honesty-check test in CI/verification.
