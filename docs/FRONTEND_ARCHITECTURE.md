# Frontend Architecture — MARS//PATH

## 1. State Synchronization (`src/store/planetStore.ts`)
- Built with Zustand (`usePlanetStore`) synchronized directly to URL query parameters (`mode`, `pm`, `region`, `obj`, `lat`, `lon`, `z`, `b`, `p`, `target`, `route`, `sa`, `layers`) so any workspace state is shareable and reload-safe.

## 2. Code-Split Viewports (`src/App.tsx`)
- **`MarsOrbitScene` (`src/components/orbit/MarsOrbitScene.tsx`)**: Lazy-loaded Three.js WebGL Mars globe composited with real NASA Viking MDIM 2.1 global mosaic tiles (`/api/tiles/Mars_Viking_MDIM21_ClrMosaic_global_232m/1/{r}/{c}.jpg`), atmospheric rim shell, orbital ring, Gale Crater beacon, `prefers-reduced-motion` support, and graceful 2D fallback on WebGL failure.
- **`MarsFieldMap` (`src/components/map/MarsFieldMap.tsx`)**: Lazy-loaded MapLibre GL JS canvas using custom `trek://` CRS-reprojecting protocol, synchronized split-screen swipe comparison, geodesic measure tool, click-to-sample DEM Coordinate Inspector, and bidirectional hover marker synced with `ElevationProfileTray`.

## 3. Workspace Panels
- **Left Rail (`DataRail.tsx`)**: Active vs Available dataset switcher with Simple/Advanced provenance view.
- **Right Inspector**: Tabs for `Overview` (`WhatAmISeeingBar`), `Evidence` (`EvidenceTargetPanel` with accessible table toggle), `Rover POV` (`RoverObservationsPanel`), `Routes` (`TerrainRoutePanel`), and `Environment` (`EnvironmentPanel`).
- **Modals & Overlays**: `MissionBriefModal` (JSON + Print/PDF), `LimitationsModal`, `HowThisWorksSpotlight`, and `PresentationModes` (`DecisionTrail`, `OfflinePackButton`, `HudConceptOverlay`).
