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
      console.log(`🔄 Processing QR code update for instance: ${instance}`);
      
      // CRITICAL: Extract QR code dynamically from webhook payload
      let rawBase64 = '';
      
      try {
        // Primary path: Evolution API sends QR in data.qrcode.base64
        if (data?.qrcode?.base64) {
          rawBase64 = data.qrcode.base64;
          console.log('✅ QR extracted from: data.qrcode.base64');
        } 
        // Fallback: Check if qrcode is a direct string
        else if (typeof data?.qrcode === 'string') {
          rawBase64 = data.qrcode;
          console.log('✅ QR extracted from: data.qrcode (direct string)');
        } 
        // Additional fallback paths
        else if (typeof data?.qr === 'string') {
          rawBase64 = data.qr;
          console.log('✅ QR extracted from: data.qr');
        } 
        else if (typeof data?.base64 === 'string') {
          rawBase64 = data.base64;
          console.log('✅ QR extracted from: data.base64');
        }

        // Validate QR code was found
        if (!rawBase64 || rawBase64.length === 0) {
          console.error('❌ No QR code found in payload. Data structure:', JSON.stringify(data, null, 2));
          return new Response(
            JSON.stringify({ success: true, message: 'No QR code in payload' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }

        // CRITICAL: Clean Base64 - remove data:image prefix if present
        const cleanBase64 = rawBase64.replace(/^data:image\/[a-zA-Z]+;base64,/i, '').trim();
        
        // Validate cleaned Base64 length (QR codes are typically 10000+ chars)
        if (cleanBase64.length < 100) {
          console.error(`❌ Invalid Base64 length: ${cleanBase64.length} chars`);
          console.error('Raw QR preview:', rawBase64.substring(0, 200));
          return new Response(
            JSON.stringify({ success: false, message: 'Invalid QR code format - too short' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        console.log(`✅ Clean Base64 ready: ${cleanBase64.length} characters`);
        console.log(`📸 QR Code preview: ${cleanBase64.substring(0, 50)}...`);

        // CRITICAL: Update database with fresh QR code
        const updateTimestamp = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('whatsapp_instances')
          .update({ 
            qr_code: cleanBase64,
            status: 'DISCONNECTED', // Changed from WAITING_QR to DISCONNECTED for better UX
            updated_at: updateTimestamp
          })
          .eq('instance_name', instance);

        if (updateError) {
          console.error('❌ Database update error:', updateError);
          throw updateError;
        }

        console.log(`✅ QR code saved to database for instance: ${instance}`);
        console.log(`⏱️ Timestamp: ${updateTimestamp}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'QR code updated successfully',
            instance,
            qrCodeLength: cleanBase64.length,
            timestamp: updateTimestamp
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      } catch (extractError: any) {
        console.error('❌ Critical error processing QR code:', extractError);
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
