/*
 * Bundles the server into a single dist/server/server.cjs.
 * The packages in runtime-externals.json stay external and are loaded from a
 * node_modules directory next to the bundle at runtime: better-sqlite3 ships a
 * native .node binary, and the Steam stack (steam-user & friends) reads .pem
 * and protobuf files relative to __dirname, which a bundle would break.
 */
import { build } from 'esbuild';
import { readFileSync } from 'fs';

const externals = JSON.parse(
  readFileSync(new URL('./runtime-externals.json', import.meta.url), 'utf8'),
);
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

await build({
  define: { 'process.env.APP_VERSION': JSON.stringify(`v${version}`) },
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/server/server.cjs',
  external: externals,
  legalComments: 'none',
  logLevel: 'info',
});
