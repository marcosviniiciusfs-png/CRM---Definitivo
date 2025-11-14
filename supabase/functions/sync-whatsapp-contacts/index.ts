import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔄 Iniciando sincronização de contatos para: ${instance_name}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Verificar se a instância existe e está conectada
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('instance_name', instance_name)
      .single();

    if (instanceError || !instance) {
      console.error('❌ Instância não encontrada:', instanceError);
      return new Response(
        JSON.stringify({ success: false, error: 'Instância não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (instance.status !== 'CONNECTED') {
      console.log(`⚠️  Instância ${instance_name} não está conectada (status: ${instance.status})`);
      return new Response(
        JSON.stringify({ success: false, error: 'Instância não está conectada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Obter credenciais da Evolution API
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    let evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      const { data: config } = await supabase
        .from('app_config')
        .select('config_key, config_value')
        .in('config_key', ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY']);

      if (config) {
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
      console.error('❌ Credenciais da Evolution API não configuradas');
      return new Response(
        JSON.stringify({ success: false, error: 'Evolution API não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limpar URL
    evolutionApiUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '').trim();

    // 3. Buscar contatos da Evolution API
    // Endpoint: GET /chat/findChats/{instanceName}
    const chatsUrl = `${evolutionApiUrl}/chat/findChats/${instance_name}`;
    
    console.log(`📞 Buscando chats em: ${chatsUrl}`);

    const chatsResponse = await fetch(chatsUrl, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!chatsResponse.ok) {
      const errorText = await chatsResponse.text();
      console.error('❌ Erro ao buscar chats:', chatsResponse.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar contatos da Evolution API' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const chatsData = await chatsResponse.json();
    console.log(`📊 Resposta da Evolution API:`, JSON.stringify(chatsData).substring(0, 200));

    // 4. Determinar organization_id baseado no user_id da instância
    const { data: orgData } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', instance.user_id)
      .single();

    const organizationId = orgData?.organization_id;

    if (!organizationId) {
      console.error('❌ Organization ID não encontrado para user:', instance.user_id);
      return new Response(
        JSON.stringify({ success: false, error: 'Organização não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Processar contatos
    let created = 0;
    let updated = 0;
    let errors = 0;

    // A resposta pode vir em diferentes formatos
    const contacts = Array.isArray(chatsData) ? chatsData : (chatsData.chats || []);

    console.log(`📋 Processando ${contacts.length} chats...`);

    for (const contact of contacts) {
      try {
        // Extrair telefone - pode estar em diferentes campos
        let phoneNumber = contact.id || contact.remoteJid || contact.phoneNumber;
        
        if (!phoneNumber) {
          console.warn('⚠️  Contato sem telefone, pulando:', JSON.stringify(contact).substring(0, 100));
          continue;
        }

        // Limpar número: remover @s.whatsapp.net, @g.us, etc
        phoneNumber = phoneNumber.replace(/@.*$/, '');

        // Ignorar grupos
        if (phoneNumber.includes('-') || contact.isGroup) {
          continue;
        }

        // Extrair nome
        const contactName = contact.name || 
                           contact.pushName || 
                           contact.verifiedName || 
                           contact.displayName ||
                           phoneNumber;

        console.log(`📞 Processando: ${contactName} (${phoneNumber})`);

        // Verificar se o lead já existe
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('telefone_lead', phoneNumber)
          .eq('organization_id', organizationId)
          .single();

        if (existingLead) {
          // Atualizar lead existente
          const { error: updateError } = await supabase
            .from('leads')
            .update({
              nome_lead: contactName,
              source: 'WhatsApp',
              updated_at: new Date().toISOString()
            })
            .eq('id', existingLead.id);

          if (updateError) {
            console.error(`❌ Erro ao atualizar lead ${phoneNumber}:`, updateError);
            errors++;
          } else {
            console.log(`✅ Lead atualizado: ${contactName}`);
            updated++;
          }
        } else {
          // Criar novo lead
          const { error: insertError } = await supabase
            .from('leads')
            .insert({
              nome_lead: contactName,
              telefone_lead: phoneNumber,
              source: 'WhatsApp',
              stage: 'NOVO',
              organization_id: organizationId,
            });

          if (insertError) {
            console.error(`❌ Erro ao criar lead ${phoneNumber}:`, insertError);
            errors++;
          } else {
            console.log(`✅ Lead criado: ${contactName}`);
            created++;
          }
        }
      } catch (contactError) {
        console.error('❌ Erro ao processar contato:', contactError);
        errors++;
      }
    }

    const stats = { created, updated, errors, total: contacts.length };
    console.log(`✨ Sincronização concluída:`, stats);

    return new Response(
      JSON.stringify({ success: true, stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('❌ Erro na sincronização:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
