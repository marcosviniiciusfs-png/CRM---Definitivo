// ============================================================
// sync-google-sheets — handler do cron pg_cron a cada 2 minutos
//
// Para cada sheet_sync_config ativa cuja next_sync_at <= now():
//   1. Lê tokens, refresh se expirado.
//   2. Busca a aba via Sheets API (values:get).
//   3. Para cada linha após o header, computa hash determinístico
//      dos campos-chave normalizados.
//   4. INSERT em sheet_processed_rows ON CONFLICT DO NOTHING; só
//      linhas inseridas viram lead novo.
//   5. Cria leads em batch reusando a lógica da Fase 1 (mapping +
//      normalização BR + dedupe por telefone na tabela leads).
//   6. Grava log em sheet_sync_logs.
//
// Cap: 6 configs/tick, 200 linhas/sync.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_CONFIGS_PER_TICK = 6;
const MAX_ROWS_PER_SYNC = 200;
const MAX_ERRORS_BEFORE_DEACTIVATE = 3;

// ─── Cripto (espelho do callback) ───
async function decryptToken(encrypted: string, keyStr: string): Promise<string> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(keyStr));
  const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['decrypt']);
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return dec.decode(plain);
}

async function encryptToken(plain: string, keyStr: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(keyStr));
  const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

// ─── Hash de linha (para idempotência) ───
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Normalizadores BR ───
function normalizePhoneBR(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  // Remove DDI 55 quando presente (12 ou 13 dígitos no padrão BR)
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
}

function parseCurrencyBR(raw: string): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeKey(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Refresh token Google ───
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    console.error('Refresh falhou', await res.text());
    return null;
  }
  return await res.json();
}

interface ColumnMapping {
  excelColumn: string;
  columnIndex: number;
  crmField: string;
}

interface SheetConfig {
  id: string;
  organization_id: string;
  user_id: string;
  integration_id: string;
  spreadsheet_id: string;
  sheet_name: string;
  header_row: number;
  column_map: ColumnMapping[];
  funnel_id: string | null;
  funnel_stage_id: string | null;
  source_label: string;
  attribution_strategy: string;
  attribution_column: string | null;
  sync_interval_minutes: number;
  error_count: number;
}

