import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error('Evolution API credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Evolution API não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const statusUrl = `${evolutionApiUrl}/instance/connectionState/${instance_name}`;
    console.log(`Chamando Evolution API: ${statusUrl}`);

    const evolutionResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!evolutionResponse.ok) {
      console.error(`Evolution API retornou erro ${evolutionResponse.status}`);
      
      // Se retornar 404, a instância não existe na Evolution API
      if (evolutionResponse.status === 404) {
        await supabase
          .from('whatsapp_instances')
          .update({ 
            status: 'DISCONNECTED',
            updated_at: new Date().toISOString()
          })
          .eq('instance_name', instance_name);

        return new Response(
          JSON.stringify({ 
            status: 'DISCONNECTED',
            message: 'Instância não encontrada na Evolution API'
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

    const evolutionData = await evolutionResponse.json();
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

    const { error: updateError } = await supabase
      .from('whatsapp_instances')
      .update(updateData)
      .eq('instance_name', instance_name);

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
