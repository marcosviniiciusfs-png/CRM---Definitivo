import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔄 Iniciando sincronização de fotos de perfil de todos os leads...');

    // Obter token de autorização
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Autorização necessária');
    }

    // Criar cliente Supabase com token do usuário
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Buscar o usuário autenticado
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Usuário não autenticado');
    }

    // Buscar a organização do usuário
    const { data: orgData, error: orgError } = await supabase
      .rpc('get_user_organization_id', { _user_id: user.id });

    if (orgError || !orgData) {
      throw new Error('Organização não encontrada');
    }

    const organizationId = orgData;
    console.log('🏢 Organization ID:', organizationId);

    // Buscar instância conectada da organização
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('instance_name, id, status')
      .eq('organization_id', organizationId)
      .eq('status', 'CONNECTED')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (instanceError || !instanceData) {
      console.error('❌ Nenhuma instância conectada encontrada');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nenhuma instância WhatsApp conectada. Por favor, conecte uma instância primeiro.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('📱 Instância encontrada:', instanceData.instance_name);

    // Buscar todos os leads da organização
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, nome_lead, telefone_lead, avatar_url')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (leadsError) {
      throw leadsError;
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Nenhum lead encontrado para sincronizar',
          total: 0,
          synced: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`📊 Total de leads para sincronizar: ${leads.length}`);

    // Processar leads em lotes para evitar sobrecarregar a API
    const results = {
      total: leads.length,
      synced: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Processar em lotes de 5 leads por vez
    const batchSize = 5;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (lead) => {
          try {
            console.log(`🔍 Sincronizando lead: ${lead.nome_lead} (${lead.telefone_lead})`);

            // Chamar a função fetch-profile-picture
            const { data, error } = await supabase.functions.invoke('fetch-profile-picture', {
              body: {
                instance_name: instanceData.instance_name,
                phone_number: lead.telefone_lead,
                lead_id: lead.id,
              },
            });

            if (error) {
              console.error(`❌ Erro ao sincronizar ${lead.nome_lead}:`, error);
              results.failed++;
              results.errors.push(`${lead.nome_lead}: ${error.message}`);
              return;
            }

            if (data?.success && data?.hasProfilePicture) {
              console.log(`✅ Foto sincronizada: ${lead.nome_lead}`);
              results.synced++;
            } else {
              console.log(`⚠️ Lead sem foto pública: ${lead.nome_lead}`);
              results.skipped++;
            }
          } catch (error: any) {
            console.error(`❌ Erro inesperado ao processar ${lead.nome_lead}:`, error);
            results.failed++;
            results.errors.push(`${lead.nome_lead}: ${error.message}`);
          }
        })
      );

      // Aguardar um pouco entre lotes para não sobrecarregar a API
      if (i + batchSize < leads.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log('✅ Sincronização completa!', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sincronização concluída',
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Erro na função sync-all-profile-pictures:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
