# UX Flow & User Journey — MARS//PATH

## 1. Entry & Descent (`ORBIT` -> `FIELD`)
1. User opens `/` and sees the 3D Mars globe (`MarsOrbitScene`) with >=75% unobstructed planetary canvas, Viking MDIM 2.1 global albedo mosaic, and Gale Crater orbital beacon (`4.775°S, 137.389°E`).
2. User selects one of three entry intents (`EXPLORE MARS`, `FOLLOW THE EVIDENCE`, `PLAN A MARSWALK`) or `Skip intro` -> smooth camera descent transitions cleanly into the `FIELD` workspace with the matching tab opened (`WHY`, `EVIDENCE`, or `ROUTE`).

## 2. Planetary Data Inspection (`DataRail`)
- Left rail splits layers into **ACTIVE ON MAP** and **AVAILABLE** by discipline (`IMAGERY`, `TOPOGRAPHY`, `THERMAL`, `GEOLOGY`, `SPECTRAL`, `ROVER_OBSERVATION`, `ATMOSPHERIC`, `RADIATION`).
- Simple mode displays `WHAT IT SHOWS`, opacity slider, and visibility toggle. Advanced mode exposes `WHY IT MATTERS`, mission, instrument, resolution, CRS, product ID, `lastSynchronized`, and `LIMITATIONS`.

## 3. Map Interaction (`MarsFieldMap`)
- **Coordinate Inspector**: Hovering updates live EPSG:104905 cursor coordinates; clicking queries `/api/terrain/point` for real `Gale_DEM_SMG_1m` elevation & local slope (or `DATA UNAVAILABLE` / MOLA fallback).
- **Measure Tool**: Multi-point Mars spherical geodesic distance (`R = 3,389.5 km`) and azimuth readout.
- **Swipe Compare**: Synchronized split-screen comparing primary imagery against Odyssey THEMIS Night IR, USGS SIM 3292 Geology, MOLA+HRSC relief, or CTX.

## 4. Evidence -> Target -> Rover -> Route -> Brief
1. Switch objective (`Ancient Water` vs `Boxwork Formations`) in `Evidence` tab.
2. Inspect ranked candidate targets, weighted `EvidenceCheck` records, `WHY HERE`, and nearest verified Curiosity POV photo (`distanceM` disclosed).
3. Click **PLAN A MARSWALK** -> calls `POST /api/routes/analyze`, displays corridor DEM stats, 5 candidate A* routes, slope sensitivity sweep (`10°..26°`), and bottom **Linked Elevation Profile** synced to map marker.
4. Click **GENERATE MISSION BRIEF (FIELD PLAN)** -> inspect SHA-256 hash, 5-part Limitations, NASA disclaimer, and export JSON or print PDF.
