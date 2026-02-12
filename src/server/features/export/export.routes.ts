import { Router } from 'express';
import { getAllItems } from '../../db/queries/items.ts';
import { getCachedPrices } from '../pricing/pricing.service.ts';
import { requireAuth } from '../auth/auth.middleware.ts';

const router = Router();

router.get('/export/csv', requireAuth, (_req, res) => {
  try {
    const items = getAllItems();
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
    const filename = `cs2-inventory-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch {
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
