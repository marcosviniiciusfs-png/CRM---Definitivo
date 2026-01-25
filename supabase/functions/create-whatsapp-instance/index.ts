import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-customer-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CreateInstanceRequest {
  userId: string;
}

async function getOrCreateOrganizationId(
  // Tipagem propositalmente frouxa: Edge Functions não usam os tipos gerados do banco
  // e o inference pode virar `never` dependendo dos generics do createClient.
  supabase: any,
  user: { id: string; email?: string | null },
): Promise<string | null> {
  // 1) Happy path: membership already linked by user_id
  const { data: memberByUser, error: memberByUserError } = await supabase
    .from('organization_members')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberByUserError) {
    console.warn('⚠️ Error fetching org by user_id (continuing):', memberByUserError);
  }

  if (memberByUser?.organization_id) {
    return memberByUser.organization_id;
  }

  // 2) Fallback: user was invited (email match) but membership not linked yet
  const email = user.email?.toLowerCase().trim();
  if (email) {
    const { data: inviteByEmail, error: inviteByEmailError } = await supabase
      .from('organization_members')
      .select('id, organization_id')
      .eq('email', email)
      .is('user_id', null)
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (inviteByEmailError) {
      console.warn('⚠️ Error fetching org invite by email (continuing):', inviteByEmailError);
    }

    if (inviteByEmail?.organization_id) {
      const { error: linkError } = await supabase
        .from('organization_members')
        .update({ user_id: user.id })
        .eq('id', inviteByEmail.id);

      if (linkError) {
        console.warn('⚠️ Failed to link invited member to user_id (continuing):', linkError);
      } else {
        console.log('✅ Linked invited organization membership to user_id');
      }

      return inviteByEmail.organization_id;
    }
  }

  // 3) Last resort: create a new organization for this user
  console.warn('⚠️ User has no organization. Creating a new organization automatically...');

  const orgName = email ? `${email}'s Organization` : `Organização ${user.id.substring(0, 8)}`;
  const { data: newOrg, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: orgName })
    .select('id')
    .single();

  if (orgError || !newOrg?.id) {
    console.error('❌ Failed to create organization:', orgError);
    // If we cannot create, do not block WhatsApp connection entirely.
    return null;
  }

  const { error: memberInsertError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: newOrg.id,
      user_id: user.id,
      role: 'owner',
      email: email ?? null,
    });

  if (memberInsertError) {
    console.warn('⚠️ Failed to create organization membership (continuing):', memberInsertError);
    return newOrg.id;
  }

  console.log('✅ Organization created and user assigned as owner:', newOrg.id);
  return newOrg.id;
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
    // STEP 1: CLEANUP OLD INSTANCES (NON-BLOCKING)
    // ========================================
    // OTIMIZAÇÃO: Executar limpeza de forma não-bloqueante
    // A limpeza será feita em background enquanto criamos a nova instância
    console.log('🧹 Agendando limpeza de instâncias antigas (non-blocking)...');
    
    // Capturar dados necessários para cleanup antes de prosseguir
    const cleanupData = {
      userId: user.id,
      baseUrl,
      evolutionApiKey,
    };
    
    // Função de limpeza que será executada em background
    const performCleanup = async () => {
      try {
        // Get all instances from database for this user
        const { data: dbInstances, error: dbFetchError } = await supabase
          .from('whatsapp_instances')
          .select('*')
          .eq('user_id', cleanupData.userId);

        if (dbFetchError) {
          console.error('❌ [CLEANUP] Error fetching instances from database:', dbFetchError);
          return;
        }

        console.log(`📋 [CLEANUP] Found ${dbInstances?.length || 0} instances in database for user`);

        // Fetch all instances from Evolution API
        const fetchInstancesResponse = await fetch(`${cleanupData.baseUrl}/instance/fetchInstances`, {
          method: 'GET',
          headers: {
            'apikey': cleanupData.evolutionApiKey,
          },
        });

        if (!fetchInstancesResponse.ok) {
          console.warn('⚠️ [CLEANUP] Could not fetch instances:', fetchInstancesResponse.status);
          return;
        }

        const allInstances = await fetchInstancesResponse.json();
        const userPrefix = `crm-${cleanupData.userId.substring(0, 8)}`;
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

        console.log(`🔍 [CLEANUP] Found ${userInstances.length} old instances to clean up`);

        // Delete each old instance (don't block on these)
        for (const oldInstance of userInstances) {
          const oldInstanceName = oldInstance.instance?.instanceName;
          if (!oldInstanceName) continue;

          try {
            // Logout first
            await fetch(`${cleanupData.baseUrl}/instance/logout/${oldInstanceName}`, {
              method: 'DELETE',
              headers: { 'apikey': cleanupData.evolutionApiKey },
            });
            
            // Delete instance
            await fetch(`${cleanupData.baseUrl}/instance/delete/${oldInstanceName}`, {
              method: 'DELETE',
              headers: { 'apikey': cleanupData.evolutionApiKey },
            });
            
            console.log(`✅ [CLEANUP] Deleted: ${oldInstanceName}`);
          } catch (e) {
            console.warn(`⚠️ [CLEANUP] Error cleaning ${oldInstanceName}:`, e);
          }
        }

        // Cleanup database records
        await supabase
          .from('whatsapp_instances')
          .delete()
          .eq('user_id', cleanupData.userId);

        console.log('✅ [CLEANUP] Background cleanup completed');
      } catch (error) {
        console.error('❌ [CLEANUP] Background cleanup failed:', error);
      }
    };

    // NOTA: Não aguardar a limpeza - ela acontece em background
    // Isso permite retornar o QR code muito mais rápido
    // A limpeza continuará executando mesmo após a resposta ser enviada
    performCleanup().catch(err => console.error('❌ [CLEANUP] Error in background cleanup:', err));

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
    // PRIORITY: IMMEDIATE QR CODE EXTRACTION
    // ========================================
    // OTIMIZAÇÃO: Extrair QR ANTES de qualquer outra operação
    // Isso garante que o QR code seja retornado o mais rápido possível
    
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
    // STEP 3: PARALLEL OPERATIONS (NON-BLOCKING)
    // ========================================
    // OTIMIZAÇÃO: Executar webhook, presença e busca de org em PARALELO
    // Isso economiza vários segundos de latência
    
    console.log('⚡ Executando operações paralelas (webhook, presença, org)...');
    
    // Get webhook secret for authentication
    const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.warn('⚠️ EVOLUTION_WEBHOOK_SECRET not configured - webhooks will not be authenticated!');
    }
    
    // Configurar webhook (não-bloqueante)
    const configureWebhook = async () => {
      const webhookConfig = {
        webhook: {
          enabled: true,
          url: messageWebhookUrl,
          webhook_by_events: true,
          webhook_base64: false,
          events: [
            'QRCODE_UPDATED',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE'
          ],
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
          'apikey': evolutionApiKey!,
        },
        body: JSON.stringify(webhookConfig),
      });

      if (!webhookResponse.ok) {
        const webhookError = await webhookResponse.json().catch(async () => {
          const text = await webhookResponse.text();
          return { error: text };
        });
        console.error('❌ Webhook configuration failed:', JSON.stringify(webhookError, null, 2));
      } else {
        const webhookResult = await webhookResponse.json();
        console.log('✅ Webhook configured successfully');
      }
    };

    // Definir presença (não-bloqueante)
    const setPresence = async () => {
      const presenceResponse = await fetch(`${baseUrl}/instance/setPresence/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey!,
        },
        body: JSON.stringify({ presence: 'unavailable' }),
      });
      
      if (presenceResponse.ok) {
        console.log('✅ Presença definida como unavailable');
      } else {
        console.warn('⚠️ Falha ao definir presença:', presenceResponse.status);
      }
    };

    // Buscar organização (necessário para salvar no banco)
    const getOrganization = async () => {
      return await getOrCreateOrganizationId(supabase, {
        id: user.id,
        email: user.email,
      });
    };

    // OTIMIZAÇÃO: Executar todas as operações em paralelo
    const [webhookResult, presenceResult, organizationId] = await Promise.allSettled([
      configureWebhook(),
      setPresence(),
      getOrganization(),
    ]);

    // Extrair organizationId do resultado
    const orgId = organizationId.status === 'fulfilled' ? organizationId.value : null;
    
    if (orgId) {
      console.log('✅ Organization resolved:', orgId);
    } else {
      console.warn('⚠️ Could not resolve organization. Proceeding with organization_id = null');
    }

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
        organization_id: orgId,
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
