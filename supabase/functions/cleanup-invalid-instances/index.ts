import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getEvolutionApiUrl, getEvolutionApiKey, createSupabaseAdmin } from "../_shared/evolution-config.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧹 LIMPANDO INSTÂNCIAS INVÁLIDAS');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createSupabaseAdmin();

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Invalid authorization token');
    }

    // Buscar todas as instâncias do usuário no banco
    const { data: dbInstances, error: dbError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', user.id);

    if (dbError) {
      throw dbError;
    }

    if (!dbInstances || dbInstances.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Nenhuma instância encontrada no banco de dados',
          cleaned: 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    console.log(`📋 Encontradas ${dbInstances.length} instâncias no banco`);

    // Ler URL e API key da Evolution API
    const evolutionApiUrl = getEvolutionApiUrl();
    const evolutionApiKey = getEvolutionApiKey();

    // Buscar todas as instâncias na Evolution API
    const fetchResponse = await fetch(`${evolutionApiUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    if (!fetchResponse.ok) {
      throw new Error(`Erro ao buscar instâncias: ${fetchResponse.status}`);
    }

    const apiInstances = await fetchResponse.json();
    const apiInstanceNames = new Set(
      Array.isArray(apiInstances) 
        ? apiInstances.map((inst: any) => inst.instance?.instanceName).filter(Boolean)
        : []
    );

    console.log(`📋 Encontradas ${apiInstanceNames.size} instâncias na Evolution API`);

    // Verificar quais instâncias do banco não existem mais na API
    const invalidInstances = dbInstances.filter(
      dbInst => !apiInstanceNames.has(dbInst.instance_name)
    );

    if (invalidInstances.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Todas as instâncias estão válidas',
          cleaned: 0,
          total: dbInstances.length
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    console.log(`🗑️ Removendo ${invalidInstances.length} instâncias inválidas`);

    // Deletar instâncias inválidas do banco
    const instanceIds = invalidInstances.map(inst => inst.id);
    const { error: deleteError } = await supabase
      .from('whatsapp_instances')
      .delete()
      .in('id', instanceIds);

    if (deleteError) {
      throw deleteError;
    }

    const deletedNames = invalidInstances.map(inst => inst.instance_name);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${invalidInstances.length} instância(s) inválida(s) removida(s)`,
        cleaned: invalidInstances.length,
        total: dbInstances.length,
        deletedInstances: deletedNames
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ ERRO:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
