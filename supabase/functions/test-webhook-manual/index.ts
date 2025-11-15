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
    console.log('🧪 TESTE MANUAL - Criando lead de teste...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar instância conectada
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('user_id')
      .eq('status', 'CONNECTED')
      .single();

    if (!instance) {
      throw new Error('Nenhuma instância conectada');
    }

    console.log('✅ Instância encontrada:', instance.user_id);

    // Buscar organization
    const { data: orgId } = await supabase
      .rpc('get_user_organization_id', { _user_id: instance.user_id });

    console.log('✅ Organization ID:', orgId);

    // Criar lead de teste
    const testPhone = `5511${Math.floor(Math.random() * 100000000)}`;
    
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        telefone_lead: testPhone,
        nome_lead: 'TESTE - Lead Manual',
        organization_id: orgId,
        source: 'WhatsApp',
        stage: 'novo',
        last_message_at: new Date().toISOString()
      })
      .select()
      .single();

    if (leadError) {
      console.error('❌ Erro ao criar lead:', leadError);
      throw leadError;
    }

    console.log('✅ Lead criado:', lead.id);

    // Criar mensagem de teste
    const { data: message, error: messageError } = await supabase
      .from('mensagens_chat')
      .insert({
        id_lead: lead.id,
        corpo_mensagem: 'Olá! Esta é uma mensagem de teste do sistema.',
        direcao: 'RECEBIDA',
        data_hora: new Date().toISOString(),
        status_entrega: 'DELIVERED'
      })
      .select()
      .single();

    if (messageError) {
      console.error('❌ Erro ao criar mensagem:', messageError);
      throw messageError;
    }

    console.log('✅ Mensagem criada:', message.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Lead e mensagem de teste criados com sucesso!',
        data: {
          leadId: lead.id,
          leadPhone: testPhone,
          messageId: message.id
        }
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
