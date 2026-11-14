# NASA Space Apps Challenge Submission — MARS//PATH

**Challenge**: *Interplanetary Survival Guide: Martian Map*  
**Project Name**: **MARS//PATH**  
**Tagline**: *Plan the path. Follow the evidence. Explore Mars.*

## Summary
MARS//PATH answers a core human/robotic Mars exploration question:
*"Where should we go, why should we go there, what evidence supports it, and how can we evaluate the path before we take it?"*

Starting from **3D Mars Orbit** (`Three.js` + NASA Viking MDIM 2.1 mosaic) and descending smoothly into a synchronized **2D Geospatial Field Workspace** (`MapLibre GL JS` with pixel-accurate `EPSG:104905 -> EPSG:3857` tile reprojection), explorers fuse live **NASA Mars Trek** high-resolution mosaics (HiRISE, CTX), **Odyssey THEMIS** Night IR thermal inertia, **USGS SIM 3292** geology, **MRO CRISM/OMEGA** hydrous mineral detections, **Dune_Field** sand hazards, and live **Curiosity** traverse waypoints, raw rover imagery, **REMS** meteorology, and **PDS-PPI RAD** dosimetry.

Rather than inventing synthetic maps or asserting false safety guarantees, MARS//PATH drives target discovery through transparent **EvidenceConvergence** checks, runs deterministic **8-connected A\*** multi-candidate routing over live **`Gale_DEM_SMG_1m`** elevation grids (`getSamples`), reveals sensitivity across assumed slope thresholds (`10°–26°`), and exports a reproducible SHA-256 **Mission Brief ("FIELD PLAN")** with full provenance and limitations.
