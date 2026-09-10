import { startServer } from './app.js';

startServer().catch((err) => {
  console.error('[startup] FATAL:', err);
  process.exit(1);
});

