# Guided Demo Scenario — MARS//PATH

## Scenario: Lower Mount Sharp Boxwork Marswalk (Curiosity Sol 5073 Sector)

1. **Mars Orbit (`ORBIT`)**: Open `/` to inspect the 3D Mars globe rendered with NASA Viking MDIM 2.1 global albedo tiles and Gale Crater beacon (`4.775°S, 137.389°E`).
2. **Descent to Gale Crater (`FIELD`)**: Click **FOLLOW THE EVIDENCE** (or **PLAN A MARSWALK**) to descend smoothly into the MapLibre GL JS field workspace centered on Aeolis Mons (Mount Sharp).
3. **Inspect Planetary Data (`DataRail`)**:
   - Observe active layers (`Gale CTX`, `HiRISE Curiosity Mosaic`, `Curiosity Traverse & Waypoints`, `Mapped Dune Fields`).
   - Toggle **Odyssey THEMIS Night IR** or **USGS SIM 3292 Geology** and switch `SIMPLE` -> `ADVANCED` to inspect CRS (`EPSG:104905`), resolution, and source URLs.
   - Click **Compare** in the map toolbar to swipe primary HiRISE optical imagery against THEMIS Night IR thermal inertia.
4. **Evidence & Target Selection (`Evidence` Tab)**:
   - Switch objective to **Lower Mount Sharp Boxwork Formations**.
   - Select **Lower Boxwork Ridge Crest (Target Outcrop East)** (`4.8294°S, 137.3972°E`) and inspect the 5 transparent `EvidenceCheck` rows and the nearest verified Curiosity Sol 5073 POV image.
5. **Terrain & Candidate Route Planning (`Route` Tab)**:
   - Origin defaults to **Curiosity Sol 5073** (`4.8260°S, 137.3889°E`, `-3,472.09 m`).
   - Click **PLAN A MARSWALK** -> samples a `20×20` `Gale_DEM_SMG_1m` corridor grid (`~55.9 m/cell`), computes Horn 3×3 slopes, and compares 5 candidate A* routes:
     - **Shortest Distance**: `529.1 m`, max slope `11.74°`
     - **Lower Modeled Terrain Cost**: `534.0 m`, max slope `11.6°`
     - **Science-Oriented**: `550.0 m`, max slope `13.1°`
     - **Pair EVA (12° Limit)**: `BLOCKED` (explicitly refuses to cross >12° gradient without silent relaxation)
     - **Rover-Assisted (22° Limit)**: `550.0 m`, max slope `13.1°`
   - Scrub the bottom **Linked Elevation Profile** to watch the synced marker traverse the ridge on the 2D map.
6. **Reproducible Field Plan (`MissionBriefModal`)**:
   - Click **GENERATE MISSION BRIEF (FIELD PLAN)** to inspect the deterministic SHA-256 `contentHash`, historical REMS weather + PDS-PPI RAD dosimetry, 5-part Limitations, NASA non-endorsement notice, and export JSON or print PDF.
