// ============================================================
// sync-google-sheets — handler do cron pg_cron a cada 2 minutos.
//
// Autentica via Service Account (JWT RS256). Para cada
// sheet_sync_config ativa cuja next_sync_at <= now():
//   1. Busca a aba via Sheets API.
//   2. Para cada linha pós-header, computa hash dos campos-chave
//      normalizados (telefone+email+nome).
//   3. INSERT em sheet_processed_rows ON CONFLICT DO NOTHING; só
//      linhas inseridas viram lead novo.
//   4. Cria leads em batch (mapping + normalização BR + dedupe
//      por telefone na tabela leads).
//   5. Grava log em sheet_sync_logs.
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

// ─── Service Account JWT signing ───
// Cache em memória do worker. Vive enquanto o worker estiver vivo.
let cachedToken: { token: string; expiresAt: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function base64UrlEncode(input: string | Uint8Array): string {
  const b64 = typeof input === 'string'
    ? btoa(input)
    : btoa(String.fromCharCode(...input));
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getServiceAccountAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const email = Deno.env.get('GOOGLE_SA_EMAIL');
  const privateKeyPem = Deno.env.get('GOOGLE_SA_PRIVATE_KEY');
  if (!email || !privateKeyPem) {
    throw new Error('GOOGLE_SA_EMAIL ou GOOGLE_SA_PRIVATE_KEY não configurados');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encHeader = base64UrlEncode(JSON.stringify(header));
  const encClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encHeader}.${encClaims}`;

  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const sig = base64UrlEncode(new Uint8Array(sigBuffer));
  const jwt = `${signingInput}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Falha ao obter token SA: ${tokenRes.status} ${errText.slice(0, 200)}`);
  }

  const data = await tokenRes.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

// ─── Hash de linha (idempotência) ───
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Normalizadores BR ───
function normalizePhoneBR(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
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

interface ColumnMapping {
  excelColumn: string;
  columnIndex: number;
  crmField: string;
}

interface SheetConfig {
  id: string;
  organization_id: string;
  user_id: string;
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
async function syncOneConfig(supabase: any, config: SheetConfig, accessToken: string) {
  const startedAt = Date.now();
  const logBase = {
    config_id: config.id,
    organization_id: config.organization_id,
  };

  // 1. Ler aba via Sheets API
  const range = `${encodeURIComponent(config.sheet_name)}!A:Z`;
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${range}?majorDimension=ROWS`;
  const resp = await fetch(sheetsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!resp.ok) {
    const errText = await resp.text();
    const newErrorCount = (config.error_count || 0) + 1;
    const shouldDeactivate = newErrorCount >= MAX_ERRORS_BEFORE_DEACTIVATE;
    const errorMsg = resp.status === 403
      ? 'Sem permissão. Confirme que a planilha foi compartilhada com o email da Service Account.'
      : resp.status === 404
        ? 'Planilha não encontrada — confira o link.'
        : `Sheets API ${resp.status}: ${errText.slice(0, 300)}`;

    await supabase.from('sheet_sync_configs').update({
      last_error: errorMsg,
      error_count: newErrorCount,
      is_active: shouldDeactivate ? false : true,
      next_sync_at: shouldDeactivate ? null : new Date(Date.now() + config.sync_interval_minutes * 60_000).toISOString(),
    }).eq('id', config.id);

    await supabase.from('sheet_sync_logs').insert({
      ...logBase, status: 'error',
      error_message: errorMsg + (shouldDeactivate ? ' — sincronização desativada' : ''),
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

  const headerIdx = Math.max(0, (config.header_row || 1) - 1);
  const headers = allRows[headerIdx] || [];
  const dataRows = allRows.slice(headerIdx + 1).slice(0, MAX_ROWS_PER_SYNC);

  const mappingByField: Record<string, ColumnMapping> = {};
  for (const m of (config.column_map || [])) {
    mappingByField[m.crmField] = m;
  }

  const findColumnIndex = (crmField: string): number => {
    const m = mappingByField[crmField];
    if (!m) return -1;
    if (headers.length) {
      const normTarget = normalizeKey(m.excelColumn);
      const idx = headers.findIndex(h => normalizeKey(String(h)) === normTarget);
      if (idx >= 0) return idx;
    }
    return m.columnIndex ?? -1;
  };

  const phoneIdx = findColumnIndex('telefone_lead');
  const nomeIdx = findColumnIndex('nome_lead');
  const emailIdx = findColumnIndex('email');

  if (phoneIdx < 0 || nomeIdx < 0) {
    await supabase.from('sheet_sync_configs').update({
      last_error: 'Mapeamento incompleto: faltam colunas Nome ou Telefone (cabeçalho da planilha pode ter mudado).',
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

  // Dedupe cross-source: telefones já existentes na mesma org
  const phonesInSheet = dataRows
    .map(r => normalizePhoneBR(String(r[phoneIdx] ?? '')))
    .filter(Boolean);
  const { data: existingLeads } = await supabase
    .from('leads')
    .select('id, telefone_lead')
    .eq('organization_id', config.organization_id)
    .in('telefone_lead', phonesInSheet);
  const existingPhones = new Set((existingLeads || []).map((l: any) => l.telefone_lead));

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

    const hashKey = `${phone}|${email}|${normalizeKey(nome)}`;
    const rowHash = await sha256Hex(hashKey);
    const rowNumberInSheet = headerIdx + 2 + i;

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

    if (existingPhones.has(phone)) {
      rowsSkipped++;
      continue;
    }

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

      if (m.crmField === 'nome_lead' || m.crmField === 'telefone_lead') continue;
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

    if (config.attribution_strategy === 'connector') {
      lead.responsavel_user_id = config.user_id;
    } else if (config.attribution_strategy === 'spreadsheet_column' && config.attribution_column) {
      const colIdx = headers.findIndex(h => normalizeKey(String(h)) === normalizeKey(config.attribution_column!));
      if (colIdx >= 0) {
        const respLabel = String(row[colIdx] ?? '').trim();
        if (respLabel) lead.responsavel = respLabel;
      }
    }

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
      await supabase
        .from('sheet_processed_rows')
        .delete()
        .eq('config_id', config.id)
        .eq('row_hash', rowHash);
      continue;
    }

    rowsNew++;
    existingPhones.add(phone);

    await supabase
      .from('sheet_processed_rows')
      .update({ lead_id: createdLead.id })
      .eq('config_id', config.id)
      .eq('row_hash', rowHash);

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
    const supabase = createClient(supabaseUrl, supabaseKey);

    let manualConfigId: string | null = null;
    try {
      const body = await req.json();
      if (body?.config_id) manualConfigId = body.config_id;
    } catch { /* sem body — modo cron */ }

    let configsQuery = supabase
      .from('sheet_sync_configs')
      .select('id, organization_id, user_id, spreadsheet_id, sheet_name, header_row, column_map, funnel_id, funnel_stage_id, source_label, attribution_strategy, attribution_column, sync_interval_minutes, error_count')
      .eq('is_active', true)
      .order('next_sync_at', { ascending: true, nullsFirst: true })
      .limit(MAX_CONFIGS_PER_TICK);

    if (manualConfigId) {
      configsQuery = supabase
        .from('sheet_sync_configs')
        .select('id, organization_id, user_id, spreadsheet_id, sheet_name, header_row, column_map, funnel_id, funnel_stage_id, source_label, attribution_strategy, attribution_column, sync_interval_minutes, error_count')
        .eq('id', manualConfigId)
        .limit(1);
    } else {
      configsQuery = configsQuery.or(`next_sync_at.is.null,next_sync_at.lte.${new Date().toISOString()}`);
    }

    const { data: configs, error: cfgErr } = await configsQuery;
    if (cfgErr) throw cfgErr;

    const list = (configs || []) as SheetConfig[];
    if (list.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // Token único da SA para todas as configs deste tick
    const accessToken = await getServiceAccountAccessToken();
    console.log(`🔄 Sync tick — ${list.length} config(s) a processar`);

    const results = await Promise.allSettled(
      list.map(c => syncOneConfig(supabase, c, accessToken))
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
