import { execSync } from 'child_process';
import fs from 'fs';
try {
    const output = execSync('npx supabase secrets list').toString();
    fs.writeFileSync('full_secrets.txt', output);
} catch (e) {
    fs.writeFileSync('full_secrets.txt', e.stdout ? e.stdout.toString() : e.toString());
}
