import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('📡 Connection Webhook received:', JSON.stringify(payload, null, 2));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract instance and event from payload
    // Evolution API sends: { event: 'connection.update', instance: 'name', data: {...} }
    const event = payload.event;
    const instanceName = payload.instance;
    const data = payload.data;

    if (!instanceName) {
      console.log('⚠️  No instance name in payload, ignoring');
      return new Response(
        JSON.stringify({ success: true, message: 'Ignored - no instance' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Check if this is a connection status update
    if (event === 'connection.update' || event === 'qr.updated' || event === 'connections.update') {
      const state = data?.state || data?.status;
      
      console.log(`📊 Instance ${instanceName} connection state: ${state}`);

      // Map Evolution API states to our internal status
      let newStatus = null;
      let connectedAt = null;

      switch (state) {
        case 'open':
        case 'connected':
          newStatus = 'CONNECTED';
          connectedAt = new Date().toISOString();
          break;
        case 'close':
        case 'disconnected':
          newStatus = 'DISCONNECTED';
          break;
        case 'connecting':
          newStatus = 'CONNECTING';
          break;
        default:
          console.log(`Unknown state: ${state}`);
      }

      if (newStatus) {
        // Update instance status in database
        const updateData: any = {
          status: newStatus,
          updated_at: new Date().toISOString()
        };

        if (connectedAt) {
          updateData.connected_at = connectedAt;
        }

        const { error: updateError } = await supabase
          .from('whatsapp_instances')
          .update(updateData)
          .eq('instance_name', instanceName);

        if (updateError) {
          console.error('❌ Error updating instance status:', updateError);
          throw updateError;
        }

        console.log(`✅ Instance ${instanceName} updated to ${newStatus}`);

        // If connected, trigger contact sync
        if (newStatus === 'CONNECTED') {
          console.log('🔄 Instance connected, triggering contact sync...');
          
          try {
            const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-whatsapp-contacts`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({ instance_name: instanceName })
            });

            if (syncResponse.ok) {
              console.log('✅ Contact sync triggered successfully');
            } else {
              console.warn('⚠️  Contact sync failed:', await syncResponse.text());
            }
          } catch (syncError) {
            console.warn('⚠️  Error triggering contact sync:', syncError);
            // Don't fail the webhook if sync fails
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook processed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('❌ Error in connection webhook:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
