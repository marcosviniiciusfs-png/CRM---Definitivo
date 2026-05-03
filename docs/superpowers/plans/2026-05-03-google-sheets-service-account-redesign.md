# Google Sheets Service Account Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o OAuth-por-usuário do sync de Google Sheets por uma Service Account única do projeto Kairoz. Usuário compartilha sua planilha com o email fixo da SA, sem login Google nem consent screen.

**Architecture:** A Service Account autentica via JWT RS256 assinado em runtime (sem refresh tokens persistidos). Todas as 4 Edge Functions OAuth são removidas; sobram apenas `sync-google-sheets` (cron) e `sync-google-sheets-meta` (UI helper), ambas usando o token da SA. Tabelas de tokens são apagadas — `sheet_sync_configs` simplifica (sem `integration_id`).

**Tech Stack:** Supabase (Postgres + Edge Functions Deno), React + TypeScript + Tailwind, Google Sheets API v4, Web Crypto API (`crypto.subtle.sign` para RS256), pg_cron + pg_net.

**Convenções deste projeto:** Não há testes automatizados nem framework de teste configurado. Seguindo o padrão estabelecido, validação é feita por smoke tests manuais documentados ao final de cada bloco. Commits frequentes a cada subtask.

**Spec de origem:** [`docs/superpowers/specs/2026-05-03-google-sheets-service-account-redesign-design.md`](../specs/2026-05-03-google-sheets-service-account-redesign-design.md)

---

## File Map

**Migration nova:**
- `supabase/migrations/20260503120000_google_sheets_service_account.sql`

**Edge Functions a apagar do projeto Supabase (mas manter deploy comando para cleanup):**
- `supabase/functions/google-sheets-oauth-initiate/index.ts` — apagar diretório
- `supabase/functions/google-sheets-oauth-callback/index.ts` — apagar diretório

**Edge Functions a reescrever:**
- `supabase/functions/sync-google-sheets/index.ts` — substituir lógica OAuth por SA
- `supabase/functions/sync-google-sheets-meta/index.ts` — substituir lógica OAuth por SA

**Frontend:**
- `src/components/GoogleSheetsConnection.tsx` — remover OAuth, adicionar card SA email
- `src/components/ConnectGoogleSheetDialog.tsx` — banner de compartilhamento, tratamento 403, remover `integration_id` do INSERT
- `src/pages/Integrations.tsx` — remover query a `google_sheets_integrations`

**Documentação:**
- `docs/GOOGLE_SHEETS_SETUP.md` — reescrever do zero com instruções SA

**Não tocar:**
- `src/lib/brLocale.ts` (parsers BR continuam intactos)
- `src/components/SyncLogViewer.tsx` (logs visíveis, não muda)
- `src/components/GoogleSheetsModal.tsx` (apenas envolve `GoogleSheetsConnection`)
- Cron pg_cron (mantém `*/2 * * * *`)
- Calendar (não tocar nada de `google_calendar_*`)

---

## Task 1: Setup operacional do Google Cloud (manual)

**Files:** Nenhum arquivo do repo. Esse passo é manual no console e Supabase secrets.

> **Importante:** Esse setup é one-time. O agente que executa esse plano deve **pausar** e pedir ao usuário (Brito) para realizar os passos. Ao final, o usuário fornece o email da SA gerado para uso nas próximas tasks.

- [ ] **Step 1: Criar a Service Account no GCP**

Acessar https://console.cloud.google.com/iam-admin/serviceaccounts no projeto que já hospeda as credenciais do Calendar (mesmo projeto).

Clicar em **CREATE SERVICE ACCOUNT**:
- Service account name: `kairoz-sheets-sync`
- Service account ID: `kairoz-sheets-sync` (gerado automaticamente)
- Description: `Sincronização de planilhas para o CRM Kairoz`

Clicar em **CREATE AND CONTINUE**. Pular as duas próximas telas (sem roles, sem grant access). Clicar em **DONE**.

Anotar o email gerado: `kairoz-sheets-sync@<PROJECT-ID>.iam.gserviceaccount.com`

- [ ] **Step 2: Gerar a JSON key da Service Account**

Na lista de Service Accounts, clicar em `kairoz-sheets-sync@...`. Aba **KEYS** → **ADD KEY** → **Create new key** → escolher **JSON** → **CREATE**.

O navegador baixa um arquivo `.json`. Guardar com cuidado — esta é a única vez que a private key é exibida.

- [ ] **Step 3: Habilitar Google Sheets API**

Acessar https://console.cloud.google.com/apis/library/sheets.googleapis.com no mesmo projeto. Clicar em **ENABLE** se não estiver ativada.

(Drive API NÃO é necessária — o fluxo manual dispensa.)

- [ ] **Step 4: Configurar secrets no Supabase**

Extrair email e private key do JSON baixado.

**Opção A — com jq instalado (Linux/macOS/Git Bash com jq):**

```bash
SA_EMAIL=$(jq -r .client_email path/to/sa-key.json)
SA_PRIVATE_KEY=$(jq -r .private_key path/to/sa-key.json)
```

**Opção B — com Node.js (sempre disponível neste projeto):**

```bash
SA_EMAIL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('path/to/sa-key.json','utf8')).client_email)")
SA_PRIVATE_KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('path/to/sa-key.json','utf8')).private_key)")
```

Aplicar:

