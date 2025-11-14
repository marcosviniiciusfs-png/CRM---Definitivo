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
    const { instance_name } = await req.json();
    
    if (!instance_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'instance_name é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🔄 Iniciando sincronização de contatos para: ${instance_name}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificar se a instância existe e está conectada
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('instance_name', instance_name)
      .single();

    if (instanceError || !instance) {
      console.error('❌ Instância não encontrada:', instanceError);
      return new Response(
        JSON.stringify({ success: false, error: 'Instância não encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (instance.status !== 'CONNECTED') {
      console.log('⚠️ Instância não está conectada');
      return new Response(
        JSON.stringify({ success: false, error: 'Instância não está conectada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Obter credenciais da Evolution API
    const { data: config } = await supabase
      .from('app_config')
      .select('config_value')
      .in('config_key', ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY'])
      .throwOnError();

    const evolutionApiUrl = config?.find(c => c.config_value.includes('http'))?.config_value;
    const evolutionApiKey = config?.find(c => !c.config_value.includes('http'))?.config_value;

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error('❌ Credenciais da Evolution API não configuradas');
      return new Response(
        JSON.stringify({ success: false, error: 'Credenciais da Evolution API não configuradas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Buscar todos os contatos da Evolution API
    console.log(`📞 Buscando contatos da Evolution API...`);
    const contactsResponse = await fetch(
      `${evolutionApiUrl}/chat/findContacts/${instance_name}`,
      {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!contactsResponse.ok) {
      console.error('❌ Erro ao buscar contatos:', await contactsResponse.text());
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar contatos da Evolution API' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const contactsData = await contactsResponse.json();
    console.log(`✅ ${contactsData.length} contatos encontrados`);

    // Obter o organization_id do usuário
    const { data: orgData } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', instance.user_id)
      .single();

    const organization_id = orgData?.organization_id;

    if (!organization_id) {
      console.error('❌ Organização não encontrada para o usuário');
      return new Response(
        JSON.stringify({ success: false, error: 'Organização não encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Processar cada contato
    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const contact of contactsData) {
      try {
        // Extrair número de telefone
        const phoneNumber = contact.id?.replace('@s.whatsapp.net', '') || 
                           contact.pushName || 
                           contact.number;
        
        if (!phoneNumber) {
          console.log('⚠️ Contato sem número:', contact);
          errorCount++;
          continue;
        }

        // Nome do contato
        const contactName = contact.pushName || 
                          contact.name || 
                          contact.notify || 
                          phoneNumber;

        console.log(`📝 Processando: ${contactName} (${phoneNumber})`);

        // Verificar se o lead já existe
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id, updated_at')
          .eq('telefone_lead', phoneNumber)
          .eq('organization_id', organization_id)
          .maybeSingle();

        if (existingLead) {
          // Atualizar lead existente
          const { error: updateError } = await supabase
            .from('leads')
            .update({
              nome_lead: contactName,
              source: 'WhatsApp',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingLead.id);

          if (updateError) {
            console.error(`❌ Erro ao atualizar lead ${phoneNumber}:`, updateError);
            errorCount++;
          } else {
            console.log(`✅ Lead atualizado: ${contactName}`);
            updatedCount++;
          }
        } else {
          // Criar novo lead
          const { error: insertError } = await supabase
            .from('leads')
            .insert({
              telefone_lead: phoneNumber,
              nome_lead: contactName,
              source: 'WhatsApp',
              stage: 'NOVO',
              organization_id: organization_id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

          if (insertError) {
            console.error(`❌ Erro ao criar lead ${phoneNumber}:`, insertError);
            errorCount++;
          } else {
            console.log(`✅ Lead criado: ${contactName}`);
            createdCount++;
          }
        }
      } catch (error) {
        console.error('❌ Erro ao processar contato:', error);
        errorCount++;
      }
    }

    console.log(`\n📊 Sincronização concluída:`);
    console.log(`   ✅ Criados: ${createdCount}`);
    console.log(`   🔄 Atualizados: ${updatedCount}`);
    console.log(`   ❌ Erros: ${errorCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sincronização concluída',
        stats: {
          created: createdCount,
          updated: updatedCount,
          errors: errorCount,
          total: contactsData.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('❌ Erro na sincronização:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro interno do servidor',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
