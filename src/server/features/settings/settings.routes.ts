import { Router } from 'express';
import {
  getPricingConfig,
  setPricingConfig,
  clearPricingConfig,
  getResolvedMode,
  reloadPricingConfig,
  type PricingMode,
} from '../pricing/pricing.config.ts';
import { testProxy } from '../pricing/steam.proxy-pool.ts';
import {
  getPriceRefreshSchedule,
  setPriceRefreshSchedule,
  runDailyPriceRefresh,
  isBackupEnabled,
  setBackupEnabled,
  runDailyBackup,
  applyPriceRefreshSchedule,
  isDailyRefreshRunning,
} from '../inventory/inventory.jobs.ts';
import {
  getLatestBackup,
  getLatestBackupPath,
  getBackupPathByName,
  getBackupCount,
  listBackups,
  restoreBackup,
} from '../backup/backup.service.ts';
import {
  isRefreshInProgress,
  isPriceRefreshInProgress,
  clearAllRuntimeState,
} from '../inventory/inventory.service.ts';
import { logger } from '../../lib/logger.ts';
import path from 'path';
import { z } from 'zod';

const router = Router();

// ── Daily automatic price reload (prices only — no Steam login involved) ──

router.get('/settings/schedule', (_req, res) => {
  res.json(getPriceRefreshSchedule());
});

const scheduleSchema = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

router.post('/settings/schedule', (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'enabled (bool), hour (0-23) and minute (0-59) required' });
  }
  const saved = setPriceRefreshSchedule(parsed.data);
  res.json({ ok: true, ...saved });
});

// Manual trigger of the same daily job ("run now"). started:false when a run
// was already in progress (the job itself continues in the background).
router.post('/settings/schedule/run', (_req, res) => {
  const started = runDailyPriceRefresh();
  res.status(202).json({ ok: true, started });
});

// ── Automatic backup (anti data-loss) ──
// Same auth posture as the rest of settings: read is public, writes are CSRF +
// rate-limited (no Steam login). The download serves ONLY the newest file from
// data/backups that the backup service itself enumerated — no user path input.

router.get('/settings/backup', (_req, res) => {
  res.json({
    enabled: isBackupEnabled(),
    lastBackup: getLatestBackup(),
    count: getBackupCount(),
  });
});

const backupSchema = z.object({ enabled: z.boolean() });

router.post('/settings/backup', (req, res) => {
  const parsed = backupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'enabled (bool) required' });
  }
  const enabled = setBackupEnabled(parsed.data.enabled);
  res.json({ ok: true, enabled });
});

// Run a backup now. ran:false = one was already in progress (guarded);
// a real write failure (disk full…) is a 500 so the UI can tell them apart.
router.post('/settings/backup/run', (_req, res) => {
  const result = runDailyBackup();
  if (result === 'failed') {
    return res.status(500).json({ error: 'Backup failed — check server logs' });
  }
  res.json({ ok: true, ran: result === 'ok' });
});

// All retained backups (newest first) for the settings page list.
router.get('/settings/backup/list', (_req, res) => {
  res.json(listBackups());
});

// Stream a backup as an attachment. Default: the newest one. With ?file=, the
// name is validated against the service's own enumeration of data/backups
// (strict membership — no traversal possible either way).
router.get('/settings/backup/download', (req, res) => {
  const requested = typeof req.query.file === 'string' ? req.query.file : null;
  const filePath = requested ? getBackupPathByName(requested) : getLatestBackupPath();
  if (!filePath) {
    return res.status(404).json({ error: 'No backup available' });
  }
  // The stored name carries the backup's own timestamp — more truthful than
  // "today" when the newest file is older than today.
  const downloadName = requested ?? path.basename(filePath);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.sendFile(path.resolve(filePath), (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to download backup' });
    }
  });
});

// Restore one retained backup (file name validated against the service's own
// enumeration). Refused while any refresh runs — a live task would write rows
// for state that no longer exists. The service snapshots the current state
// first, so a restore is reversible.
const restoreSchema = z.object({ file: z.string().min(1).max(200) });

