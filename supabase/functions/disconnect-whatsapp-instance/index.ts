import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getEvolutionApiUrl, getEvolutionApiKey, createSupabaseAdmin } from "../_shared/evolution-config.ts";
import { canManageWhatsAppInstance } from "../_shared/can-manage-whatsapp-instance.ts";

const failure = (status: number, error: string) => new Response(
  JSON.stringify({ success: false, error }),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
);

interface DisconnectInstanceRequest {
  instanceId: string;
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
      return failure(401, 'Sessão ausente. Entre novamente para desconectar o canal.');
    }

    const supabase = createSupabaseAdmin();

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return failure(401, 'Sessão inválida ou expirada. Entre novamente.');
    }

    // Parse request body
    const body = await req.json().catch(() => null) as DisconnectInstanceRequest | null;
    const instanceId = body?.instanceId;

    if (typeof instanceId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(instanceId)) {
      return failure(400, 'Informe um identificador válido para o canal.');
    }

    console.log('Disconnecting instance for user:', user.id, 'Instance ID:', instanceId);

    // Get instance from database
    const { data: instance, error: fetchError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instanceId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!instance) {
      return failure(404, 'Canal não encontrado. Atualize a lista de canais.');
    }
    if (!await canManageWhatsAppInstance(supabase, user.id, instance)) {
      return failure(403, 'Você não tem permissão para gerenciar as integrações deste canal.');
    }

    // Get Evolution API credentials
    const baseUrl = getEvolutionApiUrl();
    const evolutionApiKey = getEvolutionApiKey();

    console.log('Disconnecting from Evolution API:', baseUrl);
    console.log('Instance name:', instance.instance_name);

    // STEP 1: Logout from Evolution API
    try {
      console.log('🔓 Logging out instance:', instance.instance_name);
      const logoutResponse = await fetch(`${baseUrl}/instance/logout/${encodeURIComponent(instance.instance_name)}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
      });

      if (logoutResponse.ok) {
        console.log('✅ Instance logged out successfully');
      } else {
        console.warn('⚠️ Logout failed:', logoutResponse.status);
      }
    } catch (logoutError) {
      console.warn('⚠️ Error during logout:', logoutError);
      // Continue to delete even if logout fails
    }

    // STEP 2: Delete instance from Evolution API (best-effort).
    // Antes: throw new Error em qualquer non-2xx — incluindo 404 (instancia
    // ja nao existe na Evolution API por algum cleanup background) — fazia
    // o canal ficar "fantasma" no banco e o usuario via "Erro ao desconectar"
    // sem conseguir remover a linha. Agora logamos e seguimos para o DELETE
    // do banco assim mesmo. A permissao de gerenciar o canal ja foi
    // validada acima antes de qualquer chamada externa.
    console.log('🗑️ Deleting instance from Evolution API:', instance.instance_name);
    let evolutionData: any = null;
    let evolutionDeleteWarning: string | null = null;
    try {
      const deleteResponse = await fetch(`${baseUrl}/instance/delete/${encodeURIComponent(instance.instance_name)}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
      });

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text().catch(() => 'unknown');
        evolutionDeleteWarning = `Evolution API ${deleteResponse.status}: ${errorText}`;
        console.warn(`⚠️ Evolution API delete falhou (${deleteResponse.status}) — prosseguindo com delete no banco. Body: ${errorText}`);
      } else {
        evolutionData = await deleteResponse.json().catch(() => null);
        console.log('✅ Evolution API delete response:', evolutionData);
      }
    } catch (evoErr) {
      evolutionDeleteWarning = (evoErr as Error)?.message || 'fetch failed';
      console.warn('⚠️ Excecao ao chamar Evolution API delete — prosseguindo com delete no banco:', evoErr);
    }

    // STEP 3: Delete instance from database (sempre roda, mesmo se Evolution falhou)
    const { error: deleteError } = await supabase
      .from('whatsapp_instances')
      .delete()
      .eq('id', instanceId);

    if (deleteError) {
      console.error('Database delete error:', deleteError);
      throw new Error(`Database error: ${deleteError.message}`);
    }

    console.log('✅ Instance deleted successfully from database:', instanceId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Instance deleted successfully',
        evolutionData: evolutionData,
        evolutionDeleteWarning,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error('Error in disconnect-whatsapp-instance:', error);
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
