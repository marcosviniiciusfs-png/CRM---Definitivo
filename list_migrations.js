import { execSync } from 'child_process';
try {
    const output = execSync('npx supabase migration list').toString();
    console.log(output);
} catch (e) {
    console.error(e.stdout ? e.stdout.toString() : e);
}