// ─── Sync de uma config específica ───
async function syncOneConfig(supabase: any, config: SheetConfig, encryptionKey: string) {
  const startedAt = Date.now();
  const logBase = {
    config_id: config.id,
    organization_id: config.organization_id,
  };

  // 1. Pegar tokens + integration
  const { data: integration } = await supabase
    .from('google_sheets_integrations')
    .select('id, is_active, token_expires_at')
    .eq('id', config.integration_id)
    .maybeSingle();

  if (!integration || !integration.is_active) {
    await supabase.from('sheet_sync_configs').update({
      is_active: false,
      last_error: 'Integração desconectada',
      next_sync_at: null,
    }).eq('id', config.id);
    await supabase.from('sheet_sync_logs').insert({
      ...logBase, status: 'error', error_message: 'Integração desconectada',
      duration_ms: Date.now() - startedAt,
    });
    return;
  }

  const { data: tokenRow } = await supabase
    .from('google_sheets_tokens')
    .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('integration_id', config.integration_id)
    .maybeSingle();

  if (!tokenRow) {
    await supabase.from('sheet_sync_logs').insert({
      ...logBase, status: 'error', error_message: 'Token não encontrado',
      duration_ms: Date.now() - startedAt,
    });
    return;
  }

  let accessToken = await decryptToken(tokenRow.encrypted_access_token, encryptionKey);
  const refreshToken = await decryptToken(tokenRow.encrypted_refresh_token, encryptionKey);

  // Refresh se prestes a expirar (margem de 60s)
  if (new Date(tokenRow.token_expires_at).getTime() - Date.now() < 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (!refreshed) {
      await supabase.from('google_sheets_integrations').update({
        is_active: false, last_error: 'Falha ao renovar token',
      }).eq('id', config.integration_id);
      await supabase.from('sheet_sync_configs').update({
        is_active: false, last_error: 'OAuth expirou', next_sync_at: null,
      }).eq('id', config.id);
      await supabase.from('sheet_sync_logs').insert({
        ...logBase, status: 'error', error_message: 'Falha ao renovar token Google (reconecte a planilha)',
        duration_ms: Date.now() - startedAt,
      });
      return;
    }
    accessToken = refreshed.access_token;
    const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await supabase.from('google_sheets_tokens').update({
      encrypted_access_token: await encryptToken(accessToken, encryptionKey),
      token_expires_at: newExpires,
    }).eq('integration_id', config.integration_id);
    await supabase.from('google_sheets_integrations').update({
      token_expires_at: newExpires,
    }).eq('id', config.integration_id);
  }

  // 2. Ler aba — usa a aba pelo nome.
  // Range A:Z — cobre 26 colunas. Para abas mais largas, ajustar.
  const range = `${encodeURIComponent(config.sheet_name)}!A:Z`;
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${range}?majorDimension=ROWS`;
  const resp = await fetch(sheetsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!resp.ok) {
    const errText = await resp.text();
    const newErrorCount = (config.error_count || 0) + 1;
    const shouldDeactivate = newErrorCount >= MAX_ERRORS_BEFORE_DEACTIVATE;
    await supabase.from('sheet_sync_configs').update({
      last_error: `Sheets API ${resp.status}: ${errText.slice(0, 500)}`,
      error_count: newErrorCount,
      is_active: shouldDeactivate ? false : config.error_count >= 0,
      next_sync_at: shouldDeactivate ? null : new Date(Date.now() + config.sync_interval_minutes * 60_000).toISOString(),
    }).eq('id', config.id);
    await supabase.from('sheet_sync_logs').insert({
      ...logBase, status: 'error',
      error_message: `Sheets API retornou ${resp.status}` + (shouldDeactivate ? ' — sincronização desativada' : ''),
      duration_ms: Date.now() - startedAt,
    });
    return;
  }

  const sheetsData = await resp.json();
  const allRows: string[][] = sheetsData.values || [];
  if (allRows.length === 0) {
    await supabase.from('sheet_sync_configs').update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
      error_count: 0,
      next_sync_at: new Date(Date.now() + config.sync_interval_minutes * 60_000).toISOString(),
    }).eq('id', config.id);
    await supabase.from('sheet_sync_logs').insert({
      ...logBase, status: 'success', rows_read: 0, rows_new: 0,
      duration_ms: Date.now() - startedAt,
    });
    return;
  }

  // header_row é 1-indexed (linha do cabeçalho); linhas válidas começam DEPOIS
  const headerIdx = Math.max(0, (config.header_row || 1) - 1);
  const headers = allRows[headerIdx] || [];
  const dataRows = allRows.slice(headerIdx + 1).slice(0, MAX_ROWS_PER_SYNC);

  // 3. Para cada linha, gerar hash dos campos-chave normalizados
  const mappingByField: Record<string, ColumnMapping> = {};
  for (const m of (config.column_map || [])) {
    mappingByField[m.crmField] = m;
  }

  const findColumnIndex = (crmField: string): number => {
    const m = mappingByField[crmField];
    if (!m) return -1;
    // Tenta achar pelo nome do header (case-insensitive, normalizado)
    if (headers.length) {
      const normTarget = normalizeKey(m.excelColumn);
      const idx = headers.findIndex(h => normalizeKey(String(h)) === normTarget);
      if (idx >= 0) return idx;
    }
    // Fallback: usa o índice salvo no mapping
    return m.columnIndex ?? -1;
  };

  const phoneIdx = findColumnIndex('telefone_lead');
  const nomeIdx = findColumnIndex('nome_lead');
  const emailIdx = findColumnIndex('email');

  if (phoneIdx < 0 || nomeIdx < 0) {
    await supabase.from('sheet_sync_configs').update({
      last_error: 'Mapeamento incompleto: faltam colunas Nome ou Telefone (talvez header foi renomeado).',
      error_count: (config.error_count || 0) + 1,
      next_sync_at: new Date(Date.now() + config.sync_interval_minutes * 60_000).toISOString(),
    }).eq('id', config.id);
    await supabase.from('sheet_sync_logs').insert({
      ...logBase, status: 'error',
      error_message: 'Mapeamento incompleto (cabeçalho da planilha mudou?)',
      duration_ms: Date.now() - startedAt,
    });
    return;
  }

  let rowsNew = 0;
  let rowsSkipped = 0;
  let rowsInvalid = 0;

  // Buscar email do conector (usado como source label de comissão)
  // Buscar telefones existentes na org para dedupe cross-source
  // (limita a query: só os telefones desta planilha)
  const phonesInSheet = dataRows
    .map(r => normalizePhoneBR(String(r[phoneIdx] ?? '')))
    .filter(Boolean);
  const { data: existingLeads } = await supabase
    .from('leads')
    .select('id, telefone_lead')
    .eq('organization_id', config.organization_id)
    .in('telefone_lead', phonesInSheet);
  const existingPhones = new Set((existingLeads || []).map((l: any) => l.telefone_lead));

  // 4. Loop de processamento
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.length === 0 || row.every(c => !c || String(c).trim() === '')) continue;

    const phone = normalizePhoneBR(String(row[phoneIdx] ?? ''));
    const nome = String(row[nomeIdx] ?? '').trim();
    const email = emailIdx >= 0 ? String(row[emailIdx] ?? '').toLowerCase().trim() : '';

    if (!phone || !nome) {
      rowsInvalid++;
      continue;
    }

    // Hash de campos-chave normalizados (não da linha inteira —
    // edição em outra coluna não deve criar lead duplicado).
    const hashKey = `${phone}|${email}|${normalizeKey(nome)}`;
    const rowHash = await sha256Hex(hashKey);
    const rowNumberInSheet = headerIdx + 2 + i; // 1-indexed para humano

    // 5. INSERT idempotente em sheet_processed_rows.
    // Se já existia, retorna nada → skip (não cria lead).
    const { data: insertedRows, error: insertHashError } = await supabase
      .from('sheet_processed_rows')
      .insert({
        config_id: config.id,
        row_hash: rowHash,
        row_number: rowNumberInSheet,
        raw_values: row,
      })
      .select('config_id');

    if (insertHashError) {
      // ON CONFLICT lança erro 23505 — é o caso normal de "já processada"
      if ((insertHashError as any).code === '23505') {
        rowsSkipped++;
        continue;
      }
      console.error('Erro hash insert:', insertHashError);
      rowsInvalid++;
      continue;
    }

    if (!insertedRows || insertedRows.length === 0) {
      rowsSkipped++;
      continue;
    }

    // Dedupe cross-source por telefone na própria org
    if (existingPhones.has(phone)) {
      rowsSkipped++;
      // Atualiza a linha hash com lead_id null (já existe lead, não duplica)
      continue;
    }

    // 6. Construir lead a partir do mapping
    const lead: Record<string, any> = {
      organization_id: config.organization_id,
      nome_lead: nome,
      telefone_lead: phone,
      source: config.source_label || 'Google Sheets',
      funnel_id: config.funnel_id,
      funnel_stage_id: config.funnel_stage_id,
    };
    const additionalData: Record<string, any> = {};

    for (const m of (config.column_map || [])) {
      const idx = findColumnIndex(m.crmField);
      if (idx < 0) continue;
      const value = String(row[idx] ?? '').trim();
      if (!value || m.crmField === 'ignore') continue;

      if (m.crmField === 'nome_lead' || m.crmField === 'telefone_lead') {
        // já preenchidos com normalização acima
        continue;
      }
      if (m.crmField === 'additional_data') {
        additionalData[m.excelColumn] = value;
      } else if (m.crmField === 'valor') {
        const v = parseCurrencyBR(value);
        if (v !== null) lead.valor = v;
      } else if (m.crmField === 'email') {
        lead.email = value.toLowerCase();
      } else {
        lead[m.crmField] = value;
      }
    }

    // Atribuição segundo strategy
    if (config.attribution_strategy === 'connector') {
      lead.responsavel_user_id = config.user_id;
    } else if (config.attribution_strategy === 'spreadsheet_column' && config.attribution_column) {
      // Procura coluna por nome do header
      const colIdx = headers.findIndex(h => normalizeKey(String(h)) === normalizeKey(config.attribution_column!));
      if (colIdx >= 0) {
        const respLabel = String(row[colIdx] ?? '').trim();
        if (respLabel) lead.responsavel = respLabel;
      }
    }
    // 'roleta' deixa null e a roleta existente distribui

    if (Object.keys(additionalData).length > 0) {
      lead.additional_data = additionalData;
    }

    const { data: createdLead, error: leadErr } = await supabase
      .from('leads')
      .insert(lead)
      .select('id')
      .single();

    if (leadErr || !createdLead) {
      console.error('Erro ao inserir lead:', leadErr, lead);
      rowsInvalid++;
      // Remove o hash para permitir retry no próximo tick
      await supabase
        .from('sheet_processed_rows')
        .delete()
        .eq('config_id', config.id)
        .eq('row_hash', rowHash);
      continue;
    }

    rowsNew++;
    existingPhones.add(phone);

    // Atualiza row_hash com lead_id
    await supabase
      .from('sheet_processed_rows')
      .update({ lead_id: createdLead.id })
      .eq('config_id', config.id)
      .eq('row_hash', rowHash);

    // Distribuição via roleta — só quando strategy === 'roleta'
    if (config.attribution_strategy === 'roleta') {
      try {
        await supabase.functions.invoke('distribute-lead', {
          body: { lead_id: createdLead.id, organization_id: config.organization_id, bulk_mode: true, suppress_notifications: true },
        });
      } catch (e) {
        console.error('Distribuição falhou (não crítico):', e);
      }
    }
  }

  // 7. Atualizar config + log de sucesso
  await supabase.from('sheet_sync_configs').update({
    last_synced_at: new Date().toISOString(),
    last_error: null,
    error_count: 0,
    next_sync_at: new Date(Date.now() + config.sync_interval_minutes * 60_000).toISOString(),
  }).eq('id', config.id);

  await supabase.from('sheet_sync_logs').insert({
    ...logBase,
    status: rowsInvalid > 0 ? 'partial' : 'success',
    rows_read: dataRows.length,
    rows_new: rowsNew,
    rows_skipped: rowsSkipped,
    rows_invalid: rowsInvalid,
    duration_ms: Date.now() - startedAt,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encryptionKey = Deno.env.get('GOOGLE_SHEETS_ENCRYPTION_KEY')!;
    if (!encryptionKey) throw new Error('GOOGLE_SHEETS_ENCRYPTION_KEY não configurada');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Permite trigger manual via { config_id: '...' }
    let manualConfigId: string | null = null;
    try {
      const body = await req.json();
      if (body?.config_id) manualConfigId = body.config_id;
    } catch { /* sem body — modo cron */ }

    let configsQuery = supabase
      .from('sheet_sync_configs')
      .select('id, organization_id, user_id, integration_id, spreadsheet_id, sheet_name, header_row, column_map, funnel_id, funnel_stage_id, source_label, attribution_strategy, attribution_column, sync_interval_minutes, error_count')
      .eq('is_active', true)
      .order('next_sync_at', { ascending: true, nullsFirst: true })
      .limit(MAX_CONFIGS_PER_TICK);

    if (manualConfigId) {
      configsQuery = supabase
        .from('sheet_sync_configs')
        .select('id, organization_id, user_id, integration_id, spreadsheet_id, sheet_name, header_row, column_map, funnel_id, funnel_stage_id, source_label, attribution_strategy, attribution_column, sync_interval_minutes, error_count')
        .eq('id', manualConfigId)
        .limit(1);
    } else {
      configsQuery = configsQuery.or(`next_sync_at.is.null,next_sync_at.lte.${new Date().toISOString()}`);
    }

    const { data: configs, error: cfgErr } = await configsQuery;
    if (cfgErr) throw cfgErr;

    const list = (configs || []) as SheetConfig[];
    console.log(`🔄 Sync tick — ${list.length} config(s) a processar`);

    // Promise.allSettled para isolar falhas
    const results = await Promise.allSettled(
      list.map(c => syncOneConfig(supabase, c, encryptionKey))
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    const succeeded = results.length - failed;

    return new Response(JSON.stringify({ processed: list.length, succeeded, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('❌ sync-google-sheets falhou:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
