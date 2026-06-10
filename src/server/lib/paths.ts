import path from 'path';

/*
 * Filesystem anchors, overridable by the platform shells:
 * the portable Windows exe and the Docker image relocate them via env,
 * dev and `npm start` keep the repo-relative defaults.
 */

/** Writable state: SQLite DB, schema cache. */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

/** Built SPA served in production. */
export const CLIENT_DIST = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.join(process.cwd(), 'dist', 'client');