```bash
cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"

npx supabase secrets set GOOGLE_SA_EMAIL="$SA_EMAIL" --project-ref uxttihjsxfowursjyult
npx supabase secrets set GOOGLE_SA_PRIVATE_KEY="$SA_PRIVATE_KEY" --project-ref uxttihjsxfowursjyult

# Remover secret antigo do fluxo OAuth
npx supabase secrets unset GOOGLE_SHEETS_ENCRYPTION_KEY --project-ref uxttihjsxfowursjyult
```

Importante: a private key tem `\n` literais no JSON (string de uma linha). Tanto `jq -r` quanto `JSON.parse` decodificam para newlines reais — formato esperado pelo `crypto.subtle.importKey('pkcs8', ...)`. Não escapar manualmente.

Verificar:
```bash
npx supabase secrets list --project-ref uxttihjsxfowursjyult | grep -E "GOOGLE_SA"
```

Esperado: `GOOGLE_SA_EMAIL` e `GOOGLE_SA_PRIVATE_KEY` listados.

- [ ] **Step 5: Configurar VITE_GOOGLE_SA_EMAIL no .env.local**

Editar `.env.local` (NÃO commitar) e adicionar:

```
VITE_GOOGLE_SA_EMAIL=kairoz-sheets-sync@<PROJECT-ID>.iam.gserviceaccount.com
```

(Usar o mesmo valor de `SA_EMAIL` do step anterior.)

- [ ] **Step 6: Apagar Edge Functions OAuth do projeto Supabase**

```bash
npx supabase functions delete google-sheets-oauth-initiate --project-ref uxttihjsxfowursjyult
npx supabase functions delete google-sheets-oauth-callback --project-ref uxttihjsxfowursjyult
```

Verificar no dashboard https://supabase.com/dashboard/project/uxttihjsxfowursjyult/functions — não devem mais aparecer.

- [ ] **Step 7: Sinalizar conclusão**

Reportar ao executor do plano: "Setup GCP feito. Email da SA: `kairoz-sheets-sync@<PROJECT-ID>.iam.gserviceaccount.com`."

---

## Task 2: Apagar diretórios das Edge Functions OAuth no repo

**Files:**
- Delete: `supabase/functions/google-sheets-oauth-initiate/`
- Delete: `supabase/functions/google-sheets-oauth-callback/`

- [ ] **Step 1: Remover os dois diretórios**

```bash
cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
rm -rf supabase/functions/google-sheets-oauth-initiate
rm -rf supabase/functions/google-sheets-oauth-callback
```

- [ ] **Step 2: Verificar que sumiram**

```bash
ls supabase/functions/google-sheets-oauth-* 2>&1
```

Esperado: `No such file or directory` (ou listagem vazia).

- [ ] **Step 3: Commit**

```bash
git add -A supabase/functions/
git commit -m "$(cat <<'EOF'
chore(sheets): remove OAuth Edge Functions (replaced by Service Account)

Files removed:
- supabase/functions/google-sheets-oauth-initiate/
- supabase/functions/google-sheets-oauth-callback/

Per spec 2026-05-03-google-sheets-service-account-redesign.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migration SQL — drop tabelas de tokens, simplificar config

**Files:**
- Create: `supabase/migrations/20260503120000_google_sheets_service_account.sql`

- [ ] **Step 1: Criar a migration**

Arquivo `supabase/migrations/20260503120000_google_sheets_service_account.sql`:

```sql
-- ============================================================
-- Fase 2 v2: Substitui OAuth-por-usuário por Service Account.
--
-- Apaga as tabelas de integração e tokens (sem dados em produção,
-- já que o OAuth nunca chegou a funcionar para o usuário final).
-- Remove integration_id de sheet_sync_configs — agora todas as
-- configs apontam para a SA única do projeto.
--
-- sheet_processed_rows e sheet_sync_logs permanecem inalteradas.
-- ============================================================

-- 1. Drop FKs antes das tabelas
ALTER TABLE public.sheet_sync_configs
  DROP CONSTRAINT IF EXISTS sheet_sync_configs_integration_id_fkey;

-- 2. Drop tabelas do fluxo OAuth
DROP TABLE IF EXISTS public.google_sheets_tokens     CASCADE;
DROP TABLE IF EXISTS public.google_sheets_integrations CASCADE;

-- 3. Drop coluna integration_id
ALTER TABLE public.sheet_sync_configs
  DROP COLUMN IF EXISTS integration_id;
```

- [ ] **Step 2: Aplicar a migration no projeto remoto**

```bash
cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
npx supabase db push --linked
```

Esperado output: `Applying migration 20260503120000_google_sheets_service_account.sql...` seguido de `Finished supabase db push.`

Se aparecer conflito de migrations duplicadas (timestamps colidindo com `20260327000000_*`), aplicar o mesmo workaround usado na Fase 2 anterior:

```bash
mv supabase/migrations/20260327000000_fix_facebook_integration_recovery.sql supabase/migrations/20260327000001_fix_facebook_integration_recovery.sql
mv supabase/migrations/20260327000000_fix_lead_activities_rls_and_storage.sql supabase/migrations/20260327000002_fix_lead_activities_rls_and_storage.sql
npx supabase migration repair --status applied 20260327000001 20260327000002 --linked
npx supabase db push --linked
# depois renomear de volta:
mv supabase/migrations/20260327000001_fix_facebook_integration_recovery.sql supabase/migrations/20260327000000_fix_facebook_integration_recovery.sql
mv supabase/migrations/20260327000002_fix_lead_activities_rls_and_storage.sql supabase/migrations/20260327000000_fix_lead_activities_rls_and_storage.sql
```

- [ ] **Step 3: Verificar que as tabelas foram apagadas**

Pelo dashboard SQL editor (https://supabase.com/dashboard/project/uxttihjsxfowursjyult/sql/new), executar:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('google_sheets_integrations','google_sheets_tokens','sheet_sync_configs');
```

