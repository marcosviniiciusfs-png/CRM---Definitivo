import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
      console.log(`Processing QR code update for instance: ${instance}`);
      console.log('Payload data structure:', JSON.stringify(data, null, 2));
      
      // Evolution API sends QR code in data.qrcode.base64
      let pureBase64 = '';
      
      try {
        // Extract base64 from the correct path in Evolution API payload
        if (data?.qrcode?.base64) {
          // Primary path: data.qrcode.base64 (Evolution API standard format)
          pureBase64 = data.qrcode.base64;
          console.log('QR extracted from data.qrcode.base64');
        } else if (typeof data?.qrcode === 'string') {
          // Alternative: direct string
          pureBase64 = data.qrcode;
          console.log('QR extracted from data.qrcode (string)');
        } else if (typeof data?.qr === 'string') {
          // Alternative: data.qr
          pureBase64 = data.qr;
          console.log('QR extracted from data.qr');
        } else if (typeof data?.base64 === 'string') {
          // Alternative: data.base64
          pureBase64 = data.base64;
          console.log('QR extracted from data.base64');
        }

        if (!pureBase64) {
          console.error('No QR code found in any expected payload path');
          return new Response(
            JSON.stringify({ success: true, message: 'Ignored - no QR code in payload' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }

        // Remove data:image prefix if present (keep only pure base64)
        const cleanBase64 = pureBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        
        if (!cleanBase64 || cleanBase64.length < 100) {
          console.error('Invalid Base64 length after cleaning:', cleanBase64.length);
          return new Response(
            JSON.stringify({ success: false, message: 'Invalid QR code format' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        console.log(`Clean Base64 extracted (${cleanBase64.length} chars) for instance: ${instance}`);

        // Update QR code in database with timestamp to track freshness
        const { error: updateError } = await supabase
          .from('whatsapp_instances')
          .update({ 
            qr_code: cleanBase64,
            status: 'WAITING_QR',
            updated_at: new Date().toISOString()
          })
          .eq('instance_name', instance);

        if (updateError) {
          console.error('Error updating QR code in database:', updateError);
          throw updateError;
        }

        console.log(`✅ QR code updated successfully for instance: ${instance}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'QR code updated successfully',
            instance,
            qrCodeLength: cleanBase64.length,
            timestamp: new Date().toISOString()
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      } catch (extractError: any) {
        console.error('❌ Error processing QR code:', extractError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to process QR code',
            details: extractError.message
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
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
