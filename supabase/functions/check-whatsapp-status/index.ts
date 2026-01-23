import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-customer-id',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { instance_name } = await req.json();

    if (!instance_name) {
      console.error('Missing instance_name');
      return new Response(
        JSON.stringify({ error: 'instance_name é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Verificando status da instância: ${instance_name}`);

    // Verificar se a instância existe no banco
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('instance_name', instance_name)
      .single();

    if (instanceError || !instanceData) {
      console.error('Instância não encontrada no banco:', instanceError);
      return new Response(
        JSON.stringify({ error: 'Instância não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Chamar a Evolution API para obter o status real
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || '';

    console.log('🔍 Verificando variáveis de ambiente...');
    console.log('EVOLUTION_API_URL presente:', !!evolutionApiUrl, 'valor:', evolutionApiUrl ? evolutionApiUrl.substring(0, 30) + '...' : 'VAZIO');
    console.log('EVOLUTION_API_KEY presente:', !!evolutionApiKey, 'tamanho:', evolutionApiKey ? evolutionApiKey.length : 0);

    // Validar e corrigir URL da Evolution API
    if (!evolutionApiUrl || evolutionApiUrl.trim() === '' || !/^https?:\/\//.test(evolutionApiUrl)) {
      console.log('⚠️ EVOLUTION_API_URL inválida ou vazia. Usando URL padrão.');
      evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
    }

    if (!evolutionApiKey || evolutionApiKey.trim() === '') {
      console.error('❌ EVOLUTION_API_KEY não configurada ou vazia');
      return new Response(
        JSON.stringify({ 
          error: 'Credenciais da Evolution API não configuradas',
          details: 'A chave de API da Evolution não foi encontrada nos secrets do Supabase. Verifique a configuração.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Credenciais da Evolution API validadas');
    console.log('Evolution API URL original:', evolutionApiUrl);

    // Limpar a URL base: remover /manager e trailing slashes
    evolutionApiUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/+$/, '').trim();
    
    console.log('Evolution API URL limpa:', evolutionApiUrl);

    // Construir a URL completa - usando o endpoint correto da Evolution API v2
    const statusUrl = `${evolutionApiUrl}/instance/connectionState/${instance_name}`;
    
    console.log(`🌐 URL final para Evolution API: ${statusUrl}`);

    let evolutionResponse;
    try {
      evolutionResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      console.error('❌ Erro de rede ao conectar com Evolution API:', fetchError);
      return new Response(
        JSON.stringify({ 
          error: 'Não foi possível conectar com a Evolution API',
          details: 'A API pode estar fora do ar ou inacessível. Tente novamente em alguns minutos.',
          status: 'DISCONNECTED'
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!evolutionResponse.ok) {
      console.error(`Evolution API retornou erro ${evolutionResponse.status}`);
      
      // Se retornar 404, a instância não existe na Evolution API - deletar registro órfão
      if (evolutionResponse.status === 404) {
        console.log('🗑️ Instância não existe na Evolution API - deletando registro órfão do banco');
        
        // Deletar o registro órfão do banco de dados
        const { error: deleteError } = await supabase
          .from('whatsapp_instances')
          .delete()
          .eq('instance_name', instance_name);
          
        if (!deleteError) {
          console.log('✅ Registro órfão deletado do banco de dados');
        } else {
          console.error('❌ Erro ao deletar registro órfão:', deleteError);
        }

        return new Response(
          JSON.stringify({ 
            status: 'DISCONNECTED',
            message: 'Instância não encontrada na Evolution API - registro removido',
            deleted: true
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const errorText = await evolutionResponse.text();
      console.error('Evolution API error:', errorText);
      
      return new Response(
        JSON.stringify({ error: 'Erro ao verificar status na Evolution API' }),
        { status: evolutionResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tentar fazer parse do JSON da resposta
    let evolutionData;
    try {
      const responseText = await evolutionResponse.text();
      console.log('Evolution API raw response (primeiros 300 chars):', responseText.substring(0, 300));
      
      // Verificar se a resposta é HTML (página de erro)
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.error('Evolution API retornou HTML em vez de JSON. A URL ou endpoint podem estar incorretos.');
        
        // CRÍTICO: NÃO sobrescrever se já está CONNECTED
        await supabase
          .from('whatsapp_instances')
          .update({ 
            status: 'DISCONNECTED',
            updated_at: new Date().toISOString()
          })
          .eq('instance_name', instance_name)
          .neq('status', 'CONNECTED'); // NÃO sobrescrever CONNECTED

        return new Response(
          JSON.stringify({ 
            status: 'DISCONNECTED',
            message: 'Não foi possível verificar o status. A Evolution API pode estar com problemas.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      evolutionData = JSON.parse(responseText);
      console.log('Evolution API parsed response:', JSON.stringify(evolutionData, null, 2));
    } catch (parseError) {
      console.error('Erro ao fazer parse da resposta da Evolution API:', parseError);
      
      // CRÍTICO: NÃO sobrescrever se já está CONNECTED
      await supabase
        .from('whatsapp_instances')
        .update({ 
          status: 'DISCONNECTED',
          updated_at: new Date().toISOString()
        })
        .eq('instance_name', instance_name)
        .neq('status', 'CONNECTED'); // NÃO sobrescrever CONNECTED

      return new Response(
        JSON.stringify({ 
          status: 'DISCONNECTED',
          message: 'Não foi possível verificar o status'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('Evolution API response:', evolutionData);

    // Mapear o estado da Evolution API para o nosso status
    let newStatus = 'DISCONNECTED';
    
    // A Evolution API pode retornar diferentes formatos de resposta
    const state = evolutionData.instance?.state || evolutionData.state || '';
    
    if (state === 'open' || state === 'CONNECTED') {
      newStatus = 'CONNECTED';
    } else if (state === 'connecting' || state === 'qr') {
      newStatus = 'WAITING_QR';
    } else {
      newStatus = 'DISCONNECTED';
    }

    console.log(`Status mapeado: ${state} -> ${newStatus}`);

    // Atualizar o status no banco de dados
    const updateData: any = { 
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    // Se conectado, atualizar connected_at
    if (newStatus === 'CONNECTED' && !instanceData.connected_at) {
      updateData.connected_at = new Date().toISOString();
    }

    // CRÍTICO: Se estamos tentando atualizar para DISCONNECTED, não sobrescrever CONNECTED
    const updateQuery = supabase
      .from('whatsapp_instances')
      .update(updateData)
      .eq('instance_name', instance_name);
    
    // Se o novo status é DISCONNECTED, não sobrescrever CONNECTED
    if (newStatus === 'DISCONNECTED') {
      updateQuery.neq('status', 'CONNECTED');
    }
    
    const { error: updateError } = await updateQuery;

    if (updateError) {
      console.error('Erro ao atualizar status no banco:', updateError);
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar status no banco de dados' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Status atualizado com sucesso para: ${newStatus}`);

    return new Response(
      JSON.stringify({ 
        status: newStatus,
        message: 'Status verificado e atualizado com sucesso'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-whatsapp-status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
