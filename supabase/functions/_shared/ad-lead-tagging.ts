// ============================================================
// Ad Lead Tagging Helper
// ============================================================
// Avalia se um lead recém-criado deve receber a tag "Lead de anúncio"
// com base na rule de tracking do canal WhatsApp pelo qual chegou.
//
// Regras:
// - Lê whatsapp_tracking_rules pelo whatsapp_instance_id.
// - Se rule não existe, está desabilitada, ou keywords vazias -> não tagueia.
// - Extrai texto da mensagem (priority chain: conversation > extendedText.text > captions).
// - Normaliza (lowercase + NFD + remove combining marks).
// - Match mode 'any': testa cada keyword normalizada com String.includes.
// - Se match: cria a tag "Lead de anúncio" se não existe, associa ao lead.
//
// Falhas dentro do helper retornam {tagged: false, reason}; nunca throw.
// O caller (webhook) NÃO deve bloquear o fluxo principal por causa disso.
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

interface MaybeApplyAdLeadTagArgs {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
  instanceId: string;
  messageInfo: any; // payload data.message do Evolution
}

interface MaybeApplyAdLeadTagResult {
  tagged: boolean;
  reason?:
    | 'no_active_rule'
    | 'empty_keywords'
    | 'empty_text'
    | 'no_match'
    | 'tag_create_failed'
    | 'assign_failed'
    | 'rule_query_failed';
}

const TAG_NAME = 'Lead de anúncio';
const TAG_COLOR = '#FB923C';

/**
 * Normaliza string para comparação case+accent insensitive.
 * Range U+0300-U+036F cobre combining diacritical marks
 * que aparecem após NFD decomposition.
 */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Extrai texto utilizável da mensagem (priority chain).
 * Mídia sem caption retorna string vazia.
 */
function extractText(messageInfo: any): string {
  if (!messageInfo) return '';
  return (
    messageInfo.conversation
    || messageInfo.extendedTextMessage?.text
    || messageInfo.imageMessage?.caption
    || messageInfo.videoMessage?.caption
    || messageInfo.documentMessage?.caption
    || ''
  );
}

export async function maybeApplyAdLeadTag(
  args: MaybeApplyAdLeadTagArgs
): Promise<MaybeApplyAdLeadTagResult> {
  const { supabase, organizationId, leadId, instanceId, messageInfo } = args;

  // 1) Lê rule do canal
  const { data: rule, error: ruleErr } = await supabase
    .from('whatsapp_tracking_rules')
    .select('enabled, keywords, match_mode, case_sensitive')
    .eq('whatsapp_instance_id', instanceId)
    .maybeSingle();

  if (ruleErr) {
    console.warn('⚠️ [ad-tag] erro ao ler rule:', ruleErr);
    return { tagged: false, reason: 'rule_query_failed' };
  }

  if (!rule || !rule.enabled) {
    return { tagged: false, reason: 'no_active_rule' };
  }

  if (!rule.keywords || rule.keywords.length === 0) {
    return { tagged: false, reason: 'empty_keywords' };
  }

  // 2) Extrai texto
  const text = extractText(messageInfo);
  if (!text.trim()) {
    return { tagged: false, reason: 'empty_text' };
  }

  // 3) Normaliza + match
  const haystack = normalize(text);
  const needles = (rule.keywords as string[])
    .map(normalize)
    .filter(n => n.length > 0);

  // v1: match_mode === 'any' (qualquer keyword bate)
  // Schema preparado pra 'all' e 'exact_phrase' mas UI v1 só expõe 'any'.
  const matched = needles.some(n => haystack.includes(n));

  if (!matched) {
    return { tagged: false, reason: 'no_match' };
  }

  // 4) Resolve (ou cria) tag "Lead de anúncio"
  let { data: tag } = await supabase
    .from('lead_tags')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('name', TAG_NAME)
    .maybeSingle();

  if (!tag) {
    const { data: created, error: createErr } = await supabase
      .from('lead_tags')
      .insert({
        organization_id: organizationId,
        name: TAG_NAME,
        color: TAG_COLOR,
      })
      .select('id')
      .single();

    if (createErr || !created) {
      console.warn('⚠️ [ad-tag] falha criar tag:', createErr);
      return { tagged: false, reason: 'tag_create_failed' };
    }
    tag = created;
  }

  // 5) Associa tag ao lead (idempotente: 23505 é OK)
  const { error: assignErr } = await supabase
    .from('lead_tag_assignments')
    .insert({
      lead_id: leadId,
      tag_id: tag.id,
    });

  if (assignErr && (assignErr as any)?.code !== '23505') {
    console.warn('⚠️ [ad-tag] falha associar tag:', assignErr);
    return { tagged: false, reason: 'assign_failed' };
  }

  console.log(`🎯 [ad-tag] lead ${leadId} taggeado como ${TAG_NAME} (canal ${instanceId})`);
  return { tagged: true };
}