Esperado: apenas `sheet_sync_configs`.

E verificar que `integration_id` sumiu:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='sheet_sync_configs' AND column_name='integration_id';
```

Esperado: 0 linhas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260503120000_google_sheets_service_account.sql
git commit -m "$(cat <<'EOF'
feat(db): drop OAuth tables, simplify sheet_sync_configs

Removes google_sheets_integrations and google_sheets_tokens
(OAuth-per-user fluxo descartado). Drop integration_id de
sheet_sync_configs — agora todas as configs apontam para a SA
única do projeto.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Reescrever `sync-google-sheets` para usar Service Account

**Files:**
- Modify: `supabase/functions/sync-google-sheets/index.ts` (rewrite completo)

> **Por que rewrite completo?** O arquivo atual mistura cripto AES-GCM (encrypt/decrypt de access/refresh tokens), refresh-token flow e a leitura de Sheets. Removendo OAuth, ~100 linhas saem e ~50 entram (JWT signing). É mais legível reescrever do que fazer 8 edits cirúrgicos.

- [ ] **Step 1: Sobrescrever `supabase/functions/sync-google-sheets/index.ts`**

```typescript
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
```

- [ ] **Step 2: Deploy**

```bash
cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
npx supabase functions deploy sync-google-sheets --project-ref uxttihjsxfowursjyult --no-verify-jwt
```

Esperado: `Deployed Functions on project uxttihjsxfowursjyult: sync-google-sheets`.

- [ ] **Step 3: Smoke test do JWT signing**

Disparar manualmente a função e verificar logs:

```bash
curl -X POST "https://uxttihjsxfowursjyult.supabase.co/functions/v1/sync-google-sheets" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4dHRpaGpzeGZvd3Vyc2p5dWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4ODM5NTAsImV4cCI6MjA4NDQ1OTk1MH0.-gyL85krJA-16ieNnCtoi-HK-oXxSLl1m26yMJLKmxA" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Esperado: `{"processed":0}` (sem configs ativas ainda) ou `{"processed":N, "succeeded":N, "failed":0}`. Se aparecer `{"error":"GOOGLE_SA_EMAIL não configurado"}` ou `Falha ao obter token SA`, o setup da Task 1 está incompleto.

