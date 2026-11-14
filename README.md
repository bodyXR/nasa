# MARS//PATH

**Plan the path. Follow the evidence. Explore Mars.**

MARS//PATH is a full-stack planetary data-fusion and Marswalk decision-support prototype built for the NASA Space Apps Challenge (*"Interplanetary Survival Guide: Martian Map"*). Starting from 3D Mars orbit and descending into Gale Crater / lower Mount Sharp, it integrates live NASA Mars Trek mosaics, 1 m/px stereo elevation grids (`Gale_DEM_SMG_1m`), Odyssey THEMIS thermal infrared, USGS SIM 3292 geology, MRO CRISM/OMEGA hydrous mineral detections, mapped dune hazards, and Curiosity rover observations, REMS meteorology, and PDS-PPI RAD dosimetry.

## Architecture Overview
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Zustand (URL-synced state), Three.js (3D Mars orbital globe), MapLibre GL JS (2D geospatial workbench with custom `trek://` `EPSG:104905 -> EPSG:3857` tile reprojection).
- **Backend**: Node.js v22, Express 5, Zod validation, Node built-in `node:sqlite` windowed caching, resilient HTTP client with circuit breakers, and optional grounded `@google/genai` brief synthesis.
- **Documentation**: Full technical, scientific, and UX documentation is located under [`/docs`](./docs/PRD.md), including [`DATA_SOURCES.md`](./docs/DATA_SOURCES.md), [`LIMITATIONS.md`](./docs/LIMITATIONS.md), and [`DECISIONS.md`](./docs/DECISIONS.md).

## Running Locally
```bash
npm install
npm run dev       # Unified Express + Vite dev server on http://localhost:3000
npm run lint      # TypeScript typecheck (tsc --noEmit)
npm run build     # Production Vite bundle -> dist/
npm test          # Vitest unit, honesty-guard, and API integration suite
npm run start     # Production server (NODE_ENV=production tsx server.ts)
```

Optional environment variable (see `.env.example`):
- `GEMINI_API_KEY`: Enables grounded optional AI narrative synthesis inside `POST /api/mission/brief` (every generated summary is strictly labeled `AI-GENERATED FROM VERIFIED DATA` and cites verified source IDs).

## Verification & Honesty Standards
- Zero fabricated elevations, coordinates, weather, radiation, or rover observations.
- Missing or out-of-coverage data renders explicitly as `DATA UNAVAILABLE` or `UNLOCATED`.
- Route planning outputs compare deterministic A* candidate routes under explicit `ASSUMPTION` slope/speed models; MARS//PATH never guarantees passability or EVA safety.
- **NASA/USGS Non-Endorsement**: Integrated products originate from public NASA, JPL-Caltech, USGS Astrogeology, and ESA/CAB archives. NASA and the U.S. Government do not endorse MARS//PATH.
