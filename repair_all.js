import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const migrationsDir = './supabase/migrations';
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

for (const file of files) {
    const version = file.split('_')[0];
    if (version < "20260311000000") {
        console.log(`Repairing ${version}...`);
        try {
            execSync(`npx supabase migration repair --status applied ${version}`);
        } catch (e) {
            console.log(`Failed to repair ${version}`);
        }
    }
}
