const express = require('express');
const router = express.Router();
const db = require('../config/database');
const inventoryService = require('../services/inventoryService');
const historyService = require('../services/historyService');
const priceService = require('../services/priceService');
const steamAuth = require('../services/steamAuth');

/**
 * GET / - Main dashboard
 */
router.get('/', (req, res) => {
    try {
        const items = db.getItems();

        // Build per-item data with prices
        const itemsWithPrices = [];
        let totalValue = 0;

        // Group items by market_hash_name
        const itemGroups = {};
        for (const item of items) {
            if (!itemGroups[item.market_hash_name]) {
                itemGroups[item.market_hash_name] = {
                    market_hash_name: item.market_hash_name,
                    quantity: 0,
                    items: [],
                    casket_ids: new Set()
                };
            }
            itemGroups[item.market_hash_name].quantity++;
            itemGroups[item.market_hash_name].items.push(item);
            if (item.casket_id) {
                itemGroups[item.market_hash_name].casket_ids.add(item.casket_id);
            }
        }

        for (const [name, data] of Object.entries(itemGroups)) {
            const prices = priceService.getCachedPrices(name);
            const rarity = priceService.getItemRarity(name);
            const floatVal = data.items[0]?.float_value;
            const wear = priceService.getWearLevel(floatVal);
            const itemTotal = (prices.average || 0) * data.quantity;
            totalValue += itemTotal;

            // Steam CDN image
            const imageUrl = `https://community.akamai.steamstatic.com/economy/image/class/730/${encodeURIComponent(name)}/200fx200f`;

            itemsWithPrices.push({
                market_hash_name: name,
                quantity: data.quantity,
                casket_ids: [...data.casket_ids],
                float_value: floatVal,
                wear,
                rarity,
                imageUrl,
                prices,
                total: itemTotal
            });
        }

        itemsWithPrices.sort((a, b) => b.total - a.total);

        // --- Storage Unit breakdown ---
        const casketIds = [...new Set(items.map(i => i.casket_id).filter(Boolean))];
        const storageUnits = [];

        for (const casketId of casketIds) {
            const casketItems = items.filter(i => i.casket_id === casketId);
            let casketTotal = 0;
            const casketDetails = [];

            // Group by name within this casket
            const casketGroups = {};
            for (const ci of casketItems) {
                if (!casketGroups[ci.market_hash_name]) {
                    casketGroups[ci.market_hash_name] = { quantity: 0, float_value: ci.float_value };
                }
                casketGroups[ci.market_hash_name].quantity++;
            }

            for (const [name, g] of Object.entries(casketGroups)) {
                const prices = priceService.getCachedPrices(name);
                const rarity = priceService.getItemRarity(name);
                const wear = priceService.getWearLevel(g.float_value);
                const lineTotal = (prices.average || 0) * g.quantity;
                casketTotal += lineTotal;

                casketDetails.push({
                    market_hash_name: name,
                    quantity: g.quantity,
                    float_value: g.float_value,
                    wear,
                    rarity,
                    price: prices.average,
                    total: lineTotal
                });
            }

            casketDetails.sort((a, b) => b.total - a.total);

            storageUnits.push({
                casket_id: casketId,
                short_id: casketId.toString().slice(-6),
                item_count: casketItems.length,
                unique_items: Object.keys(casketGroups).length,
                total_value: casketTotal,
                items: casketDetails
            });
        }

        storageUnits.sort((a, b) => b.total_value - a.total_value);

        // Main inventory (no casket_id)
        const mainItems = items.filter(i => !i.casket_id);
        let mainTotal = 0;
        const mainGroups = {};
        for (const mi of mainItems) {
            if (!mainGroups[mi.market_hash_name]) {
                mainGroups[mi.market_hash_name] = { quantity: 0, float_value: mi.float_value };
            }
            mainGroups[mi.market_hash_name].quantity++;
        }
        const mainDetails = [];
        for (const [name, g] of Object.entries(mainGroups)) {
            const prices = priceService.getCachedPrices(name);
            const rarity = priceService.getItemRarity(name);
            const wear = priceService.getWearLevel(g.float_value);
            const lineTotal = (prices.average || 0) * g.quantity;
            mainTotal += lineTotal;
            mainDetails.push({
                market_hash_name: name,
                quantity: g.quantity,
                float_value: g.float_value,
                wear,
                rarity,
                price: prices.average,
                total: lineTotal
            });
        }
        mainDetails.sort((a, b) => b.total - a.total);

        // History
        const days = parseInt(req.query.days) || 30;
        const historyData = historyService.getHistory(days);
        const change24h = historyService.get24hChange(totalValue);
        const priceAlerts = historyService.getPriceAlerts(5);

        // Pagination for global view
        const page = parseInt(req.query.page) || 1;
        const perPage = 50;
        const totalPages = Math.ceil(itemsWithPrices.length / perPage);
        const paginatedItems = itemsWithPrices.slice((page - 1) * perPage, page * perPage);

        // Active tab
        const tab = req.query.tab || 'overview';

        res.render('dashboard', {
            items: paginatedItems,
            allItems: itemsWithPrices,
            totalItems: items.length,
            uniqueItems: itemsWithPrices.length,
            totalValue,
            change24h,
            historyData,
            priceAlerts,
            storageUnits,
            mainInventory: { items: mainDetails, total: mainTotal, count: mainItems.length },
            lastRefresh: inventoryService.getLastRefresh(),
            isRefreshing: inventoryService.isRefreshInProgress(),
            status: steamAuth.getStatus(),
            pagination: { page, perPage, totalPages, total: itemsWithPrices.length },
            days,
            tab
        });
    } catch (err) {
        console.error('[Dashboard] Error:', err);
        res.render('dashboard', {
            error: err.message,
            items: [], allItems: [], totalItems: 0, uniqueItems: 0, totalValue: 0,
            change24h: { change: 0, percentage: 0, hasData: false },
            historyData: [], priceAlerts: [],
            storageUnits: [],
            mainInventory: { items: [], total: 0, count: 0 },
            lastRefresh: null, isRefreshing: false,
            status: steamAuth.getStatus(),
            pagination: { page: 1, perPage: 50, totalPages: 1, total: 0 },
            days: 30, tab: 'overview'
        });
    }
});

