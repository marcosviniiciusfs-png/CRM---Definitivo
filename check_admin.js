import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://uxttihjsxfowursjyult.supabase.co',
    'aeb370a264fd8a299efc30aede0159410a39f7293ec7aadc90e6f69165b08f19'
);

async function checkAdmin() {
    const { data, error } = await supabase
        .from('admin_credentials')
        .select('*');

    if (error) {
        console.error('Error fetching admin:', error);
        // Maybe table doesn't exist?
        return;
    }

    console.log('Admin users:', data);
}

checkAdmin();
