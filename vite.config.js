// Vite config: relative base (dist/ works from any folder) and the leaderboard API in dev,
// backed by the same module as serve.mjs so dev and release store scores the same way.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi, defaultFile } from './server/leaderboard.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export default {
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [{
    name: 'leaderboard-api',
    configureServer(server) {
      server.middlewares.use('/api/leaderboard', (req, res) => handleApi(process.env.DDL_LEADERBOARD || defaultFile(ROOT), req, res));
    },
  }],
};