/**
 * POST /refresh
 */
router.post('/refresh', async (req, res) => {
    try {
        inventoryService.refresh().catch(err => console.error('[Dashboard] Refresh error:', err));
        res.redirect('/dashboard?refreshing=true');
    } catch (err) {
        res.redirect('/dashboard?error=' + encodeURIComponent(err.message));
    }
});

/**
 * GET /export
 */
router.get('/export', (req, res) => {
    try {
        const items = db.getItems();
        const headers = ['Item', 'Qty', 'Storage Unit', 'Float', 'Steam Price €', 'Total €'];
        const grouped = {};
        for (const item of items) {
            const key = `${item.market_hash_name}__${item.casket_id || 'main'}`;
            if (!grouped[key]) {
                grouped[key] = { name: item.market_hash_name, quantity: 0, casket_id: item.casket_id, float_value: item.float_value };
            }
            grouped[key].quantity++;
        }

        const rows = [headers.join(',')];
        for (const data of Object.values(grouped)) {
            const prices = priceService.getCachedPrices(data.name);
            const total = (prices.average || 0) * data.quantity;
            rows.push([
                `"${data.name.replace(/"/g, '""')}"`,
                data.quantity,
                data.casket_id || 'Main',
                data.float_value || '',
                prices.steam?.toFixed(2) || '',
                total.toFixed(2)
            ].join(','));
        }

        const csv = rows.join('\n');
        const filename = `cs2-inventory-${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (err) {
        res.status(500).send('Export failed: ' + err.message);
    }
});

/**
 * GET /api/status
 */
router.get('/api/status', (req, res) => {
    res.json({
        status: steamAuth.getStatus(),
        lastRefresh: inventoryService.getLastRefresh(),
        isRefreshing: inventoryService.isRefreshInProgress()
    });
});

module.exports = router;
