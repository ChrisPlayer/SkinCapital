/*
 * SkinCapital.exe entry point, embedded in the binary via Node SEA.
 * The exe is a plain console app: server logs stream into the window,
 * Ctrl+C (or closing it) stops the server. The server bundle and its few
 * disk-loaded dependencies live in app/ next to the exe.
 *
 * Layout next to the exe:
 *   app/server.cjs      server bundle (esbuild)
 *   app/node_modules/   runtime externals (better-sqlite3, steam stack)
 *   app/public/         built SPA
 *   data/               created on first run (DB, schema cache, secret)
 */
const path = require('node:path');
const { createRequire } = require('node:module');

const exeDir = path.dirname(process.execPath);
process.title = 'SkinCapital';

// Anchor everything next to the exe, whatever cwd Windows launched us with.
process.chdir(exeDir);

// Optional user overrides: load .env (if present) before applying defaults,
// so precedence is real env > .env > bootstrap defaults. The server's own
// dotenv pass later is then a no-op for these keys.
try {
  process.loadEnvFile(path.join(exeDir, '.env'));
} catch {
  // no .env next to the exe - defaults below apply
}

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.DATA_DIR = process.env.DATA_DIR || path.join(exeDir, 'data');
process.env.CLIENT_DIST = process.env.CLIENT_DIST || path.join(exeDir, 'app', 'public');
process.env.OPEN_BROWSER = process.env.OPEN_BROWSER || '1';

// SEA code can only require() builtins; load the on-disk bundle through a
// require anchored in app/ so its own external requires resolve from
// app/node_modules.
const requireFromApp = createRequire(path.join(exeDir, 'app', 'server.cjs'));
requireFromApp('./server.cjs');
