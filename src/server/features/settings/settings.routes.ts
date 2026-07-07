import { Router } from 'express';
import {
  getPricingConfig,
  setPricingConfig,
  clearPricingConfig,
  getResolvedMode,
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
  getTrackedSources,
  setTrackedSources,
} from '../inventory/inventory.jobs.ts';
import {
  getLatestBackup,
  getLatestBackupPath,
  getBackupCount,
  isBackupRunning,
} from '../backup/backup.service.ts';
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

// ── Tracked price sources (daily reload + comparator gating) ──

router.get('/settings/sources', (_req, res) => {
  res.json({ sources: getTrackedSources() });
});

const sourcesSchema = z.object({
  sources: z.array(z.enum(['steam', 'csfloat', 'skinport'])).max(3),
});

router.post('/settings/sources', (req, res) => {
  const parsed = sourcesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'sources (array of steam|csfloat|skinport) required' });
  }
  res.json({ ok: true, sources: setTrackedSources(parsed.data.sources) });
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

// Run a backup now. ran:false when one was already in progress (guarded).
router.post('/settings/backup/run', (_req, res) => {
  if (isBackupRunning()) {
    return res.json({ ok: true, ran: false });
  }
  const ran = runDailyBackup();
  res.json({ ok: true, ran });
});

// Stream the newest backup as an attachment. The path comes only from the
// service's own enumeration of data/backups (no traversal possible).
router.get('/settings/backup/download', (_req, res) => {
  const filePath = getLatestBackupPath();
  if (!filePath) {
    return res.status(404).json({ error: 'No backup available' });
  }
  const downloadName = `cs2-backup-${new Date().toISOString().split('T')[0]}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.sendFile(path.resolve(filePath), (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to download backup' });
    }
  });
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
