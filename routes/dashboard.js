const express = require('express');
const router = express.Router();
const db = require('../config/database');
const inventoryService = require('../services/inventoryService');
const historyService = require('../services/historyService');
const priceService = require('../services/priceService');
const steamAuth = require('../services/steamAuth');

/**
 * GET / - Main dashboard (mounted at /dashboard)
 */
router.get('/', (req, res) => {
    try {
        // Get all items from database
        const items = db.getItems();

        // Get latest prices and calculate totals
        const itemsWithPrices = [];
        let totalValue = 0;

        // Group items by market_hash_name for quantity
        const itemQuantities = {};
        for (const item of items) {
            if (!itemQuantities[item.market_hash_name]) {
                itemQuantities[item.market_hash_name] = {
                    ...item,
                    quantity: 0,
                    items: []
                };
            }
            itemQuantities[item.market_hash_name].quantity++;
            itemQuantities[item.market_hash_name].items.push(item);
        }

        // Add prices to each unique item
        for (const [name, data] of Object.entries(itemQuantities)) {
            const prices = priceService.getCachedPrices(name);
            const itemTotal = (prices.average || 0) * data.quantity;
            totalValue += itemTotal;

            itemsWithPrices.push({
                market_hash_name: name,
                quantity: data.quantity,
                casket_ids: [...new Set(data.items.map(i => i.casket_id).filter(Boolean))],
                float_value: data.items[0]?.float_value,
                prices,
                total: itemTotal
            });
        }

        // Sort by total value descending
        itemsWithPrices.sort((a, b) => b.total - a.total);

        // Get history for chart
        const days = parseInt(req.query.days) || 30;
        const historyData = historyService.getHistory(days);

        // Get 24h change
        const change24h = historyService.get24hChange(totalValue);

        // Get price alerts
        const priceAlerts = historyService.getPriceAlerts(5);

        // Get unique casket IDs for filter
        const casketIds = [...new Set(items.map(i => i.casket_id).filter(Boolean))];

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const perPage = 50;
        const totalPages = Math.ceil(itemsWithPrices.length / perPage);
        const paginatedItems = itemsWithPrices.slice((page - 1) * perPage, page * perPage);

        res.render('dashboard', {
            items: paginatedItems,
            allItems: itemsWithPrices,
            totalItems: items.length,
            uniqueItems: itemsWithPrices.length,
            totalValue,
            change24h,
            historyData,
            priceAlerts,
            casketIds,
            lastRefresh: inventoryService.getLastRefresh(),
            isRefreshing: inventoryService.isRefreshInProgress(),
            status: steamAuth.getStatus(),
            pagination: {
                page,
                perPage,
                totalPages,
                total: itemsWithPrices.length
            },
            days
        });
    } catch (err) {
        console.error('[Dashboard] Error:', err);
        res.render('dashboard', {
            error: err.message,
            items: [],
            allItems: [],
            totalItems: 0,
            uniqueItems: 0,
            totalValue: 0,
            change24h: { change: 0, percentage: 0, hasData: false },
            historyData: [],
            priceAlerts: [],
            casketIds: [],
            lastRefresh: null,
            isRefreshing: false,
            status: steamAuth.getStatus(),
            pagination: { page: 1, perPage: 50, totalPages: 1, total: 0 },
            days: 30
        });
    }
});

/**
 * POST /refresh - Manual refresh trigger
 */
router.post('/refresh', async (req, res) => {
    try {
        // Start refresh in background
        inventoryService.refresh().catch(err => {
            console.error('[Dashboard] Refresh error:', err);
        });

        // Redirect immediately (refresh runs in background)
        res.redirect('/dashboard?refreshing=true');
    } catch (err) {
        console.error('[Dashboard] Refresh trigger error:', err);
        res.redirect('/dashboard?error=' + encodeURIComponent(err.message));
    }
});

/**
 * GET /export - Export inventory as CSV
 */
router.get('/export', (req, res) => {
    try {
        const items = db.getItems();

        // Build CSV
        const headers = ['Market Hash Name', 'Quantity', 'Casket ID', 'Float Value', 'Steam Price', 'Average Price', 'Total Value'];

        // Group items
        const grouped = {};
        for (const item of items) {
            if (!grouped[item.market_hash_name]) {
                grouped[item.market_hash_name] = { quantity: 0, casket_ids: [], float_value: item.float_value };
            }
            grouped[item.market_hash_name].quantity++;
            if (item.casket_id) {
                grouped[item.market_hash_name].casket_ids.push(item.casket_id);
            }
        }

        const rows = [headers.join(',')];

        for (const [name, data] of Object.entries(grouped)) {
            const prices = priceService.getCachedPrices(name);
            const total = (prices.average || 0) * data.quantity;

            rows.push([
                `"${name.replace(/"/g, '""')}"`,
                data.quantity,
                `"${[...new Set(data.casket_ids)].join(', ')}"`,
                data.float_value || '',
                prices.steam?.toFixed(2) || '',
                prices.average?.toFixed(2) || '',
                total.toFixed(2)
            ].join(','));
        }

        const csv = rows.join('\n');
        const filename = `cs2-inventory-${new Date().toISOString().split('T')[0]}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (err) {
        console.error('[Export] Error:', err);
        res.status(500).send('Export failed: ' + err.message);
    }
});

/**
 * GET /api/status - Get current status (for AJAX)
 */
router.get('/api/status', (req, res) => {
    res.json({
        status: steamAuth.getStatus(),
        lastRefresh: inventoryService.getLastRefresh(),
        isRefreshing: inventoryService.isRefreshInProgress()
    });
});

module.exports = router;