Verificar logs:
```
https://supabase.com/dashboard/project/uxttihjsxfowursjyult/functions/sync-google-sheets/logs
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sync-google-sheets/index.ts
git commit -m "$(cat <<'EOF'
feat(sheets): rewrite sync to use Service Account auth

Replaces OAuth (per-user encrypted tokens + refresh flow) with a
single JWT RS256 signed against GOOGLE_SA_PRIVATE_KEY. Token
cached in worker memory with 50-min TTL.

Sync logic (hash-based idempotency, BR locale parsing, dedupe by
telefone, attribution strategies) unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Reescrever `sync-google-sheets-meta` para usar Service Account

**Files:**
- Modify: `supabase/functions/sync-google-sheets-meta/index.ts` (rewrite completo)

- [ ] **Step 1: Sobrescrever `supabase/functions/sync-google-sheets-meta/index.ts`**

```typescript
// ============================================================
// sync-google-sheets-meta — helper backend para o dialog de
// "Conectar planilha". Recebe spreadsheet_id e devolve:
//   - title da planilha + lista de abas
//   - opcionalmente, preview de até N linhas de uma aba
//
// Autentica via Service Account (mesma SA do sync). Mantém token
// Google e private key fora do client.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Token cache local — recriado a cada cold-start, dura ~horas no warm.
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado');
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Token inválido');

    const body = await req.json();
    const spreadsheet_id: string = body?.spreadsheet_id;
    const sheet_name: string | undefined = body?.sheet_name;
    const preview: boolean = !!body?.preview;
    const header_row: number = body?.header_row ?? 1;

    if (!spreadsheet_id) throw new Error('spreadsheet_id obrigatório');

    // Validar que o usuário pertence a alguma org ativa
    // (qualquer org serve — a SA é compartilhada entre todas)
    const { data: anyMembership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (!anyMembership) throw new Error('Usuário sem organização ativa');

    const accessToken = await getServiceAccountAccessToken();

    if (preview && sheet_name) {
      const range = `${encodeURIComponent(sheet_name)}!A1:Z${(header_row || 1) + 5}`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${range}?majorDimension=ROWS`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const t = await res.text();
        let msg = `Sheets API ${res.status}`;
        if (res.status === 403) msg = 'Sem permissão. Confirme que a planilha foi compartilhada com o email da Service Account.';
        else if (res.status === 404) msg = 'Planilha não encontrada — confira o link.';
        throw new Error(`${msg}: ${t.slice(0, 200)}`);
      }
      const data = await res.json();
      return new Response(JSON.stringify({ values: data.values || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // Modo metadata
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}?fields=properties.title,sheets.properties`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const t = await res.text();
      let msg = `Sheets API ${res.status}`;
      if (res.status === 403) msg = 'Sem permissão. Compartilhe a planilha com o email da Service Account (Visualização).';
      else if (res.status === 404) msg = 'Planilha não encontrada — confira o link.';
      throw new Error(`${msg}: ${t.slice(0, 200)}`);
    }
    const meta = await res.json();
    const sheets = (meta.sheets || []).map((s: any) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      rowCount: s.properties.gridProperties?.rowCount ?? 0,
    }));
    return new Response(JSON.stringify({ title: meta.properties?.title || '', sheets }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('❌ sync-google-sheets-meta:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy sync-google-sheets-meta --project-ref uxttihjsxfowursjyult
```

Esperado: `Deployed Functions on project uxttihjsxfowursjyult: sync-google-sheets-meta`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sync-google-sheets-meta/index.ts
git commit -m "$(cat <<'EOF'
feat(sheets): rewrite meta function to use Service Account auth

Same JWT RS256 flow as sync function. Removes integration_id
lookup and per-user token decryption. Now any authenticated org
member can call this — the SA's permissions are uniform.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Refatorar `GoogleSheetsConnection.tsx`

**Files:**
- Modify: `src/components/GoogleSheetsConnection.tsx` (rewrite completo da lógica de "conta conectada")

- [ ] **Step 1: Sobrescrever `src/components/GoogleSheetsConnection.tsx`**

```tsx
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Loader2, AlertCircle, ArrowLeft, Plus, RefreshCw, Trash2, Link as LinkIcon, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ConnectGoogleSheetDialog } from "./ConnectGoogleSheetDialog";
import { SyncLogViewer } from "./SyncLogViewer";

interface SyncConfig {
  id: string;
  spreadsheet_name: string | null;
  spreadsheet_url: string | null;
  sheet_name: string;
  sync_interval_minutes: number;
  last_synced_at: string | null;
  last_error: string | null;
  error_count: number;
  is_active: boolean;
  created_at: string;
}

interface GoogleSheetsConnectionProps {
  onClose: () => void;
}

const formatRelative = (iso: string | null): string => {
  if (!iso) return "Nunca";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "agora";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(iso).toLocaleString("pt-BR");
};

const SA_EMAIL = import.meta.env.VITE_GOOGLE_SA_EMAIL ?? '';

export const GoogleSheetsConnection = ({ onClose }: GoogleSheetsConnectionProps) => {
  const { toast } = useToast();
  const { organizationId } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [logViewerConfigId, setLogViewerConfigId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadAll = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("sheet_sync_configs")
        .select("id, spreadsheet_name, spreadsheet_url, sheet_name, sync_interval_minutes, last_synced_at, last_error, error_count, is_active, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setConfigs((data || []) as SyncConfig[]);
    } catch (err: any) {
      console.error("Erro ao carregar configs:", err);
      toast({ title: "Erro", description: "Não foi possível carregar as planilhas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const copyEmail = async () => {
    if (!SA_EMAIL) {
      toast({ title: "Email não configurado", description: "Variável VITE_GOOGLE_SA_EMAIL ausente — avise o administrador.", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(SA_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Email copiado!" });
    } catch {
      toast({ title: "Não consegui copiar", description: "Selecione e copie o email manualmente.", variant: "destructive" });
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!confirm("Remover esta sincronização? Os leads já criados não serão afetados.")) return;
    try {
      const { error } = await supabase.from("sheet_sync_configs").delete().eq("id", configId);
      if (error) throw error;
      toast({ title: "Sincronização removida" });
      loadAll();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleSyncNow = async (configId: string) => {
    setSyncingId(configId);
    try {
      const { error } = await supabase.functions.invoke("sync-google-sheets", {
        body: { config_id: configId },
      });
      if (error) throw error;
      toast({ title: "Sincronização disparada", description: "Aguarde alguns segundos e atualize." });
      setTimeout(loadAll, 2000);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghostIcon" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSpreadsheet className="h-5 w-5 text-[#0F9D58]" />
              Google Sheets — Importação automática
            </CardTitle>
            <CardDescription>
              Compartilhe a planilha com o email do CRM e novos leads aparecem automaticamente no funil (a cada 2 minutos)
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Card do email da SA — sempre visível */}
        <Card className="border-[#0F9D58]/20 bg-[#0F9D58]/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="h-5 w-5 text-[#0F9D58] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-1">Como conectar uma planilha</h3>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>No Google Sheets, abra a planilha e clique em <strong>Compartilhar</strong></li>
                  <li>Cole o email abaixo, escolha <strong>Visualizador</strong> e envie</li>
                  <li>Volte aqui e clique em <strong>Conectar planilha</strong></li>
                </ol>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-background border border-[#0F9D58]/30 rounded p-2">
              <code className="flex-1 text-xs font-mono truncate select-all">
                {SA_EMAIL || '(VITE_GOOGLE_SA_EMAIL não configurada)'}
              </code>
              <Button
                size="sm" variant="outline"
                onClick={copyEmail}
                className="flex-shrink-0 h-7"
                disabled={!SA_EMAIL}
              >
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">
                Planilhas sincronizando ({configs.filter(c => c.is_active).length})
              </h4>
              <Button size="sm" onClick={() => setShowConnect(true)}>
                <Plus className="h-4 w-4 mr-1" /> Conectar planilha
              </Button>
            </div>

            {configs.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma planilha conectada. Compartilhe com o email acima e clique em <strong>Conectar planilha</strong>.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {configs.map((cfg) => (
                  <Card key={cfg.id} className={cfg.is_active ? "" : "opacity-60"}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-sm truncate">
                              {cfg.spreadsheet_name || cfg.sheet_name}
                            </p>
                            {cfg.is_active ? (
                              cfg.error_count > 0 ? (
                                <Badge variant="destructive" className="text-[10px] py-0 h-5">
                                  {cfg.error_count} erro(s)
                                </Badge>
                              ) : (
                                <Badge className="bg-[#66ee78] text-[10px] py-0 h-5">Sincronizando</Badge>
                              )
                            ) : (
                              <Badge variant="secondary" className="text-[10px] py-0 h-5">Pausada</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            Aba: <span className="font-mono">{cfg.sheet_name}</span> · A cada {cfg.sync_interval_minutes} min · Última verificação: {formatRelative(cfg.last_synced_at)}
                          </p>
                          {cfg.last_error && (
                            <p className="text-xs text-destructive mt-1 truncate">⚠ {cfg.last_error}</p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {cfg.spreadsheet_url && (
                            <Button variant="ghostIcon" size="icon" asChild title="Abrir planilha">
                              <a href={cfg.spreadsheet_url} target="_blank" rel="noopener">
                                <LinkIcon className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="ghostIcon" size="icon"
                            disabled={!cfg.is_active || syncingId === cfg.id}
                            onClick={() => handleSyncNow(cfg.id)}
                            title="Sincronizar agora"
                          >
                            {syncingId === cfg.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghostIcon" size="icon"
                            onClick={() => setLogViewerConfigId(cfg.id)}
                            title="Ver logs"
                          >
                            <AlertCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghostIcon" size="icon"
                            onClick={() => handleDeleteConfig(cfg.id)}
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {showConnect && organizationId && (
          <ConnectGoogleSheetDialog
            saEmail={SA_EMAIL}
            onClose={() => setShowConnect(false)}
            onCreated={() => { setShowConnect(false); loadAll(); }}
          />
        )}
        {logViewerConfigId && (
          <SyncLogViewer
            configId={logViewerConfigId}
            onClose={() => setLogViewerConfigId(null)}
          />
        )}
      </CardContent>
    </Card>
  );
};
```

- [ ] **Step 2: Smoke test build**

```bash
npm run build 2>&1 | tail -10
```

Esperado: `✓ built in Xs` sem erros novos. Os erros TS pré-existentes do `types.ts` não afetam o build.

- [ ] **Step 3: Commit**

```bash
git add src/components/GoogleSheetsConnection.tsx
git commit -m "$(cat <<'EOF'
refactor(sheets): replace OAuth UI with Service Account email card

Removes "Conectar conta Google", "Desconectar" and OAuth callback
querystring detection. Adds prominent card with the SA email and
copy button — users share their sheet with this email.

Reads SA_EMAIL from import.meta.env.VITE_GOOGLE_SA_EMAIL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Refatorar `ConnectGoogleSheetDialog.tsx`

**Files:**
- Modify: `src/components/ConnectGoogleSheetDialog.tsx`

- [ ] **Step 1: Substituir interface de props**

Localizar:
```tsx
interface ConnectGoogleSheetDialogProps {
  integrationId: string;
  onClose: () => void;
  onCreated: () => void;
}
```

Substituir por:
```tsx
interface ConnectGoogleSheetDialogProps {
  saEmail: string;
  onClose: () => void;
  onCreated: () => void;
}
```

- [ ] **Step 2: Trocar destructure de props no componente**

Localizar:
```tsx
export const ConnectGoogleSheetDialog = ({
  integrationId, onClose, onCreated,
}: ConnectGoogleSheetDialogProps) => {
```

Substituir por:
```tsx
export const ConnectGoogleSheetDialog = ({
  saEmail, onClose, onCreated,
}: ConnectGoogleSheetDialogProps) => {
```

- [ ] **Step 3: Remover `integration_id` da chamada `fetchSpreadsheetMeta`**

Localizar (dentro de `fetchSpreadsheetMeta`):
```tsx
const { data, error } = await supabase.functions.invoke("sync-google-sheets-meta", {
  body: { integration_id: integrationId, spreadsheet_id: id },
});
```

Substituir por:
```tsx
const { data, error } = await supabase.functions.invoke("sync-google-sheets-meta", {
  body: { spreadsheet_id: id },
});
```

- [ ] **Step 4: Remover `integration_id` da chamada `fetchTabPreview`**

Localizar (dentro de `fetchTabPreview`):
```tsx
const { data, error } = await supabase.functions.invoke("sync-google-sheets-meta", {
  body: { integration_id: integrationId, spreadsheet_id: spreadsheetId, sheet_name: selectedTab, preview: true, header_row: headerRow },
});
```

Substituir por:
```tsx
const { data, error } = await supabase.functions.invoke("sync-google-sheets-meta", {
  body: { spreadsheet_id: spreadsheetId, sheet_name: selectedTab, preview: true, header_row: headerRow },
});
```

- [ ] **Step 5: Remover `integration_id` do INSERT em `handleSave`**

Localizar:
```tsx
const { error } = await supabase.from("sheet_sync_configs").insert({
  organization_id: organizationId,
  user_id: user.id,
  integration_id: integrationId,
  spreadsheet_id: spreadsheetId,
```

Substituir por (sem a linha `integration_id`):
```tsx
const { error } = await supabase.from("sheet_sync_configs").insert({
  organization_id: organizationId,
  user_id: user.id,
  spreadsheet_id: spreadsheetId,
```

- [ ] **Step 6: Adicionar banner de instrução na etapa 1**

Localizar (dentro do `step === 1`):
```tsx
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="link">Link da planilha</Label>
              <Input
```

Substituir por:
```tsx
        {step === 1 && (
          <div className="space-y-4">
            <Card className="border-[#0F9D58]/30 bg-[#0F9D58]/5">
              <CardContent className="p-3 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#0F9D58]" />
                <div className="text-xs space-y-1">
                  <p><strong>Antes de continuar:</strong> compartilhe a planilha com o email abaixo (Visualização):</p>
                  <code className="block bg-background border rounded px-2 py-1 text-[11px] font-mono break-all select-all">
                    {saEmail || '(email não configurado)'}
                  </code>
                  <p className="text-muted-foreground">Sem isso, o CRM não consegue ler os dados.</p>
                </div>
              </CardContent>
            </Card>
            <div>
              <Label htmlFor="link">Link da planilha</Label>
              <Input
```

- [ ] **Step 7: Melhorar mensagem de erro 403**

Localizar (dentro de `fetchSpreadsheetMeta`, no catch):
```tsx
    } catch (err: any) {
      toast({ title: "Não consegui ler a planilha", description: err.message || "Verifique se a planilha está compartilhada com sua conta Google.", variant: "destructive" });
    } finally {
```

Substituir por:
```tsx
    } catch (err: any) {
      const isPermissionErr = /permiss|403|compartilhad/i.test(err.message || '');
      toast({
        title: isPermissionErr ? "Planilha não compartilhada" : "Não consegui ler a planilha",
        description: isPermissionErr
          ? `Compartilhe a planilha com ${saEmail || 'o email do CRM'} (Visualização) e tente novamente.`
          : err.message || 'Verifique o link e tente novamente.',
        variant: "destructive",
        duration: isPermissionErr ? 8000 : 5000,
      });
    } finally {
```

- [ ] **Step 8: Smoke test build**

```bash
npm run build 2>&1 | tail -5
```

Esperado: `✓ built in Xs`.

- [ ] **Step 9: Commit**

```bash
git add src/components/ConnectGoogleSheetDialog.tsx
git commit -m "$(cat <<'EOF'
refactor(sheets): drop integration_id, add SA share banner

Dialog now receives saEmail prop (SA's address) instead of
integrationId. Step 1 has a prominent green banner showing the
email the user must share their sheet with. 403 errors get a
clearer message pointing back to the share step.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Atualizar `Integrations.tsx`

**Files:**
- Modify: `src/pages/Integrations.tsx`

- [ ] **Step 1: Remover query a `google_sheets_integrations`**

Localizar:
```tsx
      const { data: gsheetsData } = await supabase
        .from("google_sheets_integrations").select("id, is_active").eq("organization_id", organizationId).eq("is_active", true).maybeSingle();

      const { count: gsheetsCount } = await supabase
        .from("sheet_sync_configs").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_active", true);
```

Substituir por (apenas a query de count fica):
```tsx
      const { count: gsheetsCount } = await supabase
        .from("sheet_sync_configs").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_active", true);
```

- [ ] **Step 2: Atualizar o retorno da query**

Localizar:
```tsx
        gsheetsConnected: !!gsheetsData?.is_active,
        gsheetsActiveCount: gsheetsCount || 0,
```

Substituir por:
```tsx
        gsheetsConnected: (gsheetsCount || 0) > 0,
        gsheetsActiveCount: gsheetsCount || 0,
```

- [ ] **Step 3: Smoke test build**

```bash
npm run build 2>&1 | tail -5
```

Esperado: `✓ built in Xs`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Integrations.tsx
git commit -m "$(cat <<'EOF'
refactor(integrations): derive Sheets connected from configs count

Tabela google_sheets_integrations não existe mais — o card é
considerado "conectado" quando há pelo menos uma sheet_sync_config
ativa na organização.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Reescrever `docs/GOOGLE_SHEETS_SETUP.md`

**Files:**
- Modify: `docs/GOOGLE_SHEETS_SETUP.md` (rewrite completo)

- [ ] **Step 1: Sobrescrever o arquivo**

```markdown
# Setup do Google Sheets — Service Account

A integração de sincronização Google Sheets usa uma única **Service Account** do projeto Kairoz. Os usuários compartilham suas planilhas com o email da SA — sem OAuth, sem login Google, sem app verification.

Este documento descreve o setup one-time. Após isso, qualquer organização do CRM pode conectar planilhas livremente.

## 1. Criar a Service Account

1. Acesse https://console.cloud.google.com/iam-admin/serviceaccounts no projeto Google Cloud que já hospeda as credenciais do Calendar (mesmo projeto).
2. Clique em **+ CREATE SERVICE ACCOUNT**.
3. Preencha:
   - **Service account name:** `kairoz-sheets-sync`
   - **Service account ID:** `kairoz-sheets-sync` (preenchido automaticamente)
   - **Description:** `Sincronização de planilhas para o CRM Kairoz`
4. Clique em **CREATE AND CONTINUE**.
5. Pule as duas próximas telas (sem roles, sem grant access). Clique em **DONE**.
6. Anote o email gerado: `kairoz-sheets-sync@<SEU-PROJECT-ID>.iam.gserviceaccount.com`.

## 2. Gerar a chave privada (JSON)

1. Na lista de Service Accounts, clique em `kairoz-sheets-sync@...`.
2. Aba **KEYS** → **ADD KEY** → **Create new key**.
3. Escolha **JSON** → **CREATE**.
4. Salve o arquivo `.json` baixado em local seguro. Esta é a única vez que a private key é exibida.

## 3. Habilitar a Sheets API

1. Acesse https://console.cloud.google.com/apis/library/sheets.googleapis.com no mesmo projeto.
2. Se não estiver ativada, clique em **ENABLE**.

(Drive API NÃO é necessária neste fluxo — a SA acessa apenas as planilhas explicitamente compartilhadas com ela.)

## 4. Configurar secrets no Supabase

A partir do diretório do projeto:

```bash
SA_EMAIL=$(jq -r .client_email caminho/para/sa-key.json)
SA_PRIVATE_KEY=$(jq -r .private_key caminho/para/sa-key.json)

npx supabase secrets set GOOGLE_SA_EMAIL="$SA_EMAIL" --project-ref uxttihjsxfowursjyult
npx supabase secrets set GOOGLE_SA_PRIVATE_KEY="$SA_PRIVATE_KEY" --project-ref uxttihjsxfowursjyult

# Remover secret antigo do fluxo OAuth (se existir)
npx supabase secrets unset GOOGLE_SHEETS_ENCRYPTION_KEY --project-ref uxttihjsxfowursjyult
```

Verificar:
```bash
npx supabase secrets list --project-ref uxttihjsxfowursjyult | grep GOOGLE_SA
```

## 5. Configurar `.env.local`

Adicionar ao `.env.local` do frontend (não commitar):

```
VITE_GOOGLE_SA_EMAIL=kairoz-sheets-sync@<SEU-PROJECT-ID>.iam.gserviceaccount.com
```

## 6. Pronto — fluxo do usuário final

1. Abra `http://localhost:8080/integrations` (ou produção).
2. Card verde **Google Sheets** → **Gerenciar**.
3. O CRM mostra o email da SA com botão **Copiar**.
4. No Google Sheets, abra a planilha → **Compartilhar** → cole o email → escolha **Visualizador** → enviar.
5. No CRM, **Conectar planilha** → cole o link → escolha aba → mapeie colunas → salvar.
6. Novos leads aparecem em até 2 minutos.

## Recursos criados

- **3 tabelas:** `sheet_sync_configs`, `sheet_processed_rows`, `sheet_sync_logs`.
- **2 Edge Functions:** `sync-google-sheets` (cron), `sync-google-sheets-meta` (UI helper).
- **1 cron job:** `sync-google-sheets` rodando a cada 2 minutos via pg_cron + pg_net.
- **2 secrets:** `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`.

## Decisões arquiteturais

- **Single Service Account, multi-tenant.** Uma SA serve todas as organizações do Kairoz. Isolamento entre tenants é feito por `organization_id` + RLS na tabela `sheet_sync_configs`.
- **Sem persistência de tokens.** O JWT é assinado em runtime e o access_token (válido 1h) fica em cache de memória do worker. Cold-start pega ~50ms para gerar.
- **Hash de campos-chave normalizados** (telefone + email + nome). Edição de outras colunas não duplica o lead. PRIMARY KEY composta `(config_id, row_hash)` em `sheet_processed_rows` garante idempotência sob retry.
- **Cap por sync:** 6 configs/tick × 1 read/config a cada 2 min = ~3 reads/min, dentro da quota Sheets API de 300/min/projeto.
- **Atribuição configurável** por planilha: "quem conectou" (default), "roleta de leads" ou "coluna específica da planilha".
- **Locale BR:** parsers para telefone, moeda (`R$ 1.234,56`) e data (`01/05/2026`).
- **Circuit breaker:** após 3 erros consecutivos, a config é desativada automaticamente.

## Onde olhar se algo der errado

- **Logs do cron:** Supabase Dashboard → Database → Cron Jobs → `sync-google-sheets`.
- **Logs por config:** o próprio CRM mostra histórico de sincronização (botão de alerta no card da planilha).
- **Logs da Edge Function:** Supabase Dashboard → Functions → `sync-google-sheets` → Logs.

## Erros comuns

| Sintoma | Causa | Resolução |
|---|---|---|
| `Sem permissão. Confirme que a planilha foi compartilhada...` | Usuário não compartilhou a planilha com o email da SA | Compartilhar com permissão de Visualização |
| `Falha ao obter token SA: 401 invalid_grant` | Private key incorreta no secret | Re-extrair do JSON original e re-aplicar `npx supabase secrets set` |
| `GOOGLE_SA_EMAIL não configurado` | Secret ausente | Aplicar Step 4 deste documento |
| `Sheets API 429` | Quota excedida (300 reads/min/projeto) | Esperar 1 min; em escala, reduzir cap por config ou subir intervalo |

## Rollback completo

```bash
# Apagar cron e tabelas
npx supabase db query --linked <<EOF
SELECT cron.unschedule('sync-google-sheets');
DROP TABLE IF EXISTS public.sheet_sync_logs CASCADE;
DROP TABLE IF EXISTS public.sheet_processed_rows CASCADE;
DROP TABLE IF EXISTS public.sheet_sync_configs CASCADE;
EOF

# Apagar Edge Functions
npx supabase functions delete sync-google-sheets --project-ref uxttihjsxfowursjyult
npx supabase functions delete sync-google-sheets-meta --project-ref uxttihjsxfowursjyult

# Apagar secrets
npx supabase secrets unset GOOGLE_SA_EMAIL --project-ref uxttihjsxfowursjyult
npx supabase secrets unset GOOGLE_SA_PRIVATE_KEY --project-ref uxttihjsxfowursjyult
```

Calendar continua intacto.
```

- [ ] **Step 2: Commit**

```bash
git add docs/GOOGLE_SHEETS_SETUP.md
git commit -m "$(cat <<'EOF'
docs(sheets): rewrite setup guide for Service Account flow

Replaces OAuth setup (redirect URIs, consent screen, scopes) with
a clean Service Account guide: create SA → download key → set 2
secrets → done. Includes troubleshooting table and rollback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Smoke test E2E

**Files:** Nenhum arquivo modificado. Validação ponta-a-ponta da implementação.

> **Pré-requisitos:** Tasks 1-9 completas. Setup operacional (Task 1) feito pelo usuário com email da SA real disponível.

- [ ] **Step 1: Subir o dev server**

```bash
cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
npm run dev
```

Esperado: servidor em `http://localhost:8080/`.

- [ ] **Step 2: Validar que a UI exibe o email da SA**

1. Abrir `http://localhost:8080/integrations`.
2. Login com a conta de teste (a que tem organização ativa).
3. Card verde **Google Sheets** → **Gerenciar**.
4. Card de instrução deve mostrar o email da SA. Clicar em **Copiar** → toast "Email copiado!".

Se aparecer `(VITE_GOOGLE_SA_EMAIL não configurada)`, voltar à Task 1 Step 5.

- [ ] **Step 3: Criar planilha de teste no Google Sheets**

1. https://sheets.new (nova planilha).
2. Linha 1: cabeçalhos `Nome | Telefone | Email | Cidade | Valor`.
3. Linha 2: `João Silva | (11) 98765-4321 | joao@example.com | São Paulo | R$ 5.000,00`.
4. Linha 3: `Maria Santos | 11 91234-5678 | maria@example.com | Rio | 12345.67`.
5. **Compartilhar** → colar o email da SA → permissão **Visualizador** → **Enviar**.
6. Copiar a URL da barra do navegador.

- [ ] **Step 4: Conectar a planilha no CRM**

1. No CRM, **Conectar planilha** → colar o link → **Continuar**.
2. Esperado: lista de abas (deve mostrar a aba padrão, geralmente "Página1").
3. Selecionar aba → linha do cabeçalho `1` → **Continuar**.
4. Esperado: tela de mapeamento com todas as 5 colunas detectadas.
5. Auto-mapping deve ter pego: Nome → `nome_lead`, Telefone → `telefone_lead`, Email → `email`, Valor → `valor`. Cidade fica em `additional_data`.
6. Funil destino: padrão. Etapa: padrão. Frequência: 2 min. Atribuição: "Eu (quem conectou)".
7. **Salvar e ativar**.

- [ ] **Step 5: Verificar que os 2 leads apareceram**

1. Aguardar até 30 segundos (a config tem `next_sync_at = now()` na criação, então o próximo tick do cron pega imediatamente).
2. Abrir `/pipeline` → ver dois cards novos: João Silva e Maria Santos.
3. Clicar no card do João → verificar:
   - Telefone: `11987654321` (normalizado, sem máscara)
   - Email: `joao@example.com` (lowercase)
   - Valor: `5000` (numérico, parseado de "R$ 5.000,00")
   - additional_data deve conter `{ "Cidade": "São Paulo" }`

- [ ] **Step 6: Adicionar uma linha nova e validar a sincronização**

1. No Google Sheets, adicionar linha 4: `Carlos Lima | 21 99999-8888 | carlos@example.com | Salvador | 3000`.
2. Aguardar até 2 minutos.
3. No CRM, voltar ao /pipeline → terceiro card aparece (Carlos Lima).
4. Confirmar que João e Maria não foram duplicados.

- [ ] **Step 7: Verificar tela de log de sincronização**

1. Em `/integrations` → Google Sheets → Gerenciar.
2. Card da planilha conectada → ícone de alerta (logs).
3. Esperado: histórico das sincronizações com `rows_read`, `rows_new`, `rows_skipped`, `duration_ms`.

- [ ] **Step 8: Testar erro 403 (planilha não compartilhada)**

1. No CRM, tentar **Conectar planilha** com link de uma planilha que NÃO foi compartilhada com a SA (ou criar uma nova privada).
2. Esperado: toast "Planilha não compartilhada — Compartilhe a planilha com `<email-da-SA>` (Visualização) e tente novamente." Duração 8s.

- [ ] **Step 9: Sinalizar conclusão**

Se todos os steps passaram, sincronização Service Account funcionando ponta a ponta. Reportar ao usuário com os 3 IDs de leads criados como evidência (`SELECT id, nome_lead, source, created_at FROM leads WHERE source LIKE 'Sheets%' ORDER BY created_at DESC LIMIT 5`).

---

## Self-Review Checklist (do implementador)

Após concluir todas as tasks, validar:

- [ ] Não há mais nenhuma referência a `google_sheets_integrations` ou `google_sheets_tokens` no código (`grep -r "google_sheets_integrations\|google_sheets_tokens" src/ supabase/ docs/` deve retornar zero hits — exceto migrations históricas).
- [ ] Não há mais nenhuma referência a `integration_id` em `sheet_sync_configs` no código (`grep -rn "integration_id" src/ supabase/functions/` deve mostrar apenas `google_calendar_*` files se houver).
- [ ] As Edge Functions `google-sheets-oauth-initiate` e `google-sheets-oauth-callback` foram apagadas tanto do repo quanto do projeto Supabase remoto.
- [ ] A migration `20260503120000_google_sheets_service_account.sql` foi aplicada no remoto (visível em `npx supabase migration list --linked`).
- [ ] `npm run build` passa sem erros novos (erros TS pré-existentes em outros arquivos não afetam).
- [ ] Os 3 secrets do Supabase estão corretos: `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY` presentes; `GOOGLE_SHEETS_ENCRYPTION_KEY` ausente.
- [ ] `VITE_GOOGLE_SA_EMAIL` está em `.env.local` (e NÃO em `.env` versionado).
