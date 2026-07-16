import { Router } from 'express';
import { getItemsByProfile, getAllItems } from '../../db/queries/items.ts';
import { getCachedPrices } from '../pricing/pricing.service.ts';
import { requireAuth } from '../auth/auth.middleware.ts';
import { isAllProfiles } from '../../../shared/constants/profiles.ts';

const router = Router();

router.get('/export/csv', requireAuth, (req, res) => {
  try {
    const steamId = req.query.steamId as string;
    if (!steamId) {
      return res.status(400).json({ error: 'steamId query parameter required' });
    }

    const ownerSteamId = req.session.steamId;
    if (!ownerSteamId) {
      return res.status(400).json({ error: 'No authenticated session' });
    }
    // 'all' is allowed for any authenticated session (LAN/personal tool).
    if (!isAllProfiles(steamId) && ownerSteamId !== steamId) {
      return res.status(403).json({ error: 'Forbidden: you can only export your own profile' });
    }

    const items = isAllProfiles(steamId) ? getAllItems() : getItemsByProfile(steamId);
    const headers = ['Item', 'Qty', 'Storage Unit', 'Float', 'Steam Price EUR', 'Total EUR'];

    const grouped: Record<string, {
      name: string;
      quantity: number;
      casketId: string | null;
      floatValue: number | null;
    }> = {};

    for (const item of items) {
      const key = `${item.marketHashName}__${item.casketId || 'main'}`;
      if (!grouped[key]) {
        grouped[key] = {
          name: item.marketHashName,
          quantity: 0,
          casketId: item.casketId,
          floatValue: item.floatValue,
        };
      }
      grouped[key].quantity++;
    }

    const rows = [headers.join(',')];
    for (const data of Object.values(grouped)) {
      const prices = getCachedPrices(data.name);
      const total = (prices.average || 0) * data.quantity;
      rows.push(
        [
          `"${data.name.replace(/"/g, '""')}"`,
          data.quantity,
          data.casketId || 'Main',
          data.floatValue || '',
          prices.steam?.toFixed(2) || '',
          total.toFixed(2),
        ].join(','),
      );
    }

    const csv = rows.join('\n');
    const filename = `skincapital-${steamId}-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch {
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
