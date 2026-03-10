import { execSync } from 'child_process';
try {
    const output = execSync('npx supabase secrets list').toString();
    console.log(output);
} catch (e) {
    console.error(e.stdout ? e.stdout.toString() : e);
}
