import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CreateInstanceRequest {
  userId: string;
}

// Function to poll for QR Code (FALLBACK ONLY)
async function pollForQRCode(
  baseUrl: string, 
  apiKey: string, 
  instanceName: string, 
  dbInstanceId: string,
  supabase: any,
  maxAttempts: number = 10
) {
  console.log(`🔄 Starting FALLBACK QR Code polling for instance: ${instanceName}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Wait 2 seconds between attempts
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`⏳ Polling attempt ${attempt}/${maxAttempts} for ${instanceName}`);
      
      // FIRST: Check if QR Code already exists in database
      const { data: existingInstance } = await supabase
        .from('whatsapp_instances')
        .select('qr_code, status')
        .eq('id', dbInstanceId)
        .single();
      
      if (existingInstance?.qr_code) {
        console.log(`✅ QR Code already exists in database - stopping polling`);
        return; // Exit immediately - don't overwrite existing QR Code
      }
      
      // Fetch instance status from Evolution API
      const statusResponse = await fetch(`${baseUrl}/instance/fetchInstances/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': apiKey,
        },
      });

      if (!statusResponse.ok) {
        console.warn(`⚠️ Polling attempt ${attempt} failed:`, statusResponse.status);
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`📊 Instance status data:`, JSON.stringify(statusData, null, 2));

      // Try to extract QR code
      let qrCodeBase64: string | null = null;
      
      if (statusData?.instance?.qrcode) {
        const qrData = statusData.instance.qrcode;
        let rawQR = qrData.base64 || qrData.qrcode || qrData.code || qrData;
        
        if (typeof rawQR === 'string' && rawQR.length > 0) {
          qrCodeBase64 = rawQR.replace(/^data:image\/[a-z]+;base64,/i, '').trim();
          console.log(`✅ QR Code found in polling attempt ${attempt} - Length:`, qrCodeBase64.length);
        }
      }

      // If QR code found, update database and exit
      if (qrCodeBase64) {
        const { error: updateError } = await supabase
          .from('whatsapp_instances')
          .update({
            qr_code: qrCodeBase64,
            status: 'DISCONNECTED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', dbInstanceId);

        if (updateError) {
          console.error('❌ Error updating QR Code in database:', updateError);
        } else {
          console.log(`✅ QR Code updated successfully via polling for ${instanceName}`);
        }
        
        return; // Exit polling
      }

    } catch (error) {
      console.error(`❌ Error in polling attempt ${attempt}:`, error);
    }
  }
  
  console.log(`⚠️ Polling completed without finding QR Code for ${instanceName}. Relying on webhook.`);
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

    console.log('Creating instance for user:', user.id);

    // Generate unique instance name using user ID and timestamp
    const instanceName = `crm-${user.id.substring(0, 8)}-${Date.now()}`;
    
    // Get Evolution API credentials
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error('Evolution API credentials not configured');
    }

    // Remove trailing slash and /manager from URL if present
    const baseUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '');

    // Webhook URL for QR code and connection status updates
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-qr-webhook`;

    console.log('Creating instance with name:', instanceName);
    console.log('Using Evolution API URL:', baseUrl);

    // Create instance in Evolution API
    const evolutionResponse = await fetch(`${baseUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        instanceName: instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          events: [
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE'
          ]
        }
      }),
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error('Evolution API error:', errorText);
      throw new Error(`Evolution API error: ${evolutionResponse.status} - ${errorText}`);
    }

    const evolutionData = await evolutionResponse.json();
    console.log('Evolution API response:', evolutionData);

    // ========================================
    // PRIORITY: IMMEDIATE QR CODE EXTRACTION
    // ========================================
    // Extract QR Code IMMEDIATELY from Evolution API response
    // This is CRITICAL for QR Code freshness - any delay causes expiration
    
    let qrCodeBase64: string | null = null;
    
    if (evolutionData?.qrcode) {
      const qrData = evolutionData.qrcode;
      console.log('🔍 QR Data structure:', JSON.stringify(qrData, null, 2));
      
      // Priority extraction: base64 > qrcode > code
      let rawQR = qrData.base64 || qrData.qrcode || qrData.code;
      
      if (typeof rawQR === 'string' && rawQR.length > 0) {
        // CRITICAL: Clean Base64 string - remove ANY prefix
        qrCodeBase64 = rawQR.replace(/^data:image\/[a-z]+;base64,/i, '').trim();
        console.log('✅ QR Code extracted IMMEDIATELY - Length:', qrCodeBase64.length);
        console.log('📦 QR Code preview:', qrCodeBase64.substring(0, 100) + '...');
      } else {
        console.warn('⚠️ QR Code found but invalid format:', typeof rawQR, rawQR?.substring?.(0, 50));
      }
    } else {
      console.warn('⚠️ No qrcode field in Evolution API response');
    }

    // ========================================
    // IMMEDIATE DATABASE SAVE
    // ========================================
    // Save to database IMMEDIATELY - no delays, no waiting
    console.log('💾 Saving to database NOW - QR Code present:', !!qrCodeBase64);
    
    const { data: instanceData, error: dbError } = await supabase
      .from('whatsapp_instances')
      .insert({
        user_id: user.id,
        instance_name: instanceName,
        status: qrCodeBase64 ? 'DISCONNECTED' : 'CREATING',
        webhook_url: webhookUrl,
        qr_code: qrCodeBase64,
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ Database error:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    const saveTimestamp = Date.now();
    console.log('✅ Instance saved to database:', instanceData.id);
    console.log('⏱️ QR Code in DB:', !!qrCodeBase64, '- Ready for immediate display');

    // ========================================
    // FALLBACK POLLING (Only if needed)
    // ========================================
    // Only poll if QR Code was NOT in initial response
    if (!qrCodeBase64) {
      console.log('⚠️ QR Code not in initial response - starting fallback polling');
      
      // Start background polling as fallback (don't await)
      pollForQRCode(
        baseUrl, 
        evolutionApiKey, 
        instanceName, 
        instanceData.id, 
        supabase
      ).catch(err => {
        console.error('❌ Error in fallback polling:', err);
      });
    } else {
      console.log('✅ QR Code captured in initial response - NO POLLING NEEDED');
      console.log('🚀 Returning fresh QR Code immediately');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: qrCodeBase64 ? 'Instance created with QR Code.' : 'Instance created. QR Code will be available shortly.',
        instance: {
          id: instanceData.id,
          instanceName: instanceName,
          status: instanceData.status,
          qrCode: qrCodeBase64,
        },
        evolutionData: evolutionData,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error('Error in create-whatsapp-instance:', error);
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
