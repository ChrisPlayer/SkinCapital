const db = require('./config/database');
const historyService = require('./services/historyService');
const priceService = require('./services/priceService');

async function test() {
    console.log("Initializing DB...");
    await db.init();

    // Test Item from screenshot
    const itemName = "Sticker | Master Guardian Elite";
    console.log(`\n--- Testing for: "${itemName}" ---`);

    try {
        const prices = priceService.getCachedPrices(itemName);
        console.log("Cached Prices:", JSON.stringify(prices, null, 2));

        const change = historyService.getItem24hChange(itemName, prices.average || 0);
        console.log("24h Change:", JSON.stringify(change, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }

    // Test a simple item
    const simpleItem = "AK-47 | Redline (Field-Tested)";
    console.log(`\n--- Testing for: "${simpleItem}" ---`);
    try {
        const prices = priceService.getCachedPrices(simpleItem);
        console.log("Cached Prices:", JSON.stringify(prices, null, 2));

        const change = historyService.getItem24hChange(simpleItem, prices.average || 0);
        console.log("24h Change:", JSON.stringify(change, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
