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
    console.log('🧹 LIMPANDO INSTÂNCIAS INVÁLIDAS');

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
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

    // Correção crítica: garantir que evolutionApiUrl seja uma URL válida
    if (!evolutionApiUrl || !/^https?:\/\//.test(evolutionApiUrl)) {
      console.log('⚠️ EVOLUTION_API_URL inválida ou ausente. Valor atual:', evolutionApiUrl);
      // Fallback seguro para a URL informada pelo usuário
      evolutionApiUrl = 'http://161.97.148.99:8080';
      console.log('🔧 Usando URL padrão da Evolution API:', evolutionApiUrl);
    }

    // Limpar URL base
    let cleanEvolutionUrl = evolutionApiUrl
      .replace(/\/+$/, '')
      .replace(/\/manager\/?$/g, '')
      .replace(/\/\//g, '/');
    
    cleanEvolutionUrl = cleanEvolutionUrl.replace(/:\/$/, '://');

    // Buscar todas as instâncias na Evolution API
    const fetchResponse = await fetch(`${cleanEvolutionUrl}/instance/fetchInstances`, {
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
