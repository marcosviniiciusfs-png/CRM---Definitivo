const fs = require('fs');
const { execSync } = require('child_process');

try {
    const data = fs.readFileSync('_db_pull_out.txt', 'utf16le');
    // Alternatively utf8 depending on how PS wrote it. If it fails we catch it
    const lines = data.split('\n');
    const repairs = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('supabase migration repair')) {
            // the flag is on the next line
            const flagLine = (lines[i + 1] || '').trim();
            // the id is on the next-next line
            const idLine = (lines[i + 2] || '').trim().replace(/[a-zA-Z\s'.]+$/, '').trim(); // Remove trailing garbage

            const matchStatus = flagLine.match(/--status\s+(reverted|applied)/);
            const matchId = idLine.match(/^\d{14}/);

            if (matchStatus && matchId) {
                repairs.push(`npx supabase migration repair ${matchStatus[0]} ${matchId[0]}`);
            }
        }
    }

    const uniqueRepairs = [...new Set(repairs)];
    console.log(`Found ${uniqueRepairs.length} unique repair commands`);

    for (const cmd of uniqueRepairs) {
        console.log(`Running: ${cmd}`);
        execSync(cmd, { stdio: 'inherit' });
    }
} catch (e) {
    console.error("Error with utf16le parsing, trying utf8");
    const data2 = fs.readFileSync('_db_pull_out.txt', 'utf8');
    const lines = data2.split('\n');
    const repairs = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('supabase migration repair')) {
            // the flag is on the next line
            const flagLine = (lines[i + 1] || '').trim();
            // the id is on the next-next line
            const idLine = (lines[i + 2] || '').trim().replace(/[a-zA-Z\s'.]+$/, '').trim();

            const matchStatus = flagLine.match(/--status\s+(reverted|applied)/);
            const matchId = idLine.match(/^\d{14}/);

            if (matchStatus && matchId) {
                repairs.push(`npx supabase migration repair ${matchStatus[0]} ${matchId[0]}`);
            }
        }
    }

    const uniqueRepairs = [...new Set(repairs)];
    console.log(`Found ${uniqueRepairs.length} unique repair commands (utf8)`);

    for (const cmd of uniqueRepairs) {
        console.log(`Running: ${cmd}`);
        execSync(cmd, { stdio: 'inherit' });
    }
}
