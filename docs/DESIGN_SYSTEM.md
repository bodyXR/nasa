# Design System — MARS//PATH

MARS//PATH follows a **Planetary Atlas + Scientific Documentary + Mission Decision System** visual language designed for clarity, high contrast, and zero decorative clutter.

## 1. Color Tokens (`/index.css`)
- **Canvas & Surfaces**: Near-black Void (`#0A0B0D`), Mission Surface (`#121418`), Raised Inspector Surface (`#181B21`), 1 px hairline borders (`#262A33`, `#3A404D`).
- **Ink**: Warm Bone (`#E7E2D8`), Highlight Ivory (`#F6F3EC`), Muted Sand-Gray (`#A49E93`), Dim Telemetry (`#767168`).
- **Scientific & Mars Accents**: Mars Rust Red (`#C44D2B`), Deep Rust (`#9E3B20`), Ochre (`#D98A4E`), Regolith Sand (`#D4B483`), CRISM Slate Blue (`#5B8BB4`), Verified Sage (`#5E9C76`).

## 2. Typography
- **Editorial Headings (`Fraunces`)**: Used for planetary corridor titles, brief headers, and mission entry.
- **Body (`IBM Plex Sans`)**: Clean technical legibility at 12–15 px.
- **Telemetry & Coordinates (`IBM Plex Mono` with `tabular-nums`)**: Enforced across all latitudes, longitudes, elevations, slopes, distances, hashes, and timestamps.

## 3. UI & Accessibility Standards
- Zero glassmorphism or `backdrop-filter` over WebGL/MapLibre canvases.
- Zero pulsing indicator dots or decorative pill tags.
- `prefers-reduced-motion: reduce` disables camera orbital transitions and animations.
- Print stylesheet (`@media print`) formats the Mission Brief cleanly onto light paper while hiding interactive chrome (`.no-print`).
