import * as maplibregl from 'maplibre-gl';
import { mercatorTilePixelToLat } from '../../shared/geo';

let registered = false;

const MAX_SOURCE_CACHE = 520;
const MAX_REPROJECTED_CACHE = 420;
const sourceTileCache = new Map<string, Promise<ImageBitmap | null>>();
const reprojectedTileCache = new Map<string, ArrayBuffer>();
let cachedEmptyPng: ArrayBuffer | null = null;

function setLru<K, V>(map: Map<K, V>, max: number, key: K, val: V): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= max) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, val);
}

function fetchBitmap(url: string): Promise<ImageBitmap | null> {
  const existing = sourceTileCache.get(url);
  if (existing) {
    sourceTileCache.delete(url);
    sourceTileCache.set(url, existing);
    return existing;
  }

  // Never tie a shared cached fetch to one child tile's AbortController
  const p = fetch(url, { signal: AbortSignal.timeout?.(10_000) })
    .then(async (res) => {
      if (res.status === 204 || res.status === 404) return null;
      if (!res.ok) {
        sourceTileCache.delete(url);
        return null;
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) return null;
      return createImageBitmap(blob);
    })
    .catch(() => {
      sourceTileCache.delete(url);
      return null;
    });

  setLru(sourceTileCache, MAX_SOURCE_CACHE, url, p);
  return p;
}

async function canvasToArrayBuffer(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  mime: string,
  quality?: number
): Promise<ArrayBuffer> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: mime, quality });
    return blob.arrayBuffer();
  }
  const htmlCanvas = canvas as HTMLCanvasElement;
  const blob = await new Promise<Blob | null>((resolve) =>
    htmlCanvas.toBlob(resolve, mime, quality)
  );
  return blob ? blob.arrayBuffer() : new ArrayBuffer(0);
}

async function getEmptyTileBuffer(): Promise<ArrayBuffer> {
  if (cachedEmptyPng) return cachedEmptyPng.slice(0);
  const c =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(1, 1)
      : Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  const buf = await canvasToArrayBuffer(c, 'image/png');
  cachedEmptyPng = buf;
  return buf.slice(0);
}

/**
 * Registers custom `trek://` protocol in MapLibre GL JS to reproject NASA Mars Trek
 * Equirectangular (EPSG:104905, 2x1 root grid) WMTS tiles into Web Mercator (EPSG:3857)
 * tiles pixel-accurately so orbital HiRISE/CTX/MOLA/THEMIS/SIM3292 imagery aligns
 * directly with GeoJSON vectors (Curiosity traverse, waypoints, CRISM, routes).
 */
