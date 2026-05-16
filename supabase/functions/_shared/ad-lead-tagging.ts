// ============================================================
// Ad Lead Tagging Helper
// ============================================================
// Avalia se um lead recém-criado deve receber a tag "Lead de anúncio"
// com base na rule de tracking do canal WhatsApp pelo qual chegou.
//
// Regras (em ordem):
// 1. Lê whatsapp_tracking_rules pelo whatsapp_instance_id.
// 2. Tenta match por keyword (existente).
// 3. NOVO: Se keyword não bateu E rule.detect_unknown_contacts=true,
//    consulta Evolution API /chat/findContacts pra checar se o número
//    está nos contatos do aparelho do canal. Se não está (ou isMyContact
//    é false / ausente), tagueia com matched_keyword='__unknown_contact__'.
//
// Falhas dentro do helper retornam {tagged: false, reason}; nunca throw.
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { getEvolutionApiUrl, getEvolutionApiKey } from "./evolution-config.ts";

interface MaybeApplyAdLeadTagArgs {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
  instanceId: string;
  instanceName: string;        // NOVO — para chamada na Evolution API
  senderJid: string;           // NOVO — formato @s.whatsapp.net
  messageInfo: any;
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
    | 'rule_query_failed'
    | 'unknown_contact_check_failed'
    | 'contact_known';
}

const TAG_NAME = 'Lead de anúncio';
const TAG_COLOR = '#FB923C';
const UNKNOWN_CONTACT_SENTINEL = '__unknown_contact__';
const EVOLUTION_TIMEOUT_MS = 5000;

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

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

/**
 * Consulta Evolution API /chat/findContacts pra verificar se o número
 * (senderJid) está nos contatos do aparelho do canal (instanceName).
 *
 * Retorna:
 *  - 'unknown'  — número não encontrado OU encontrado com isMyContact=false
 *                 OU encontrado sem campo isMyContact (conservador-positivo
 *                 pra admin que opt-ou explicitamente)
 *  - 'known'    — encontrado com isMyContact=true
 *  - 'error'    — timeout, HTTP error, parse error
 */
async function checkContactKnown(
  instanceName: string,
  senderJid: string
): Promise<'unknown' | 'known' | 'error'> {
  let url: string;
  let apiKey: string;
  try {
    url = getEvolutionApiUrl();
    apiKey = getEvolutionApiKey();
  } catch (e) {
    console.warn('⚠️ [ad-tag] Evolution config indisponivel:', e);
    return 'error';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EVOLUTION_TIMEOUT_MS);

  try {
    const resp = await fetch(`${url}/chat/findContacts/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({ where: { remoteJid: senderJid } }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.warn(`⚠️ [ad-tag] findContacts HTTP ${resp.status}`);
      return 'error';
    }

    const data = await resp.json();
    const arr = Array.isArray(data) ? data : [];

    if (arr.length === 0) return 'unknown';

    const contact = arr[0];
    if (typeof contact?.isMyContact === 'boolean') {
      return contact.isMyContact ? 'known' : 'unknown';
    }
    // Campo ausente → opt-in admin é explícito, trata como desconhecido
    return 'unknown';
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('⚠️ [ad-tag] findContacts erro:', err);
    return 'error';
  }
}

/**
 * Cria/encontra tag e associa ao lead. Idempotente (23505 OK).
 * Retorna true se sucesso, false se falha.
 */
async function applyTagAndLog(
  supabase: SupabaseClient,
  organizationId: string,
  leadId: string,
  instanceId: string,
  matchedKeyword: string
): Promise<MaybeApplyAdLeadTagResult> {
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

  // Log do match
  const { error: logErr } = await supabase
    .from('tracking_match_log')
    .insert({
      lead_id: leadId,
      whatsapp_instance_id: instanceId,
      organization_id: organizationId,
      matched_keyword: matchedKeyword,
    });

  if (logErr) {
    console.warn('⚠️ [ad-tag] falha logar match (nao bloqueia):', logErr);
  }

  console.log(`🎯 [ad-tag] lead ${leadId} taggeado como ${TAG_NAME} (canal ${instanceId}, keyword="${matchedKeyword}")`);
  return { tagged: true };
}

export async function maybeApplyAdLeadTag(
  args: MaybeApplyAdLeadTagArgs
): Promise<MaybeApplyAdLeadTagResult> {
  const { supabase, organizationId, leadId, instanceId, instanceName, senderJid, messageInfo } = args;

  // 1) Lê rule do canal
  const { data: rule, error: ruleErr } = await supabase
    .from('whatsapp_tracking_rules')
    .select('enabled, keywords, match_mode, case_sensitive, detect_unknown_contacts')
    .eq('whatsapp_instance_id', instanceId)
    .maybeSingle();

  if (ruleErr) {
    console.warn('⚠️ [ad-tag] erro ao ler rule:', ruleErr);
    return { tagged: false, reason: 'rule_query_failed' };
  }

  if (!rule || !rule.enabled) {
    return { tagged: false, reason: 'no_active_rule' };
  }

  // 2) Match por keyword (primeiro caminho)
  const text = extractText(messageInfo);
  const haystack = text.trim() ? normalize(text) : '';

  if (rule.keywords && rule.keywords.length > 0 && haystack) {
    const matchedKeywordRaw = (rule.keywords as string[]).find(k => {
      const n = normalize(k);
      return n.length > 0 && haystack.includes(n);
    });

    if (matchedKeywordRaw) {
      return await applyTagAndLog(supabase, organizationId, leadId, instanceId, matchedKeywordRaw);
    }
  }

  // 3) NOVO: detect_unknown_contacts — fallback se keyword não bateu
  if (rule.detect_unknown_contacts && senderJid) {
    const status = await checkContactKnown(instanceName, senderJid);

    if (status === 'unknown') {
      return await applyTagAndLog(
        supabase, organizationId, leadId, instanceId, UNKNOWN_CONTACT_SENTINEL
      );
    }
    if (status === 'known') {
      return { tagged: false, reason: 'contact_known' };
    }
    // status === 'error' — não tagueia, log já feito dentro de checkContactKnown
    return { tagged: false, reason: 'unknown_contact_check_failed' };
  }

  // 4) Nada bateu
  if (!haystack) return { tagged: false, reason: 'empty_text' };
  if (!rule.keywords || rule.keywords.length === 0) {
    return { tagged: false, reason: 'empty_keywords' };
  }
  return { tagged: false, reason: 'no_match' };
}
