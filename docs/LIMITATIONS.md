# Declared Limitations & Scientific Methodology — MARS//PATH

MARS//PATH adheres strictly to NASA/USGS scientific honesty rules. Every analytical output carries declared boundaries:

1. **Spatial Coverage Boundaries**:
   - `Gale_DEM_SMG_1m` (`1 m/px`) is bounded strictly to `137.1225°E..137.7298°E, -4.9255°N..-4.2490°N`. Coordinates outside this footprint fall back to `Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw` (`200 m/px`) or explicitly report `DATA UNAVAILABLE`.
   - `USGS SIM 3292` is mapped at `1:20,000,000` global scale and cannot resolve meter-scale geologic contacts.
2. **Resolution & Sub-Grid Hazards**:
   - Interactive corridor A* routing samples DEM points at `~30–90 m` grid cell spacing (`20×20` to `24×24`). Sub-grid boulders, small impact craters, fractured ridges, ventifacts, and regolith bearing strength (slip/sinkage) are NOT resolved by orbital elevation grids.
3. **Temporal Limitations**:
   - Curiosity `MSL REMS` meteorology and `PDS-PPI MSL RAD` Level-3 RDR dosimetry reflect historical measurements recorded along Curiosity's past traverse. They are NOT real-time weather forecasts, dust-storm predictions, or astronaut crew radiation certifications.
4. **Explicit Modeling Assumptions**:
   - Slope effort multipliers (`exp(3.2 * tan(slope))`) adapt terrestrial hiking effort models (Tobler) as a planning heuristic (`ASSUMPTION`), NOT a NASA-certified spacesuit metabolic curve.
   - Configurable maximum traversable slope limits (`10°–26°`) and nominal flat walking speeds (`0.55–0.75 m/s`) are adjustable user assumptions.
   - MARS//PATH NEVER claims any corridor is `"SAFE ROUTE"` or `"guaranteed"`.
5. **Missing Data Honesty**:
   - Curiosity raw camera images lacking an exact `site + drive` match in `MSL_waypoints.json` are explicitly tagged `UNLOCATED` (`coordinates: null`).
   - Unverified subsurface ground-penetrating radar (SHARAD) vector polygons are not invented and remain explicitly declared unavailable via REST feeds.
