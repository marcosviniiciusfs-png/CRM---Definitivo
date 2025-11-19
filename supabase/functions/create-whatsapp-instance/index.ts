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

// Clean Base64 string
function cleanBase64(rawBase64: string): string {
  // CRÍTICO: Remover aspas duplas literais no início e fim
  let cleaned = rawBase64;
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }
  
  // Remover prefixo data:image se existir
  cleaned = cleaned.replace(/^data:image\/[a-z]+;base64,/i, '');
  
  // Remover espaços, aspas e caracteres inválidos
  cleaned = cleaned.replace(/\s/g, '');
  cleaned = cleaned.replace(/['"]/g, '');
  cleaned = cleaned.replace(/[^A-Za-z0-9+/=]/g, '');
  
  return cleaned;
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
    
    // Get Evolution API credentials with fallback to database
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
          // CRITICAL: Discard empty or null values
          const value = item.config_value?.trim();
          if (value && value.length > 0) {
            if (item.config_key === 'EVOLUTION_API_URL') evolutionApiUrl = value;
            if (item.config_key === 'EVOLUTION_API_KEY') evolutionApiKey = value;
          }
        });
        
        if (evolutionApiUrl && evolutionApiKey) {
          console.log('✅ Evolution API credentials loaded from database');
        } else {
          console.warn('⚠️ Evolution API credentials found in database but are empty');
        }
      }
    }

    // Final validation
    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error('❌ Missing credentials - URL:', !!evolutionApiUrl, 'Key:', !!evolutionApiKey);
      throw new Error('Evolution API credentials not configured. Please configure them in Settings > Evolution API Configuration');
    }

    // Remove trailing slash and /manager from URL if present
    const baseUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '');

    // Webhook URLs
    const qrWebhookUrl = `${supabaseUrl}/functions/v1/whatsapp-qr-webhook`;
    const messageWebhookUrl = `${supabaseUrl}/functions/v1/whatsapp-message-webhook`;

    console.log('Using Evolution API URL:', baseUrl);
    console.log('QR Webhook:', qrWebhookUrl);
    console.log('Message Webhook:', messageWebhookUrl);

    // ========================================
    // STEP 1: CLEANUP OLD INSTANCES
    // ========================================
    console.log('🧹 Starting cleanup of old instances...');
    
    // FIRST: Get all instances from database for this user
    const { data: dbInstances, error: dbFetchError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', user.id);

    if (dbFetchError) {
      console.error('❌ Error fetching instances from database:', dbFetchError);
    } else {
      console.log(`📋 Found ${dbInstances?.length || 0} instances in database for user`);
    }

    // SECOND: Fetch all instances from Evolution API
    try {
      const fetchInstancesResponse = await fetch(`${baseUrl}/instance/fetchInstances`, {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey,
        },
      });

      if (fetchInstancesResponse.ok) {
        const allInstances = await fetchInstancesResponse.json();
        console.log(`📋 Found ${allInstances.length} total instances in Evolution API`);

        // Filter instances belonging to this user (by instance name pattern OR database records)
        const userPrefix = `crm-${user.id.substring(0, 8)}`;
        const dbInstanceNames = dbInstances?.map(inst => inst.instance_name) || [];
        
        const userInstances = Array.isArray(allInstances) 
          ? allInstances.filter((inst: any) => {
              const instanceName = inst.instance?.instanceName;
              return instanceName && (
                instanceName.startsWith(userPrefix) || 
                dbInstanceNames.includes(instanceName)
              );
            })
          : [];

        console.log(`🔍 Found ${userInstances.length} instances for user in Evolution API`);

        // Delete each old instance
        if (userInstances.length > 0) {
          console.log('🗑️ Deleting old instances...');
          
          for (const oldInstance of userInstances) {
            const oldInstanceName = oldInstance.instance?.instanceName;
            if (!oldInstanceName) continue;

            try {
              console.log(`  ↳ Processing instance: ${oldInstanceName}`);
              
              // STEP 1.1: Force logout first
              try {
                console.log(`    🔓 Logging out: ${oldInstanceName}`);
                const logoutResponse = await fetch(`${baseUrl}/instance/logout/${oldInstanceName}`, {
                  method: 'DELETE',
                  headers: {
                    'apikey': evolutionApiKey,
                  },
                });

                if (logoutResponse.ok) {
                  console.log(`    ✅ Logged out: ${oldInstanceName}`);
                } else {
                  console.warn(`    ⚠️ Logout failed for ${oldInstanceName}:`, logoutResponse.status);
                }
              } catch (logoutError) {
                console.warn(`    ⚠️ Logout error for ${oldInstanceName}:`, logoutError);
                // Continue to delete even if logout fails
              }

              // STEP 1.2: Delete the instance
              console.log(`    🗑️ Deleting: ${oldInstanceName}`);
              const deleteResponse = await fetch(`${baseUrl}/instance/delete/${oldInstanceName}`, {
                method: 'DELETE',
                headers: {
                  'apikey': evolutionApiKey,
                },
              });

              if (deleteResponse.ok) {
                console.log(`    ✅ Deleted: ${oldInstanceName}`);
              } else {
                console.warn(`    ⚠️ Failed to delete ${oldInstanceName}:`, deleteResponse.status);
              }
            } catch (deleteError) {
              console.error(`  ❌ Error processing ${oldInstanceName}:`, deleteError);
            }
          }

          // Also cleanup database records for these instances
          const { error: dbCleanupError } = await supabase
            .from('whatsapp_instances')
            .delete()
            .eq('user_id', user.id);

          if (dbCleanupError) {
            console.warn('⚠️ Error cleaning up database instances:', dbCleanupError);
          } else {
            console.log('✅ Database instances cleaned up');
          }

          // Wait a moment for Evolution API to fully process deletions
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log('✅ Cleanup completed');
        } else {
          console.log('✨ No old instances to clean up');
        }
      } else {
        console.warn('⚠️ Could not fetch instances for cleanup:', fetchInstancesResponse.status);
      }
    } catch (cleanupError) {
      console.error('❌ Error during cleanup:', cleanupError);
      // Continue with instance creation even if cleanup fails
    }

    // ========================================
    // STEP 2: CREATE NEW INSTANCE
    // ========================================
    // Generate unique instance name using user ID and timestamp
    const instanceName = `crm-${user.id.substring(0, 8)}-${Date.now()}`;
    console.log('Creating fresh instance with name:', instanceName);

    // Create instance in Evolution API (WITHOUT webhook - will be configured separately)
    const evolutionResponse = await fetch(`${baseUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        instanceName: instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
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
    // STEP 3: CONFIGURE WEBHOOKS
    // ========================================
    console.log('Configuring webhooks for instance...');
    
    // Get webhook secret for authentication
    const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.warn('⚠️ EVOLUTION_WEBHOOK_SECRET not configured - webhooks will not be authenticated!');
    }
    
    // Configurar webhook global usando o formato correto da Evolution API
    const webhookConfig = {
      webhook: {
        enabled: true,
        url: messageWebhookUrl,
        webhook_by_events: true, // CRITICAL: Habilitar webhook por eventos
        webhook_base64: false,
        events: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE'
        ],
        // 🔒 SEGURANÇA: Adicionar header de autenticação para webhooks
        ...(webhookSecret ? {
          headers: {
            'x-api-key': webhookSecret
          }
        } : {})
      }
    };

    const webhookResponse = await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify(webhookConfig),
    });

    if (!webhookResponse.ok) {
      const webhookError = await webhookResponse.json().catch(async () => {
        const text = await webhookResponse.text();
        return { error: text };
      });
      console.error('❌ Webhook configuration failed:', JSON.stringify(webhookError, null, 2));
      // Não falhar a criação da instância por causa do webhook
    } else {
      const webhookResult = await webhookResponse.json();
      console.log('✅ Webhook configured successfully:', JSON.stringify(webhookResult, null, 2));
    }

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
        // CRITICAL: Rigorously clean Base64 string - remove prefix, whitespace, quotes, invalid chars
        qrCodeBase64 = cleanBase64(rawQR);
        console.log('✅ QR Code extracted IMMEDIATELY - Length:', qrCodeBase64.length);
        console.log('📦 QR Code preview:', qrCodeBase64.substring(0, 100) + '...');
      } else {
        console.warn('⚠️ QR Code found but invalid format:', typeof rawQR, rawQR?.substring?.(0, 50));
      }
    } else {
      console.warn('⚠️ No qrcode field in Evolution API response');
    }

    // ========================================
    // GET USER'S ORGANIZATION
    // ========================================
    console.log('🏢 Fetching user organization...');
    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (memberError || !memberData) {
      console.error('❌ Error fetching organization:', memberError);
      throw new Error('User is not associated with any organization');
    }

    const organizationId = memberData.organization_id;
    console.log('✅ Organization found:', organizationId);

    // ========================================
    // IMMEDIATE DATABASE SAVE
    // ========================================
    // Save to database IMMEDIATELY - no delays, no waiting
    console.log('💾 Saving to database NOW - QR Code present:', !!qrCodeBase64);
    
    // CRÍTICO: Salvar o QR Code como string pura, não como JSON
    const { data: instanceData, error: dbError } = await supabase
      .from('whatsapp_instances')
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        instance_name: instanceName,
        status: qrCodeBase64 ? 'WAITING_QR' : 'CREATING',
        webhook_url: qrWebhookUrl,
        qr_code: qrCodeBase64, // String pura, já limpa
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ Database error:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    console.log('✅ Instance saved to database:', instanceData.id);
    console.log('⏱️ QR Code in DB:', !!qrCodeBase64, '- Ready for immediate display');

    if (qrCodeBase64) {
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
