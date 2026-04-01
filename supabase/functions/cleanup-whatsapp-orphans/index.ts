import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CleanupResult {
  deletedFromApi: string[];
  deletedFromDb: string[];
  duplicatesRemoved: string[];
  errors: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const result: CleanupResult = {
    deletedFromApi: [],
    deletedFromDb: [],
    duplicatesRemoved: [],
    errors: [],
  };

  try {
    console.log('🧹 Starting WhatsApp orphan cleanup...');

    // Optional: Verify authorization for manual triggers
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');

    // If called manually (not by cron), verify auth
    if (authHeader) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        // Check if it's a cron secret
        if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
          console.log('✅ Authorized via CRON_SECRET');
        } else {
          throw new Error('Unauthorized');
        }
      }
    } else if (cronSecret) {
      // No auth header but cron secret exists - require auth
      throw new Error('Authorization required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Evolution API credentials
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !/^https?:\/\//.test(evolutionApiUrl)) {
      evolutionApiUrl = 'http://161.97.148.99:8080';
    }

    if (!evolutionApiKey) {
      throw new Error('Evolution API credentials not configured');
    }

    const baseUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '');

    // ========================================
    // STEP 1: Fetch all instances from Evolution API
    // ========================================
    console.log('📡 Fetching instances from Evolution API...');
    const fetchResponse = await fetch(`${baseUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    if (!fetchResponse.ok) {
      throw new Error(`Failed to fetch instances from Evolution API: ${fetchResponse.status}`);
    }

    const apiInstances = await fetchResponse.json();
    const apiInstanceNames = new Set(
      Array.isArray(apiInstances)
        ? apiInstances.map((inst: any) => inst.instance?.instanceName).filter(Boolean)
        : []
    );

    console.log(`📋 Found ${apiInstanceNames.size} instances in Evolution API`);

    // ========================================
    // STEP 2: Fetch all instances from database
    // ========================================
    console.log('📡 Fetching instances from database...');
    const { data: dbInstances, error: dbError } = await supabase
      .from('whatsapp_instances')
      .select('*');

    if (dbError) {
      throw dbError;
    }

    console.log(`📋 Found ${dbInstances?.length || 0} instances in database`);

    // ========================================
    // STEP 3: Find and delete orphans in Evolution API (not in DB)
    // ========================================
    console.log('🔍 Finding orphans in Evolution API...');
    const crmInstanceNames = new Set(dbInstances?.map(inst => inst.instance_name) || []);

    for (const apiInstanceName of apiInstanceNames) {
      // Only cleanup CRM-related instances (start with crm-)
      if (!apiInstanceName.startsWith('crm-')) {
        continue;
      }

      if (!crmInstanceNames.has(apiInstanceName)) {
        console.log(`🗑️ Deleting orphan from Evolution API: ${apiInstanceName}`);
        try {
          // Logout first
          await fetch(`${baseUrl}/instance/logout/${apiInstanceName}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey },
          });

          // Delete
          const deleteResponse = await fetch(`${baseUrl}/instance/delete/${apiInstanceName}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey },
          });

          if (deleteResponse.ok || deleteResponse.status === 404) {
            result.deletedFromApi.push(apiInstanceName);
            console.log(`✅ Deleted orphan: ${apiInstanceName}`);
          } else {
            result.errors.push(`Failed to delete ${apiInstanceName}: ${deleteResponse.status}`);
          }
        } catch (e) {
          result.errors.push(`Error deleting ${apiInstanceName}: ${e}`);
        }
      }
    }

    // ========================================
    // STEP 4: Find and delete disconnected instances (>24h old)
    // ========================================
    console.log('🔍 Finding disconnected instances...');
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const disconnectedInstances = dbInstances?.filter(
      inst => inst.status === 'DISCONNECTED' && inst.updated_at < twentyFourHoursAgo
    ) || [];

    for (const inst of disconnectedInstances) {
      console.log(`🗑️ Deleting disconnected instance: ${inst.instance_name}`);
      try {
        // Delete from Evolution API if exists
        if (apiInstanceNames.has(inst.instance_name)) {
          await fetch(`${baseUrl}/instance/logout/${inst.instance_name}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey },
          });

          await fetch(`${baseUrl}/instance/delete/${inst.instance_name}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey },
          });
        }

        // Delete from database
        const { error: deleteError } = await supabase
          .from('whatsapp_instances')
          .delete()
          .eq('id', inst.id);

        if (deleteError) {
          result.errors.push(`Failed to delete ${inst.instance_name} from DB: ${deleteError.message}`);
        } else {
          result.deletedFromDb.push(inst.instance_name);
          console.log(`✅ Deleted disconnected: ${inst.instance_name}`);
        }
      } catch (e) {
        result.errors.push(`Error deleting ${inst.instance_name}: ${e}`);
      }
    }

    // ========================================
    // STEP 5: Find and remove duplicates (same user, keep most recent)
    // ========================================
    console.log('🔍 Finding duplicate instances...');
    const instancesByUser = new Map<string, typeof dbInstances>();

    for (const inst of dbInstances || []) {
      const userId = inst.user_id;
      if (!instancesByUser.has(userId)) {
        instancesByUser.set(userId, []);
      }
      instancesByUser.get(userId)!.push(inst);
    }

    for (const [userId, instances] of instancesByUser) {
      // Only process if user has multiple instances
      if (instances.length <= 1) continue;

      // Sort by created_at descending (most recent first)
      instances.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Keep the most recent, delete the rest (only if status is not CONNECTED)
      const toDelete = instances.slice(1).filter(inst => inst.status !== 'CONNECTED');

      for (const inst of toDelete) {
        console.log(`🗑️ Deleting duplicate: ${inst.instance_name}`);
        try {
          // Delete from Evolution API if exists
          if (apiInstanceNames.has(inst.instance_name)) {
            await fetch(`${baseUrl}/instance/logout/${inst.instance_name}`, {
              method: 'DELETE',
              headers: { 'apikey': evolutionApiKey },
            });

            await fetch(`${baseUrl}/instance/delete/${inst.instance_name}`, {
              method: 'DELETE',
              headers: { 'apikey': evolutionApiKey },
            });
          }

          // Delete from database
          const { error: deleteError } = await supabase
            .from('whatsapp_instances')
            .delete()
            .eq('id', inst.id);

          if (deleteError) {
            result.errors.push(`Failed to delete duplicate ${inst.instance_name}: ${deleteError.message}`);
          } else {
            result.duplicatesRemoved.push(inst.instance_name);
            console.log(`✅ Deleted duplicate: ${inst.instance_name}`);
          }
        } catch (e) {
          result.errors.push(`Error deleting duplicate ${inst.instance_name}: ${e}`);
        }
      }
    }

    // ========================================
    // Summary
    // ========================================
    console.log('🧹 Cleanup complete!');
    console.log(`  - Deleted from API: ${result.deletedFromApi.length}`);
    console.log(`  - Deleted from DB: ${result.deletedFromDb.length}`);
    console.log(`  - Duplicates removed: ${result.duplicatesRemoved.length}`);
    console.log(`  - Errors: ${result.errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cleanup completed',
        result: {
          deletedFromApi: result.deletedFromApi.length,
          deletedFromDb: result.deletedFromDb.length,
          duplicatesRemoved: result.duplicatesRemoved.length,
          errors: result.errors.length,
          details: result,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('❌ Cleanup error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        result,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
