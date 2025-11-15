import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔄 Sincronizando instâncias WhatsApp...');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificar JWT e pegar usuário
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Invalid authorization token');
    }

    console.log('👤 Sincronizando para user:', user.id);

    // Pegar credenciais da Evolution API
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    let evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      const { data: config } = await supabase
        .from('app_config')
        .select('config_key, config_value')
        .in('config_key', ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY'])
        .limit(2);

      if (config && config.length > 0) {
        config.forEach(item => {
          const value = item.config_value?.trim();
          if (value && value.length > 0) {
            if (item.config_key === 'EVOLUTION_API_URL') evolutionApiUrl = value;
            if (item.config_key === 'EVOLUTION_API_KEY') evolutionApiKey = value;
          }
        });
      }
    }

    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error('Evolution API credentials not configured');
    }

    const baseUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '');
    console.log('🔗 Evolution API URL:', baseUrl);

    // Buscar todas as instâncias da Evolution API
    const fetchResponse = await fetch(`${baseUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    if (!fetchResponse.ok) {
      throw new Error(`Failed to fetch instances: ${fetchResponse.status}`);
    }

    const allInstances = await fetchResponse.json();
    console.log(`📋 Total de instâncias na Evolution API: ${allInstances.length}`);

    // Filtrar instâncias do usuário (pelo prefixo do nome)
    const userPrefix = `crm-${user.id.substring(0, 8)}`;
    const userInstances = Array.isArray(allInstances) 
      ? allInstances.filter((inst: any) => {
          const instanceName = inst.instance?.instanceName;
          return instanceName && instanceName.startsWith(userPrefix);
        })
      : [];

    console.log(`🔍 Instâncias do usuário na Evolution API: ${userInstances.length}`);

    if (userInstances.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Nenhuma instância para sincronizar',
          synced: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // Buscar instâncias já registradas no banco
    const { data: dbInstances } = await supabase
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('user_id', user.id);

    const dbInstanceNames = new Set(dbInstances?.map(i => i.instance_name) || []);
    
    // Encontrar instâncias que não estão no banco
    const instancesToSync = userInstances.filter((inst: any) => 
      !dbInstanceNames.has(inst.instance?.instanceName)
    );

    console.log(`📥 Instâncias para sincronizar: ${instancesToSync.length}`);

    let syncedCount = 0;
    const errors: string[] = [];

    for (const evolutionInstance of instancesToSync) {
      const instanceName = evolutionInstance.instance?.instanceName;
      if (!instanceName) continue;

      try {
        console.log(`  ↳ Sincronizando: ${instanceName}`);
        
        const connectionStatus = evolutionInstance.instance?.state || 'open';
        let status = 'DISCONNECTED';
        
        if (connectionStatus === 'open') {
          status = 'CONNECTED';
        } else if (connectionStatus === 'connecting') {
          status = 'WAITING_QR';
        }

        // Inserir no banco de dados
        const { error: insertError } = await supabase
          .from('whatsapp_instances')
          .insert({
            user_id: user.id,
            instance_name: instanceName,
            status: status,
            phone_number: evolutionInstance.instance?.owner || null,
            connected_at: status === 'CONNECTED' ? new Date().toISOString() : null,
            webhook_url: `${supabaseUrl}/functions/v1/whatsapp-message-webhook`,
          });

        if (insertError) {
          console.error(`  ❌ Erro ao inserir ${instanceName}:`, insertError);
          errors.push(`${instanceName}: ${insertError.message}`);
        } else {
          console.log(`  ✅ Sincronizado: ${instanceName} (${status})`);
          syncedCount++;
        }
      } catch (error: any) {
        console.error(`  ❌ Erro ao processar ${instanceName}:`, error);
        errors.push(`${instanceName}: ${error.message}`);
      }
    }

    console.log(`✅ Sincronização concluída: ${syncedCount}/${instancesToSync.length} instâncias`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${syncedCount} instância(s) sincronizada(s)`,
        synced: syncedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error('❌ Erro na sincronização:', error);
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
