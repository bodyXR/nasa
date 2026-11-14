# Science Evidence Convergence Engine — MARS//PATH

Implemented in `/server/engines/evidenceEngine.ts` over declarative `ObjectiveRule` definitions in `/server/catalog.ts`.

## 1. Supported Objectives
1. **Ancient Water & Lacustrine Stratigraphy (`ancient-water`)**: Focuses on Vera Rubin Ridge, Glen Torridon clay-bearing trough, and the Marker Band sulfate transition.
2. **Lower Mount Sharp Boxwork Formations (`boxwork-formations`)**: Focuses on polygonal groundwater fracture boxwork ridges near Curiosity's 2025–2026 Sol 5040–5073 sector, Western Approach Saddle, and Gediz Vallis Ridge margin.

## 2. Transparent Weighted Scoring (0–100)
Every candidate target is scored deterministically from 5 real spatial checks:
1. **`GEOLOGY_UNIT`**: Intersection with USGS SIM 3292 polygons matching objective stratigraphic keywords (`mHl`, `mHh`, Hesperian/Aeolis).
2. **`SPECTRAL_DETECTION`**: Overlap with CRISM MTRDR FRT footprints or proximity (`<= 28 km`) to verified CRISM/OMEGA hydrous mineral detections.
3. **`ORBITAL_IMAGERY`**: Coverage inside high-resolution HiRISE (`curiosity_hirise_mosaic`) and `Gale_DEM_SMG_1m` footprints.
4. **`ROVER_PROXIMITY`**: Geodesic distance from verified `MSL_waypoints.json` locations and matched Curiosity camera imagery.
5. **`TERRAIN_COMPUTABLE`**: Live DEM elevation + local slope check against `maxExclusionSlopeDeg` and `Dune_Field` overlap.

Each check produces an explicit `EvidenceCheck` (`passed`, `weight`, `contribution`, `recordId`, `recordSummary`, and `Provenance`), and a 12×12 `convergenceGrid` GeoJSON layer visualizes multi-dataset overlap across Gale Crater.
