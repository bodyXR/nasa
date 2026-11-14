# Product Requirements Document (PRD) — MARS//PATH

**Tagline**: Plan the path. Follow the evidence. Explore Mars.  
**Core Question**: *"Where should we go, why should we go there, what evidence supports it, and how can we evaluate the path before we take it?"*

## 1. Mission & Users
MARS//PATH is a planetary data-fusion and Marswalk decision-support workspace built for the NASA Space Apps Challenge (*"Interplanetary Survival Guide: Martian Map"*). It serves:
- **Mission & Traverse Planners** comparing scientific targets against real orbital topography, slope constraints, and dune hazards.
- **Planetary Scientists & Students** inspecting how multi-mission datasets (MRO HiRISE/CTX/CRISM, Odyssey THEMIS, MGS MOLA, USGS SIM 3292, MSL Curiosity) converge at Gale Crater and lower Mount Sharp.

## 2. Core Functional Requirements
1. **3D Mars Orbit (`ORBIT`) to 2D Geospatial Field (`FIELD`)**: Seamless transition from interactive Three.js globe (composited NASA Viking MDIM 2.1 mosaic + Gale Crater beacon) into a MapLibre GL JS geospatial workspace with shared URL-synced camera/mode state.
2. **Authoritative Mars Data Fusion**: All tiles and REST/GeoJSON queries proxy through `/api/*` and `trek://` CRS reprojection (`EPSG:104905` -> `EPSG:3857`) with provenance metadata (`Provenance`), Simple/Advanced inspection, and layer opacity controls.
3. **Objective-Driven Evidence Convergence**: Supports switching between *Ancient Water & Lacustrine Stratigraphy* and *Lower Mount Sharp Boxwork Formations*, producing ranked `ScienceTarget` records with weighted `EvidenceCheck` audit rows.
4. **Curiosity Ground-Truth Archive & Target POV**: Real MSL traverse line (`MSL_traverse.json`), waypoints (`MSL_waypoints.json`), and raw camera observations (`raw_image_items`), explicitly tagging unmatched imagery as `UNLOCATED`.
5. **Terrain Derivation & Multi-Candidate A* Routing**: On-demand `Gale_DEM_SMG_1m` (`getSamples`) grid sampling, Horn (1981) 3×3 slope + TRI roughness, 5 distinct A* candidate presets (`SHORTEST`, `LOWER_TERRAIN_COST`, `SCIENCE_ORIENTED`, `PAIR_EVA`, `ROVER_ASSISTED`), slope sensitivity sweep, and linked SVG elevation profile.
6. **Reproducible Mission Brief ("FIELD PLAN")**: Generates structured brief with SHA-256 `contentHash`, JSON export, printable PDF view, declared 5-part Limitations, NASA non-endorsement notice, and optional grounded `@google/genai` summary.
7. **Presentation Modes**: `HABITAT` (desktop multi-rail mission planning), `TABLET` (field drawer + offline region pack JSON export), and `HUD` (minimal bearing/distance/slope concept overlay).

## 3. Non-Negotiable Trust & Safety Rules
- Never fabricate elevations, coordinates, rover observations, weather, or radiation records.
- Missing or out-of-coverage data explicitly displays `DATA UNAVAILABLE`.
- Never label any route `"SAFE ROUTE"` or claim `"guaranteed"` safety/passability.
- All slope cutoffs and walking speeds are explicitly marked `ASSUMPTION` decision-support parameters.
