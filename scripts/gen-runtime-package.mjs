/*
 * Writes a minimal package.json containing only the runtime externals (see
 * runtime-externals.json), pinned to the versions resolved in
 * package-lock.json. Used by the Windows packaging script and the Dockerfile
 * to install the few packages the server bundle loads from disk.
 *
 * Usage: node scripts/gen-runtime-package.mjs <outDir>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: node scripts/gen-runtime-package.mjs <outDir>');
  process.exit(1);
}

const here = new URL('.', import.meta.url);
const externals = JSON.parse(readFileSync(new URL('runtime-externals.json', here), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', here), 'utf8'));

const dependencies = {};
for (const name of externals) {
  const entry = lock.packages[`node_modules/${name}`];
  if (!entry) {
    console.error(`${name} not found in package-lock.json`);
    process.exit(1);
  }
  dependencies[name] = entry.version;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify({ name: 'skincapital-runtime', private: true, dependencies }, null, 2) + '\n',
);
console.log(`runtime package.json written to ${outDir}:`, dependencies);
