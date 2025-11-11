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

// Function to poll for QR Code
async function pollForQRCode(
  baseUrl: string, 
  apiKey: string, 
  instanceName: string, 
  dbInstanceId: string,
  supabase: any,
  maxAttempts: number = 10
) {
  console.log(`Starting QR Code polling for instance: ${instanceName}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Wait 2 seconds between attempts
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`Polling attempt ${attempt}/${maxAttempts} for ${instanceName}`);
      
      // Fetch instance status from Evolution API
      const statusResponse = await fetch(`${baseUrl}/instance/fetchInstances/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': apiKey,
        },
      });

      if (!statusResponse.ok) {
        console.warn(`Polling attempt ${attempt} failed:`, statusResponse.status);
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`Instance status data:`, statusData);

      // Try to extract QR code
      let qrCodeBase64: string | null = null;
      
      if (statusData?.instance?.qrcode) {
        const qrData = statusData.instance.qrcode;
        let rawQR = qrData.base64 || qrData.qrcode || qrData.code || qrData;
        
        if (typeof rawQR === 'string') {
          qrCodeBase64 = rawQR.replace(/^data:image\/[a-z]+;base64,/, '');
          console.log(`✅ QR Code found in polling attempt ${attempt}`);
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
          console.error('Error updating QR Code in database:', updateError);
        } else {
          console.log(`✅ QR Code updated successfully in database for instance ${instanceName}`);
        }
        
        return; // Exit polling
      }

    } catch (error) {
      console.error(`Error in polling attempt ${attempt}:`, error);
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

    // Extract QR Code from initial response if available
    let qrCodeBase64: string | null = null;
    
    // Try to extract QR code from various possible locations in the response
    if (evolutionData?.qrcode) {
      const qrData = evolutionData.qrcode;
      
      // Try to get base64 from different possible properties
      let rawQR = qrData.base64 || qrData.qrcode || qrData.code || qrData;
      
      // If rawQR is a string, clean it
      if (typeof rawQR === 'string') {
        // Remove data:image prefix if present
        qrCodeBase64 = rawQR.replace(/^data:image\/[a-z]+;base64,/, '');
        console.log('QR Code extracted from creation response:', qrCodeBase64.substring(0, 50) + '...');
      }
    }

    // Save instance to database with initial QR code if available
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
      console.error('Database error:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    console.log('Instance saved to database:', instanceData.id, 'with QR Code:', !!qrCodeBase64);

    // If QR Code not in initial response, start polling
    if (!qrCodeBase64) {
      console.log('QR Code not in initial response, starting polling...');
      
      // Start polling in background (don't await, let it run async)
      pollForQRCode(baseUrl, evolutionApiKey, instanceName, instanceData.id, supabase).catch(err => {
        console.error('Error in QR polling:', err);
      });
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
