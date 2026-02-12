const db = require('./config/database');
const priceService = require('./services/priceService');
const fs = require('fs');

async function testSmartCache() {
    try {
        await db.init();

        console.log('--- Testing Smart Cache ---');

        const item = "P250 | Visions (Well-Worn)";
        console.log(`\nTesting valid cached item: "${item}"`);

        const p1 = await priceService.getPrices(item);
        console.log('Result 1:', p1);

        const item2 = "AK-47 | Safari Mesh (Battle-Scarred)";
        console.log(`\nTesting potentially new/stale item: "${item2}"`);

        const p2 = await priceService.getPrices(item2);
        console.log('Result 2:', p2);

    } catch (err) {
        fs.writeFileSync('test_error.log', err.toString() + '\n' + err.stack);
        console.error(err);
    }
}

testSmartCache();
