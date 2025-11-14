import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface DisconnectInstanceRequest {
  instanceId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Invalid authorization token');
    }

    // Parse request body
    const { instanceId } = await req.json() as DisconnectInstanceRequest;

    if (!instanceId) {
      throw new Error('Instance ID is required');
    }

    console.log('Disconnecting instance for user:', user.id, 'Instance ID:', instanceId);

    // Get instance from database
    const { data: instance, error: fetchError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instanceId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !instance) {
      throw new Error('Instance not found or unauthorized');
    }

    // Get Evolution API credentials
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error('Evolution API credentials not configured');
    }

    // Remove trailing slash and /manager from URL if present
    const baseUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '');

    console.log('Disconnecting from Evolution API:', baseUrl);
    console.log('Instance name:', instance.instance_name);

    // STEP 1: Logout from Evolution API
    try {
      console.log('🔓 Logging out instance:', instance.instance_name);
      const logoutResponse = await fetch(`${baseUrl}/instance/logout/${instance.instance_name}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
      });

      if (logoutResponse.ok) {
        console.log('✅ Instance logged out successfully');
      } else {
        console.warn('⚠️ Logout failed:', logoutResponse.status);
      }
    } catch (logoutError) {
      console.warn('⚠️ Error during logout:', logoutError);
      // Continue to delete even if logout fails
    }

    // STEP 2: Delete instance from Evolution API
    console.log('🗑️ Deleting instance from Evolution API:', instance.instance_name);
    const deleteResponse = await fetch(`${baseUrl}/instance/delete/${instance.instance_name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
    });

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error('Evolution API delete error:', errorText);
      throw new Error(`Evolution API delete error: ${deleteResponse.status} - ${errorText}`);
    }

    const evolutionData = await deleteResponse.json();
    console.log('✅ Evolution API delete response:', evolutionData);

    // STEP 3: Delete instance from database
    const { error: deleteError } = await supabase
      .from('whatsapp_instances')
      .delete()
      .eq('id', instanceId);

    if (deleteError) {
      console.error('Database delete error:', deleteError);
      throw new Error(`Database error: ${deleteError.message}`);
    }

    console.log('✅ Instance deleted successfully from database:', instanceId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Instance deleted successfully',
        evolutionData: evolutionData,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error('Error in disconnect-whatsapp-instance:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