router.post('/settings/backup/restore', (req, res) => {
  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'file (string) required' });
  }
  if (isRefreshInProgress() || isPriceRefreshInProgress() || isDailyRefreshRunning()) {
    return res.status(409).json({ error: 'A refresh is in progress — retry once it finishes' });
  }
  try {
    const result = restoreBackup(parsed.data.file);
    // The restored settings table may carry a different schedule / pricing
    // config than what is cached in memory — re-read and re-arm both.
    // reloadPricingConfig notifies the proxy pool WITHOUT re-persisting: if
    // the restored proxies can't be decrypted (SESSION_SECRET changed), a
    // re-persist would silently overwrite the restored row with the env
    // fallback. The row stays restorable once the right secret is back.
    clearAllRuntimeState();
    const decryptOk = reloadPricingConfig();
    if (!decryptOk) {
      logger.warn('[Backup] Restored proxies undecryptable with the current SESSION_SECRET — kept the restored row, using .env proxies in memory.');
    }
    applyPriceRefreshSchedule();
    logger.info(`[Backup] Restore of ${result.file} applied`);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// NOTE: writes are NOT behind Steam login — consistent with this LAN/personal
// tool (reads are public, minimal friction). They ARE protected by the CSRF
// Origin guard + rate limiter, the GET never returns credentials (masked), and
// proxies are encrypted at rest. If you ever expose this beyond your LAN, add
// real auth here.

/** Strip credentials from a proxy entry → "host:port" for safe display. */
function maskProxy(raw: string): string {
  try {
    if (/^[a-z]+:\/\//i.test(raw) || raw.includes('@')) {
      const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`);
      return `${u.hostname}:${u.port}`;
    }
    const parts = raw.split(':');
    if (parts.length === 4) return `${parts[0]}:${parts[1]}`; // host:port:user:pass
    return raw; // host:port
  } catch {
    return 'proxy';
  }
}

// GET is public (read routes are public on LAN) but NEVER returns credentials —
// only masked "host:port" for display.
router.get('/settings/pricing', (_req, res) => {
  const cfg = getPricingConfig();
  res.json({
    mode: cfg.mode,
    resolvedMode: getResolvedMode(),
    proxiesMasked: cfg.proxies.map(maskProxy),
    proxyCount: cfg.proxies.length,
  });
});

// Deliberately auth-less like every write here (see the NOTE above) — still
// behind the CSRF Origin guard + rate limiter mounted in app.ts.
router.post('/settings/pricing', (req, res) => {
  const body = (req.body || {}) as { mode?: string; proxies?: unknown };

  if (body.mode !== undefined && !['auto', 'proxy', 'direct'].includes(body.mode)) {
    return res.status(400).json({ error: 'Invalid mode (auto|proxy|direct)' });
  }

  // proxies set ONLY when a non-empty string is provided; otherwise keep current.
  let proxies: string[] | undefined;
  if (typeof body.proxies === 'string' && body.proxies.trim()) {
    proxies = body.proxies.split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
  } else if (Array.isArray(body.proxies)) {
    proxies = body.proxies.map((p) => String(p).trim()).filter(Boolean);
  }

  const updated = setPricingConfig({ mode: body.mode as PricingMode | undefined, proxies });
  res.json({
    ok: true,
    mode: updated.mode,
    resolvedMode: getResolvedMode(),
    proxyCount: updated.proxies.length,
  });
});

// Reset to .env defaults (forget the DB override).
router.delete('/settings/pricing', (_req, res) => {
  const reset = clearPricingConfig();
  res.json({ ok: true, mode: reset.mode, resolvedMode: getResolvedMode(), proxyCount: reset.proxies.length });
});

// Test a proxy entry (returns the exit IP) before saving it.
router.post('/settings/pricing/test', async (req, res) => {
  const proxy = (req.body as { proxy?: string })?.proxy;
  if (!proxy || typeof proxy !== 'string') {
    return res.status(400).json({ ok: false, error: 'proxy required' });
  }
  const result = await testProxy(proxy);
  res.json(result);
});

export default router;
