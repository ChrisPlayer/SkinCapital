const db = require('./config/database');
const priceService = require('./services/priceService');
const fs = require('fs');

async function debugPricing() {
    await db.init();

    // Simulate what dashboard.js does
    const items = db.getItems();
    let debugInfo = `[DEBUG] Total items in DB: ${items.length}\n`;

    if (items.length === 0) {
        debugInfo += '[DEBUG] No items found!\n';
        fs.writeFileSync('debug_pricing_output.txt', debugInfo);
        return;
    }

    const itemGroups = {};
    for (const item of items) {
        if (!itemGroups[item.market_hash_name]) {
            itemGroups[item.market_hash_name] = {
                market_hash_name: item.market_hash_name,
                quantity: 0,
                items: []
            };
        }
        itemGroups[item.market_hash_name].quantity++;
        itemGroups[item.market_hash_name].items.push(item);
    }

    let totalValue = 0;
    let itemsWithZeroValue = 0;
    const zeroValueItems = [];

    for (const [name, data] of Object.entries(itemGroups)) {
        const prices = priceService.getCachedPrices(name);

        let itemTotal = (prices.average || 0) * data.quantity;

        if (!prices.average || prices.average === 0) {
            itemsWithZeroValue++;
            if (zeroValueItems.length < 20) {
                zeroValueItems.push(name);
            }
        }

        let stickerValue = 0;
        // Simplified sticker logic from dashboard.js
        for (const item of data.items) {
            let stickers = [];
            try {
                if (item.stickers && typeof item.stickers === 'string') {
                    stickers = JSON.parse(item.stickers);
                } else if (Array.isArray(item.stickers)) {
                    stickers = item.stickers;
                }
            } catch (e) { }

            if (stickers.length > 0) {
                for (const s of stickers) {
                    const sp = priceService.getCachedPrices(s.name);
                    stickerValue += (sp.average || 0);
                }
            }
        }
        itemTotal += stickerValue;
        totalValue += itemTotal;
    }

    debugInfo += `\n--- Summary ---\n`;
    debugInfo += `Calculated Total Value: €${totalValue.toFixed(2)}\n`;
    debugInfo += `Groups with €0 value: ${itemsWithZeroValue}\n`;
    debugInfo += `Sample of €0 items:\n${zeroValueItems.join('\n')}\n`;

    // Let's check specifically for a known item "P250 | Visions (Well-Worn)"
    const p250 = db.getLatestPrice("P250 | Visions (Well-Worn)");
    debugInfo += `\nDirect Check "P250 | Visions (Well-Worn)": ${JSON.stringify(p250)}\n`;

    fs.writeFileSync('debug_pricing_output.txt', debugInfo);
    console.log('Dump written to debug_pricing_output.txt');
}

debugPricing().catch(console.error);
