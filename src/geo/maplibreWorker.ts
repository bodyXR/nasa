import { setWorkerUrl } from 'maplibre-gl';

/**
 * MapLibre v6 resolves its worker script relative to `import.meta.url`, which neither
 * Vite's dependency optimizer (dev) nor the production bundle emits. The Express server
 * serves the exact-versioned worker at /vendor/maplibre-gl-worker.mjs, so GeoJSON and
 * vector sources (candidate routes, dunes, geology, observations) can index their data.
 *
 * Call once before any Map instance is created.
 */
export function ensureMaplibreWorkerUrl(): void {
  try {
    setWorkerUrl('/vendor/maplibre-gl-worker.mjs');
  } catch {
    // Keep MapLibre's default worker resolution if the override is unavailable.
  }
}
