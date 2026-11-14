import type { Request, Response } from 'express';

const ALLOWED_LAYERS = new Set([
  'curiosity_hirise_mosaic',
  'Gale_CTX_BlockAdj_dd',
  'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw',
  'Mars_MGS_MOLA_ClrShade_merge_global_463m',
  'Mars_Viking_MDIM21_ClrMosaic_global_232m',
  'THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018',
  'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018',
  'SIM3292_Global_Geology',
]);

interface CachedTileEntry {
  empty: boolean;
  buf?: Buffer;
  ct?: string;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 1600;
const TILE_TTL_MS = 3600_000;
const tileMemCache = new Map<string, CachedTileEntry>();
const inflightFetches = new Map<string, Promise<CachedTileEntry | { status: number }>>();

function buildTrekUrl(layer: string, z: number, row: number, col: number, ext: string): string {
  if (layer === 'SIM3292_Global_Geology') {
    return `https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/WMTS/tile/1.0.0/SIM3292_Global_Geology/default/default028mm/${z}/${row}/${col}.png`;
  }
  return `https://trek.nasa.gov/tiles/Mars/EQ/${layer}/1.0.0/default/default028mm/${z}/${row}/${col}.${ext}`;
}

function setCachedTile(key: string, entry: CachedTileEntry): void {
  if (tileMemCache.has(key)) {
    tileMemCache.delete(key);
  } else if (tileMemCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = tileMemCache.keys().next().value;
    if (firstKey) tileMemCache.delete(firstKey);
  }
  tileMemCache.set(key, entry);
}

export async function handleTrekTileProxy(req: Request, res: Response): Promise<void> {
  const layer = String(req.params.layer ?? '');
  const z = Number(req.params.z);
  const row = Number(req.params.row);
  const rawCol = String(req.params.col ?? '');
  const match = rawCol.match(/^(\d+)\.(png|jpg|jpeg)$/i);

  if (!ALLOWED_LAYERS.has(layer) || !Number.isInteger(z) || !Number.isInteger(row) || !match) {
    res.status(400).json({
      code: 'INVALID_TILE_PARAMS',
      message: 'Invalid Mars Trek tile parameters',
      source: 'tile-proxy',
      retryable: false,
    });
    return;
  }

  const col = Number(match[1]);
  const ext = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase();
  const key = `${layer}:${z}:${row}:${col}.${ext}`;

  const cached = tileMemCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    // Refresh LRU position
    tileMemCache.delete(key);
    tileMemCache.set(key, cached);

    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-MARS-PATH-CACHE', 'HIT');
    if (cached.empty) {
      res.status(204).end();
      return;
    }
    res.setHeader('Content-Type', cached.ct!);
    res.send(cached.buf!);
    return;
  }

  let job = inflightFetches.get(key);
  if (!job) {
    const upstreamUrl = buildTrekUrl(layer, z, row, col, ext);
    job = (async (): Promise<CachedTileEntry | { status: number }> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const up = await fetch(upstreamUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'MARS-PATH-TileProxy/1.0' },
        });
        clearTimeout(timer);

        if (!up.ok) {
          if (up.status === 404) {
            const emptyEntry: CachedTileEntry = { empty: true, expiresAt: Date.now() + TILE_TTL_MS };
            setCachedTile(key, emptyEntry);
            return emptyEntry;
          }
          return { status: up.status };
        }

        const buf = Buffer.from(await up.arrayBuffer());
        const ct = up.headers.get('content-type') || (ext === 'png' ? 'image/png' : 'image/jpeg');
        const entry: CachedTileEntry = {
          empty: false,
          buf,
          ct,
          expiresAt: Date.now() + TILE_TTL_MS,
        };
        setCachedTile(key, entry);
        return entry;
      } catch {
        clearTimeout(timer);
        return { status: 502 };
      } finally {
        inflightFetches.delete(key);
      }
    })();
    inflightFetches.set(key, job);
  }

  const result = await job;
  if ('status' in result) {
    res.status(result.status).end();
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-MARS-PATH-CACHE', 'MISS');
  if (result.empty) {
    res.status(204).end();
    return;
  }
  res.setHeader('Content-Type', result.ct!);
  res.send(result.buf!);
}
