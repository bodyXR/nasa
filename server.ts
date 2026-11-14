import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import cors from 'cors';
import { createApiRouter } from './server/api.js';
import { getDb } from './server/db.js';

const PORT = Number(process.env.PORT ?? 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  getDb();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', createApiRouter());

  // MapLibre v6 resolves its worker script relative to `import.meta.url`, which neither
  // Vite's dependency optimizer (dev) nor the production bundle emits. Serve the exact
  // versioned worker file straight from node_modules so GeoJSON/vector sources work.
  const maplibreWorkerPath = resolve(
    process.cwd(),
    'node_modules',
    'maplibre-gl',
    'dist',
    'maplibre-gl-worker.mjs'
  );
  if (existsSync(maplibreWorkerPath)) {
    app.get('/vendor/maplibre-gl-worker.mjs', (_req, res) => {
      res.type('application/javascript');
      res.sendFile(maplibreWorkerPath);
    });
  }

  if (IS_PROD && existsSync(resolve(process.cwd(), 'dist', 'index.html'))) {
    const distDir = resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(resolve(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MARS//PATH server listening on http://0.0.0.0:${PORT} (mode=${IS_PROD ? 'prod' : 'dev'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MARS//PATH server:', err);
  process.exit(1);
});
