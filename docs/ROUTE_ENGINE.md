# Terrain & Route Engine — MARS//PATH

## 1. Terrain Derivation (`server/engines/terrainEngine.ts`)
- **Metric Cell Spacing**: Grid bounding box width and height are projected onto Mars's IAU mean sphere (`R = 3,389,500 m`) using `marsDistanceM`.
- **Slope & Aspect (Horn 1981)**: Computed over every valid 3×3 neighborhood:
  `dz/dx = ((c + 2f + i) - (a + 2d + g)) / (8 * dx)`
  `dz/dy = ((g + 2h + i) - (a + 2b + c)) / (8 * dy)`
  `slopeDeg = atan(sqrt(dzdx^2 + dzdy^2)) * 180 / PI`
- **Terrain Ruggedness Index (TRI)**: Root-mean-square elevation difference across the 8 neighboring cells (Riley et al., 1999).
- **Hazard Masks**: Missing elevation cells (`NO_DATA`), cells exceeding `maxSlopeDeg`, and polygons intersecting Mars Trek `Dune_Field` (Bagnold Dunes).

## 2. Deterministic A* Cost Model (`server/engines/routeEngine.ts`)
- **8-Connected Grid Graph**: Admissible lower-bound heuristic `0.35 * marsDistanceM(cell, goal)`.
- **Edge Traversal Cost**:
  `cost = distM * (1 + wSlope * (exp(3.2 * tan(slopeRad)) - 1) + wTerrain * (roughness / 3) + wHazard * duneFlag) * max(0.35, 1 - wScience * scienceScore)`
- Edge costs remain strictly positive (`>= 0.35 * distM`), guaranteeing A* optimality and zero negative cycles.
- **Corridor Smoothing**: Bounded string-pull check ensures smoothed chords never cross blocked (`NO_DATA`, `SLOPE_LIMIT`, or `MAPPED_DUNE_FIELD`) cells.
- **Hard Constraint Honesty**: If no continuous feasible corridor exists, `runAStarRoute` returns `feasible: false` with the exact `blockingConstraint` and never relaxes thresholds silently.
- **5 Candidate Presets**: `SHORTEST`, `LOWER_TERRAIN_COST`, `SCIENCE_ORIENTED`, `PAIR_EVA`, and `ROVER_ASSISTED`, paired with a 6-step slope sensitivity sweep (`10°, 12°, 15°, 18°, 22°, 26°`).
