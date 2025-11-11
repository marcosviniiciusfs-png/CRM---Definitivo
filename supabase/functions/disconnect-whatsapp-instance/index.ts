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

    // Disconnect/logout instance from Evolution API
    const evolutionResponse = await fetch(`${baseUrl}/instance/logout/${instance.instance_name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error('Evolution API error:', errorText);
      throw new Error(`Evolution API error: ${evolutionResponse.status} - ${errorText}`);
    }

    const evolutionData = await evolutionResponse.json();
    console.log('Evolution API logout response:', evolutionData);

    // Update instance status in database
    const { error: updateError } = await supabase
      .from('whatsapp_instances')
      .update({
        status: 'DISCONNECTED',
        qr_code: null,
        phone_number: null,
        connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', instanceId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Database error: ${updateError.message}`);
    }

    console.log('Instance disconnected successfully:', instanceId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Instance disconnected successfully',
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