export function ensureTrekProtocol(): void {
  if (registered) return;
  registered = true;

  maplibregl.addProtocol('trek', async (params: maplibregl.RequestParameters, abortController: AbortController) => {
    const stripped = params.url.replace(/^trek:\/\//, '');
    const parts = stripped.split('/');
    if (parts.length < 4) {
      throw new Error(`Invalid trek:// tile URL: ${params.url}`);
    }
    const layerId = parts[0];
    const z = Number(parts[1]);
    const x = Number(parts[2]);
    const yMatch = parts[3].match(/^(\d+)\.(png|jpg)$/i);
    if (!yMatch) throw new Error(`Invalid tile filename: ${parts[3]}`);
    const y = Number(yMatch[1]);
    const ext = yMatch[2].toLowerCase();

    const cacheKey = `${layerId}/${z}/${x}/${y}.${ext}`;
    const cachedBuf = reprojectedTileCache.get(cacheKey);
    if (cachedBuf) {
      reprojectedTileCache.delete(cacheKey);
      reprojectedTileCache.set(cacheKey, cachedBuf);
      return { data: cachedBuf.slice(0) };
    }

    if (abortController.signal.aborted) {
      return { data: await getEmptyTileBuffer() };
    }

    const size = 256;
    const trekZ = Math.max(0, z - 1);
    const trekRows = Math.pow(2, trekZ);
    const trekCols = trekRows * 2;

    const latTop = mercatorTilePixelToLat(z, y, 0, size);
    const latBot = mercatorTilePixelToLat(z, y, size - 1, size);

    const rowTopFrac = ((90 - latTop) / 180) * trekRows;
    const rowBotFrac = ((90 - latBot) / 180) * trekRows;
    const minRow = Math.max(0, Math.min(trekRows - 1, Math.floor(rowTopFrac)));
    const maxRow = Math.max(0, Math.min(trekRows - 1, Math.floor(rowBotFrac)));

    const trekColStart = z === 0 ? 0 : x;

    const neededRows: number[] = [];
    for (let r = minRow; r <= maxRow; r++) neededRows.push(r);

    const fetches: Array<{ r: number; c: number; bmp: ImageBitmap | null }> = [];
    await Promise.all(
      neededRows.flatMap((r) =>
        (z === 0 ? [0, 1] : [trekColStart]).map(async (c) => {
          const safeCol = ((c % trekCols) + trekCols) % trekCols;
          const url = `/api/tiles/${layerId}/${trekZ}/${r}/${safeCol}.${ext}`;
          const bmp = await fetchBitmap(url);
          fetches.push({ r, c: safeCol, bmp });
        })
      )
    );

    if (abortController.signal.aborted) {
      return { data: await getEmptyTileBuffer() };
    }

    const hasAny = fetches.some((f) => f.bmp !== null);
    if (!hasAny) {
      const empty = await getEmptyTileBuffer();
      setLru(reprojectedTileCache, MAX_REPROJECTED_CACHE, cacheKey, empty);
      return { data: empty.slice(0) };
    }

    const bmpMap = new Map<string, ImageBitmap>();
    for (const f of fetches) {
      if (f.bmp) bmpMap.set(`${f.r}:${f.c}`, f.bmp);
    }

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(size, size)
        : Object.assign(document.createElement('canvas'), { width: size, height: size });
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) {
      return { data: await getEmptyTileBuffer() };
    }
    ctx.imageSmoothingEnabled = false;

    // Coalesce consecutive Mercator scanlines mapping to identical (eqRow, srcY)
    let runEqRow = -1;
    let runSrcY = -1;
    let runStartPy = 0;
    let runLen = 0;

    const flushRun = () => {
      if (runLen <= 0 || runEqRow < 0) return;
      if (z === 0) {
        const b0 = bmpMap.get(`${runEqRow}:0`);
        const b1 = bmpMap.get(`${runEqRow}:1`);
        if (b0) ctx.drawImage(b0, 0, runSrcY, 256, 1, 0, runStartPy, 128, runLen);
        if (b1) ctx.drawImage(b1, 0, runSrcY, 256, 1, 128, runStartPy, 128, runLen);
      } else {
        const safeCol = ((trekColStart % trekCols) + trekCols) % trekCols;
        const b = bmpMap.get(`${runEqRow}:${safeCol}`);
        if (b) ctx.drawImage(b, 0, runSrcY, 256, 1, 0, runStartPy, size, runLen);
      }
      runLen = 0;
    };

    for (let py = 0; py < size; py++) {
      const lat = mercatorTilePixelToLat(z, y, py + 0.5, size);
      if (lat > 90 || lat < -90) {
        flushRun();
        continue;
      }
      const eqRowFloat = ((90 - lat) / 180) * trekRows;
      const eqRow = Math.max(0, Math.min(trekRows - 1, Math.floor(eqRowFloat)));
      const srcY = Math.max(0, Math.min(255, Math.floor((eqRowFloat - eqRow) * 256)));

      if (eqRow === runEqRow && srcY === runSrcY && runLen > 0) {
        runLen += 1;
      } else {
        flushRun();
        runEqRow = eqRow;
        runSrcY = srcY;
        runStartPy = py;
        runLen = 1;
      }
    }
    flushRun();

    const outMime =
      ext === 'jpg' &&
      layerId !== 'curiosity_hirise_mosaic' &&
      layerId !== 'Gale_CTX_BlockAdj_dd' &&
      layerId !== 'SIM3292_Global_Geology'
        ? 'image/jpeg'
        : 'image/png';

    const outBuf = await canvasToArrayBuffer(canvas, outMime, 0.88);
    if (outBuf.byteLength > 0) {
      setLru(reprojectedTileCache, MAX_REPROJECTED_CACHE, cacheKey, outBuf);
    }
    return { data: outBuf.slice(0) };
  });
}
