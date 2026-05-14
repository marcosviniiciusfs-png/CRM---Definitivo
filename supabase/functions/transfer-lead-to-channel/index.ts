import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";

interface TransferRequestBody {
  lead_id: string;
  target_instance_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header missing' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuario nao autenticado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const body: TransferRequestBody = await req.json();
    const { lead_id, target_instance_id } = body;

    if (!lead_id || !target_instance_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'lead_id e target_instance_id sao obrigatorios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, organization_id, whatsapp_instance_id, nome_lead')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lead nao encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    const { data: orgMember } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', lead.organization_id)
      .maybeSingle();

    if (!orgMember) {
      return new Response(
        JSON.stringify({ success: false, error: 'User nao pertence a essa org' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const isOwnerAdmin = orgMember.role === 'owner' || orgMember.role === 'admin';

    const { data: targetInstance, error: targetError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, organization_id, status, channel_name, instance_name')
      .eq('id', target_instance_id)
      .single();

    if (targetError || !targetInstance) {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal alvo nao encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (targetInstance.organization_id !== lead.organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal alvo eh de outra org' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    if (targetInstance.status !== 'CONNECTED') {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal alvo nao esta conectado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Identificar canal de origem da transferencia.
    // Owner/admin: usa o lead.whatsapp_instance_id (canal "principal").
    // Member: intersecao entre WCMs do user e memberships do lead.
    let sourceInstanceId: string | null = null;

    if (isOwnerAdmin) {
      sourceInstanceId = lead.whatsapp_instance_id || null;
    } else {
      const { data: userChannels } = await supabaseAdmin
        .from('whatsapp_channel_members')
        .select('whatsapp_instance_id')
        .eq('user_id', user.id)
        .eq('organization_id', lead.organization_id);

      const { data: leadMemberships } = await supabaseAdmin
        .from('lead_channel_memberships')
        .select('whatsapp_instance_id')
        .eq('lead_id', lead_id);

      const userChannelSet = new Set((userChannels || []).map((r: any) => r.whatsapp_instance_id));
      const leadChannelSet = new Set((leadMemberships || []).map((r: any) => r.whatsapp_instance_id));
      const intersection = [...leadChannelSet].filter((id: any) => userChannelSet.has(id));

      if (intersection.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sem permissao para transferir esse lead' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { data: pickSource } = await supabaseAdmin
        .from('lead_channel_memberships')
        .select('whatsapp_instance_id, last_message_at')
        .eq('lead_id', lead_id)
        .in('whatsapp_instance_id', intersection)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      sourceInstanceId = pickSource?.whatsapp_instance_id || intersection[0];
    }

    if (!sourceInstanceId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nao foi possivel determinar canal de origem' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (sourceInstanceId === target_instance_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal de origem e alvo sao iguais' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { data: existingMembership } = await supabaseAdmin
      .from('lead_channel_memberships')
      .select('lead_id')
      .eq('lead_id', lead_id)
      .eq('whatsapp_instance_id', target_instance_id)
      .maybeSingle();

    if (existingMembership) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lead ja esta nesse canal' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      );
    }

    const transferredAt = new Date().toISOString();
    const { error: insertError } = await supabaseAdmin
      .from('lead_channel_memberships')
      .insert({
        lead_id: lead_id,
        whatsapp_instance_id: target_instance_id,
        organization_id: lead.organization_id,
        source: 'transferred',
        transferred_from_instance_id: sourceInstanceId,
        transferred_at: transferredAt,
        transferred_by_user_id: user.id,
        last_message_at: transferredAt,
      });

    if (insertError) {
      console.error('Erro ao inserir membership transferida:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id,
        target_instance_id,
        source_instance_id: sourceInstanceId,
        transferred_at: transferredAt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    console.error('Erro inesperado:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Erro desconhecido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
