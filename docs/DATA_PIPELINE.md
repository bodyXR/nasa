# Data Pipeline & CRS Harmonization — MARS//PATH

## 1. Upstream Ingestion & Proxy Flow
All external planetary requests originate in `/server/adapters/` and `/server/tileProxy.ts` — the React browser client never makes direct cross-origin requests to NASA/USGS hosts.

1. **Mars Trek WMTS Raster Pipeline (`server/tileProxy.ts` + `src/geo/trekProtocol.ts`)**:
   - Mars Trek EQ WMTS uses `urn:ogc:def:crs:EPSG::104905` (Equirectangular 2×1 root tile matrix, `TopLeftCorner: -180 90`, `MatrixWidth = 2^(z+1)`).
   - MapLibre GL JS expects Web Mercator (`EPSG:3857`, 1×1 root tile matrix).
   - `ensureTrekProtocol()` intercepts `trek://{layer}/{z}/{x}/{y}.{ext}`, maps Web Mercator zoom `z` to `trekZ = Math.max(0, z - 1)`, fetches exact latitude-band Trek tiles via `/api/tiles/...`, and resamples every pixel scanline through `mercatorTilePixelToLat()`.
2. **Mars Trek DEM Sampling (`server/adapters/trekDem.ts`)**:
   - Coordinates are clamped/checked against `Gale_DEM_SMG_1m` extent (`137.1225..137.7298°E, -4.9255..-4.2490°N`).
   - Grid corridors batch all `rows × cols` points into ArcGIS `ImageServer/getSamples` (40-point chunks) and persist raw elevation matrices into SQLite `terrain_grids`.
   - Out-of-footprint coordinates automatically fall back to `Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw` (200 m/px) or report `DATA UNAVAILABLE`.
3. **Curiosity Localization Join (`server/adapters/mslRover.ts`)**:
   - `raw_image_items` records are joined to `MSL_waypoints.json` strictly by exact `site` + `drive` keys.
   - Images lacking a matching waypoint are flagged `located: false` with `localizationMethod: 'UNLOCATED'` and `coordinates: null`.
4. **PDS-PPI MSL RAD RDR Parser (`server/adapters/mslRover.ts`)**:
   - Scrapes real directory listings under `https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/` and parses ASCII `RAD_RDR_*.TXT` telemetry rows into `RadObservationSummary`.
