import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SetPresenceRequest {
  instance_name: string;
  presence: 'available' | 'unavailable';
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

    const { instance_name, presence } = await req.json() as SetPresenceRequest;
    
    if (!instance_name || !presence) {
      throw new Error('Missing instance_name or presence');
    }

    if (presence !== 'available' && presence !== 'unavailable') {
      throw new Error('Invalid presence value. Must be "available" or "unavailable"');
    }

    console.log(`👻 Setting presence for ${instance_name} to ${presence}`);

    // Get Evolution API credentials
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    let evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    // Validar e corrigir URL da Evolution API
    if (!evolutionApiUrl || !/^https?:\/\//.test(evolutionApiUrl)) {
      console.log('⚠️ EVOLUTION_API_URL inválida. Usando URL padrão.');
      evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
    }

    // FALLBACK: If env vars not available, try database config table
    if (!evolutionApiUrl || !evolutionApiKey) {
      console.log('⚠️ Evolution API credentials not in env vars, checking database...');
      
      const { data: config, error: configError } = await supabase
        .from('app_config')
        .select('config_key, config_value')
        .in('config_key', ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY'])
        .limit(2);

      if (configError) {
        console.error('❌ Error fetching config from database:', configError);
      } else if (config && config.length > 0) {
        config.forEach(item => {
          const value = item.config_value?.trim();
          if (value && value.length > 0) {
            if (item.config_key === 'EVOLUTION_API_URL') evolutionApiUrl = value;
            if (item.config_key === 'EVOLUTION_API_KEY') evolutionApiKey = value;
          }
        });
      }
    }

    // Final validation
    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error('Evolution API credentials not configured');
    }

    // Remove trailing slash and /manager from URL if present
    const baseUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '');

    // First check if the instance is connected
    const statusResponse = await fetch(`${baseUrl}/instance/connectionState/${instance_name}`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    if (!statusResponse.ok) {
      console.log(`⚠️ Instance ${instance_name} not found or error checking status`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Instance not found',
          skipped: true,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200, // Return 200 to not cause frontend errors
        },
      );
    }

    const statusData = await statusResponse.json();
    const connectionState = statusData?.instance?.state || statusData?.state;
    
    console.log(`📡 Instance ${instance_name} connection state: ${connectionState}`);

    // Only set presence if instance is connected
    if (connectionState !== 'open' && connectionState !== 'connected') {
      console.log(`⚠️ Instance ${instance_name} is not connected (state: ${connectionState}), skipping presence update`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Instance not connected',
          skipped: true,
          connectionState,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200, // Return 200 to not cause frontend errors
        },
      );
    }

    // Call Evolution API to set presence
    const presenceResponse = await fetch(`${baseUrl}/instance/setPresence/${instance_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({ presence }),
    });

    if (!presenceResponse.ok) {
      const errorText = await presenceResponse.text();
      console.error('❌ Evolution API error:', errorText);
      
      // Check if it's a connection closed error - handle gracefully
      if (errorText.includes('Connection Closed') || errorText.includes('connection')) {
        console.log(`⚠️ Connection closed for ${instance_name}, presence not set`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Connection closed',
            skipped: true,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200, // Return 200 to not cause frontend errors
          },
        );
      }
      
      throw new Error(`Evolution API error: ${presenceResponse.status} - ${errorText}`);
    }

    const result = await presenceResponse.json();
    console.log(`✅ Presence set to ${presence} for ${instance_name}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Presence set to ${presence}`,
        result,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error('Error in set-whatsapp-presence:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // Return 200 to prevent frontend crashes - presence is non-critical
      },
    );
  }
});
