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
      const qrCodeRaw = data?.qrcode || data?.qr || data?.base64;
      
      if (!qrCodeRaw) {
        console.log('No QR code found in payload');
        return new Response(
          JSON.stringify({ success: true, message: 'Ignored - no QR code' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      console.log(`Processing QR code for instance: ${instance}`);
      console.log('QR Code raw type:', typeof qrCodeRaw);

      // Extract pure Base64 string from various payload formats
      let pureBase64 = '';
      
      try {
        if (typeof qrCodeRaw === 'string') {
          // If it's a string, remove any data:image prefix
          pureBase64 = qrCodeRaw.replace(/^data:image\/[a-z]+;base64,/, '');
        } else if (typeof qrCodeRaw === 'object') {
          // If it's an object, try to extract base64 property
          pureBase64 = qrCodeRaw.base64 || qrCodeRaw.qrcode || qrCodeRaw.code || '';
          
          // Remove prefix if still present
          if (typeof pureBase64 === 'string') {
            pureBase64 = pureBase64.replace(/^data:image\/[a-z]+;base64,/, '');
          }
        }

        if (!pureBase64) {
          console.error('Could not extract Base64 from QR code:', qrCodeRaw);
          return new Response(
            JSON.stringify({ success: false, message: 'Invalid QR code format' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        console.log(`Pure Base64 extracted (${pureBase64.length} chars) for instance: ${instance}`);

        // Update QR code in database with pure Base64 string
        const { error: updateError } = await supabase
          .from('whatsapp_instances')
          .update({ 
            qr_code: pureBase64,
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
            instance,
            base64Length: pureBase64.length
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      } catch (extractError: any) {
        console.error('Error extracting Base64 from QR code:', extractError);
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
