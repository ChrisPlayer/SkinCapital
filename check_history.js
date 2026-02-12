const db = require('./config/database');
const fs = require('fs');

async function checkHistory() {
    await db.init();

    // Get all history
    const history = db.all('SELECT * FROM history ORDER BY timestamp ASC');

    // Write to file
    fs.writeFileSync('history_check.json', JSON.stringify(history, null, 2));
    console.log(`Exported ${history.length} history records to history_check.json`);
}

checkHistory().catch(console.error);
