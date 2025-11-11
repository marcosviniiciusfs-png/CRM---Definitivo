import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    
    console.log('QR/Connection webhook received:', JSON.stringify(payload, null, 2));

    // Extract event type and data from Evolution API webhook
    const event = payload.event;
    const instance = payload.instance;
    const data = payload.data;

    if (!event || !instance) {
      console.log('Invalid payload structure');
      return new Response(
        JSON.stringify({ success: true, message: 'Ignored - invalid payload' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Handle QR Code update events
    if (event === 'qrcode.updated' || event === 'QRCODE_UPDATED') {
      const qrCode = data?.qrcode || data?.qr;
      
      if (!qrCode) {
        console.log('No QR code found in payload');
        return new Response(
          JSON.stringify({ success: true, message: 'Ignored - no QR code' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      console.log(`Updating QR code for instance: ${instance}`);

      // Update QR code in database
      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update({ 
          qr_code: qrCode,
          status: 'WAITING_QR'
        })
        .eq('instance_name', instance);

      if (updateError) {
        console.error('Error updating QR code:', updateError);
        throw updateError;
      }

      console.log(`QR code updated successfully for instance: ${instance}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'QR code updated successfully',
          instance
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Handle connection status update events
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state = data?.state || data?.status;
      
      if (!state) {
        console.log('No state found in payload');
        return new Response(
          JSON.stringify({ success: true, message: 'Ignored - no state' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Map Evolution API status to internal status
      let internalStatus = null;
      let phoneNumber = null;
      let connectedAt = null;

      switch (state.toLowerCase()) {
        case 'open':
        case 'connected':
          internalStatus = 'CONNECTED';
          phoneNumber = data?.phoneNumber || data?.number || null;
          connectedAt = new Date().toISOString();
          break;
        case 'close':
        case 'disconnected':
          internalStatus = 'DISCONNECTED';
          break;
        case 'connecting':
          internalStatus = 'CONNECTING';
          break;
        default:
          console.log(`Unknown connection state: ${state}`);
          internalStatus = 'UNKNOWN';
      }

      console.log(`Updating connection status for instance ${instance} to ${internalStatus}`);

      // Build update object
      const updateData: any = { status: internalStatus };
      
      if (phoneNumber) {
        updateData.phone_number = phoneNumber;
      }
      
      if (connectedAt) {
        updateData.connected_at = connectedAt;
      }

      // Update connection status in database
      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update(updateData)
        .eq('instance_name', instance);

      if (updateError) {
        console.error('Error updating connection status:', updateError);
        throw updateError;
      }

      console.log(`Connection status updated successfully for instance: ${instance}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Connection status updated successfully',
          instance,
          status: internalStatus,
          phoneNumber
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // For other event types, just acknowledge receipt
    console.log(`Event type ${event} - no action taken`);
    return new Response(
      JSON.stringify({ success: true, message: `Event ${event} acknowledged` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Error in whatsapp-qr-webhook:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
