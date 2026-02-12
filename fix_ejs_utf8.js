const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'views', 'dashboard.ejs');
const pattern = /<%\s+-/g;
const replacement = '<%-';

try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.match(pattern)) {
        console.log('Found problematic pattern "<% -". Replacing...');
        const newContent = content.replace(pattern, replacement);
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log('Replacement successful. File saved with UTF-8 encoding.');
    } else {
        console.log('Pattern not found. File is already clean.');
    }
} catch (err) {
    console.error('Error:', err);
    process.exit(1);
}
