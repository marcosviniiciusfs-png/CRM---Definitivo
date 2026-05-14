# Lead Channel Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ability to transfer a WhatsApp conversation from channel A to channel B, where the lead becomes visible in both channels with isolated message threads going forward, and B sees A's prior history as read-only context.

**Architecture:** A new `lead_channel_memberships(lead_id, whatsapp_instance_id)` table represents the many-to-many relation between leads and channels. `mensagens_chat` gains a `whatsapp_instance_id` column so messages can be filtered per channel. The Chat sidebar switches from "one row per lead" to "one row per membership". A new Edge Function `transfer-lead-to-channel` performs the explicit transfer; the existing webhook and send functions get small writes to keep the new data in sync.

**Tech Stack:** Supabase (Postgres + RLS + Realtime + Edge Functions), React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix-based), `@supabase/supabase-js`, `@tanstack/react-query`.

**Spec:** `docs/superpowers/specs/2026-05-13-lead-channel-transfer-design.md`

**Branch / worktree:** All work happens in worktree `../crm-lead-transfer` on branch `feature/lead-channel-transfer` (already created from `origin/main`). The remote tracking branch already exists. Push regularly; **do NOT merge into `main`** until the entire plan is complete and the user has validated end-to-end on the Vercel preview.

---

## Context for engineer (read once)

You have zero context on this codebase. Key things to know:

- **Migrations** live in `supabase/migrations/`, named `YYYYMMDDHHMMSS_<topic>.sql`. They run in lexicographic order on Supabase remote. Use timestamp `20260513120000` and later for files in this plan.
- **Edge Functions** are Deno-based, live in `supabase/functions/<name>/index.ts`. Shared helpers in `supabase/functions/_shared/`. Deploy via Supabase MCP (`mcp__plugin_supabase_supabase__deploy_edge_function`), NOT git push.
- **RLS pattern:** the project uses `organization_members` for org scoping. New SELECT policies should mirror existing `mensagens_chat` policy. WCM (whatsapp_channel_members) is a frontend-only filter — RLS stays org-scoped.
- **Chat UI** lives in `src/pages/Chat.tsx` (~1900 LOC). Heavy use of Realtime channels and React Query. The component is large and deserves a refactor in this work but keep changes incremental — don't restructure unrelated parts.
- **Recent precedent:** commit `969a284` (multi-org fix) replaced direct `organization_members` lookups in Chat.tsx with `organizationId` from `useOrganizationReady`. Follow the same pattern when adding new queries.
- **Channel visibility:** `useAssignedChannels` hook returns the user's WCM channels. Owner/admin gets `null` (bypass). Set vazio = legacy (all visible, no opt-in). `isLeadVisibleByChannel(leadInstanceId, assignedChannelIds)` is the standard guard.
- **No unit test framework:** verification = `tsc --noEmit` + `vite build` + Supabase MCP SQL queries + manual smoke on Vercel preview.
- **The user wants NO production deploy until validation.** Push commits freely; the merge to `main` is gated.

---

## File structure (changes in this plan)

| Path | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260513120000_lead_channel_transfer.sql` | Create | Schema: new table, new column, indexes, RLS, realtime publication, backfill memberships |
| `supabase/functions/whatsapp-message-webhook/index.ts` | Modify (2 spots) | UPSERT membership on inbound; INSERT mensagens_chat with `whatsapp_instance_id` |
| `supabase/functions/send-whatsapp-message/index.ts` | Modify (1 spot) | INSERT mensagens_chat with `whatsapp_instance_id`; UPDATE membership.last_message_at |
| `supabase/functions/send-whatsapp-media/index.ts` | Modify (1 spot) | Same as above |
| `supabase/functions/send-whatsapp-audio/index.ts` | Modify (1 spot) | Same as above (verify if this file exists; if not, skip) |
| `supabase/functions/transfer-lead-to-channel/index.ts` | Create | NEW: validate permission + INSERT membership 'transferred' |
| `src/hooks/useLeadMemberships.ts` | Create | Hook returning the user's visible (lead × channel) cards |
| `src/components/chat/TransferLeadDialog.tsx` | Create | Modal listing eligible channels for transfer |
| `src/components/chat/TransferDivider.tsx` | Create | Visual separator in conversation thread |
| `src/components/chat/ChatLeadItem.tsx` | Modify | Add right-click context menu / long-press for "Transferir" |
| `src/components/chat/VirtualizedMessageList.tsx` | Modify | Split rendering into read-only top + interactive below when membership is 'transferred' |
| `src/pages/Chat.tsx` | Modify | Switch leads list to memberships; add selectedMembership state; filter msgs by channel |
| `src/contexts/ChatMessageNotificationContext.tsx` | Modify | Subscribe to `lead_channel_memberships` INSERTs and fire toast |
| Backfill script | One-time | Backfill `mensagens_chat.whatsapp_instance_id` in batches via Supabase MCP |

---

## Task 1: Database schema migration

**Files:**
- Create: `supabase/migrations/20260513120000_lead_channel_transfer.sql`

- [ ] **Step 1.1: Write the migration**

```sql
-- ============================================================
-- Lead Channel Memberships (transferencia entre canais WhatsApp)
-- ============================================================
-- Permite que um mesmo lead exista simultaneamente em multiplos
-- canais WhatsApp da mesma org, com conversas isoladas por canal
-- (cada msg ganha whatsapp_instance_id). Quando atendimento
-- transfere o lead para suporte, criamos a membership com
-- source='transferred' marcando transferred_from + transferred_at,
-- e a UI mostra o historico do canal de origem como read-only.
-- ============================================================

-- 1) Nova coluna em mensagens_chat: canal pelo qual a msg
-- entrou/saiu. NULL aceitavel durante a janela de backfill;
-- novos inserts (apos deploy das Edge Functions) preenchem.
ALTER TABLE public.mensagens_chat
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID
  REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mensagens_chat_lead_instance_data
  ON public.mensagens_chat (id_lead, whatsapp_instance_id, data_hora DESC);

-- 2) Nova tabela de memberships
CREATE TABLE IF NOT EXISTS public.lead_channel_memberships (
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('inbound', 'transferred')),
  transferred_from_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  transferred_at TIMESTAMPTZ,
  transferred_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lead_id, whatsapp_instance_id),
  CONSTRAINT transferred_fields_consistency CHECK (
    (source = 'transferred' AND transferred_from_instance_id IS NOT NULL AND transferred_at IS NOT NULL)
    OR (source = 'inbound' AND transferred_from_instance_id IS NULL AND transferred_at IS NULL AND transferred_by_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lcm_instance_lastmsg
  ON public.lead_channel_memberships (whatsapp_instance_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_lcm_org
  ON public.lead_channel_memberships (organization_id);

-- 3) RLS
ALTER TABLE public.lead_channel_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lcm_org_select ON public.lead_channel_memberships;
CREATE POLICY lcm_org_select ON public.lead_channel_memberships
  FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Sem policy de INSERT/UPDATE/DELETE: bloqueado para anon/authenticated.
-- Apenas service_role (Edge Functions) escreve. RLS bypass via service_role.

-- 4) Realtime publication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_channel_memberships;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 5) Backfill: lead com whatsapp_instance_id ganha membership 'inbound'
INSERT INTO public.lead_channel_memberships
  (lead_id, whatsapp_instance_id, organization_id, source, last_message_at, created_at)
SELECT id, whatsapp_instance_id, organization_id, 'inbound',
       COALESCE(last_message_at, updated_at, created_at), created_at
FROM public.leads
WHERE whatsapp_instance_id IS NOT NULL
ON CONFLICT (lead_id, whatsapp_instance_id) DO NOTHING;
```

- [ ] **Step 1.2: Apply migration via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with `name = "lead_channel_transfer"` and `query = <entire SQL above>`. Project ID: `uxttihjsxfowursjyult`.

Expected: success, no error. The MCP will run the SQL in a transaction.

- [ ] **Step 1.3: Verify schema via SQL**

Run via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='mensagens_chat' AND column_name='whatsapp_instance_id';

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='lead_channel_memberships'
ORDER BY ordinal_position;

SELECT COUNT(*) AS memberships_backfilled FROM public.lead_channel_memberships WHERE source='inbound';
SELECT COUNT(*) AS leads_with_whatsapp FROM public.leads WHERE whatsapp_instance_id IS NOT NULL;
```

Expected: `mensagens_chat.whatsapp_instance_id` exists as `uuid` nullable. `lead_channel_memberships` has all 10 columns. The two `COUNT` values match (every lead with a WhatsApp instance got a membership).

- [ ] **Step 1.4: Verify RLS by attempting an INSERT as authenticated**

Run via MCP execute_sql:

```sql
-- Test: confirm INSERT is blocked for authenticated (no service_role)
SET ROLE authenticated;
INSERT INTO public.lead_channel_memberships
  (lead_id, whatsapp_instance_id, organization_id, source)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'inbound');
RESET ROLE;
```

Expected: error like `new row violates row-level security policy` (because no INSERT policy exists for `authenticated`).

- [ ] **Step 1.5: Commit the migration file**

```bash
cd ../crm-lead-transfer
git add supabase/migrations/20260513120000_lead_channel_transfer.sql
git commit -m "feat(db): lead_channel_memberships + mensagens_chat.whatsapp_instance_id

- Nova tabela lead_channel_memberships (lead × canal) com source
  enum inbound/transferred e colunas de auditoria transferred_*
- Nova coluna mensagens_chat.whatsapp_instance_id (nullable) com FK
  e indice composto para query por canal
- RLS: SELECT por org-member; INSERT/UPDATE/DELETE so service_role
- Backfill: cada lead com whatsapp_instance_id ganha row inbound
- ALTER PUBLICATION realtime para a tabela nova

Aplicado via Supabase MCP. Backfill de mensagens_chat fica em task
separada (batched, fora da migration)."

git push origin feature/lead-channel-transfer
```

---

## Task 2: Backfill `mensagens_chat.whatsapp_instance_id`

The migration left the new column NULL for existing rows. Backfill now in batches to avoid timing out.

**Files:** No files. Runtime work via Supabase MCP.

- [ ] **Step 2.1: Count rows to backfill**

```sql
SELECT COUNT(*) AS rows_to_backfill
FROM public.mensagens_chat
WHERE whatsapp_instance_id IS NULL;
```

Record the number. If under ~50k, a single UPDATE works. If over, batch.

- [ ] **Step 2.2: Run batched UPDATE (PL/pgSQL DO block)**

Run via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
DO $$
DECLARE
  total INT := 0;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE public.mensagens_chat m
    SET whatsapp_instance_id = l.whatsapp_instance_id
    FROM public.leads l
    WHERE m.id_lead = l.id
      AND m.whatsapp_instance_id IS NULL
      AND l.whatsapp_instance_id IS NOT NULL
      AND m.id IN (
        SELECT id FROM public.mensagens_chat
        WHERE whatsapp_instance_id IS NULL
        LIMIT 5000
      );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total := total + rows_updated;
    EXIT WHEN rows_updated = 0;
  END LOOP;
  RAISE NOTICE 'Total rows updated: %', total;
END $$;
```

Expected: completes within MCP timeout. If it times out, run repeatedly — each call processes ~5k rows per iteration internally until empty, but if the outer query keeps reissuing the same set, you'll need to chunk by id range or last_seen-id watermark.

**Fallback if it times out:** run the DO block in multiple invocations, or process by `id_lead` range:

```sql
-- Chunk by lead id ranges, run multiple times
UPDATE public.mensagens_chat m
SET whatsapp_instance_id = l.whatsapp_instance_id
FROM public.leads l
WHERE m.id_lead = l.id
  AND m.whatsapp_instance_id IS NULL
  AND l.whatsapp_instance_id IS NOT NULL
  AND l.id >= '00000000-0000-0000-0000-000000000000' -- adjust per batch
  AND l.id <  '40000000-0000-0000-0000-000000000000';
```

- [ ] **Step 2.3: Verify backfill complete**

```sql
SELECT
  COUNT(*) FILTER (WHERE whatsapp_instance_id IS NULL) AS still_null,
  COUNT(*) FILTER (WHERE whatsapp_instance_id IS NOT NULL) AS backfilled,
  COUNT(*) AS total
FROM public.mensagens_chat;
```

Expected: `still_null` reflects only messages whose lead never had a `whatsapp_instance_id` (Facebook leads, manual leads). For leads where `leads.whatsapp_instance_id IS NOT NULL`, all messages should be backfilled.

Sanity check:
```sql
SELECT COUNT(*) AS orphan_msgs
FROM public.mensagens_chat m
JOIN public.leads l ON l.id = m.id_lead
WHERE m.whatsapp_instance_id IS NULL
  AND l.whatsapp_instance_id IS NOT NULL;
```

Expected: 0.

- [ ] **Step 2.4: No commit (no file changes). Move to next task.**

---

## Task 3: Webhook writes `whatsapp_instance_id` + UPSERT membership

**Files:**
- Modify: `supabase/functions/whatsapp-message-webhook/index.ts`

The webhook resolves `instanceId`, `organizationId`, and the lead. Add: (a) write `whatsapp_instance_id` on the mensagens_chat INSERT, (b) UPSERT a `lead_channel_memberships` row.

- [ ] **Step 3.1: Locate the mensagens_chat INSERT for direct messages**

In `supabase/functions/whatsapp-message-webhook/index.ts`, search for the line that inserts into `mensagens_chat` for non-group, non-fromMe messages. It is around the bottom of the file after the lead create/lookup section. The current insert object looks roughly like:

```ts
const { error: insertError } = await supabase
  .from('mensagens_chat')
  .insert({
    id_lead: leadId,
    corpo_mensagem: messageContent,
    direcao: isFromMe ? 'SAIDA' : 'ENTRADA',
    // ... other fields ...
  });
```

There may be more than one INSERT site (e.g., one for fromMe sent-from-phone, one for inbound). Locate ALL of them and apply the same fix.

- [ ] **Step 3.2: Add `whatsapp_instance_id: instanceId` to every mensagens_chat insert in the webhook**

In each `.insert({...})` call for mensagens_chat in this file, add the line:

```ts
whatsapp_instance_id: instanceId,
```

where `instanceId` is the variable already available in scope (it was resolved earlier from the instance_name lookup in `whatsapp_instances`).

- [ ] **Step 3.3: Add UPSERT into `lead_channel_memberships` right after the lead is created/found**

After the block that resolves `leadId` (both for existing and newly created leads), add the upsert. Place it BEFORE the mensagens_chat INSERT so the membership exists by the time the message lands:

```ts
// Mantem lead_channel_memberships sincronizado: cliente texta um numero ->
// lead passa a existir naquele canal (source='inbound') ou atualiza
// last_message_at se ja existia. Se a membership veio de transferencia
// (source='transferred'), nao sobrescreve — ON CONFLICT preserva.
const { error: lcmError } = await supabase
  .from('lead_channel_memberships')
  .upsert(
    {
      lead_id: leadId,
      whatsapp_instance_id: instanceId,
      organization_id: organizationId,
      source: 'inbound',
      last_message_at: new Date().toISOString(),
    },
    {
      onConflict: 'lead_id,whatsapp_instance_id',
      ignoreDuplicates: false, // queremos UPDATE em last_message_at
    }
  );

if (lcmError) {
  console.error('⚠️ Erro ao upsert lead_channel_memberships (nao bloqueia):', lcmError);
}
```

**Important:** `ignoreDuplicates: false` + UPSERT will UPDATE on conflict. But we want to update only `last_message_at`, NOT overwrite `source='transferred'` back to `'inbound'`. The supabase-js `.upsert()` doesn't support partial update. Use raw SQL via RPC OR change approach:

**Use this approach instead** (cleaner — two queries: try INSERT, on conflict do UPDATE on last_message_at only):

```ts
// Tenta INSERT (caso comum: primeira msg desse lead nesse canal).
const { error: insertLcmError } = await supabase
  .from('lead_channel_memberships')
  .insert({
    lead_id: leadId,
    whatsapp_instance_id: instanceId,
    organization_id: organizationId,
    source: 'inbound',
    last_message_at: new Date().toISOString(),
  });

if (insertLcmError) {
  // 23505 = unique violation: ja existe. Atualiza apenas last_message_at,
  // preservando source='transferred' se ja foi transferido.
  const code = (insertLcmError as any)?.code;
  if (code === '23505') {
    const { error: updateLcmError } = await supabase
      .from('lead_channel_memberships')
      .update({ last_message_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .eq('whatsapp_instance_id', instanceId);

    if (updateLcmError) {
      console.error('⚠️ Erro ao UPDATE last_message_at em lead_channel_memberships:', updateLcmError);
    }
  } else {
    console.error('⚠️ Erro ao INSERT em lead_channel_memberships (nao bloqueia):', insertLcmError);
  }
}
```

- [ ] **Step 3.4: Deploy webhook via Supabase MCP**

Use `mcp__plugin_supabase_supabase__deploy_edge_function` with:
- `name`: `whatsapp-message-webhook`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `false` (webhooks don't have user JWT)
- `files`: array with `{name: "index.ts", content: <full updated file content>}`. Also include `_shared/cors.ts` and `_shared/evolution-config.ts` if the MCP requires bundling deps. Check current deploy command for this function.

Verify with `mcp__plugin_supabase_supabase__list_edge_functions` that the version bumped.

- [ ] **Step 3.5: Live test — send a WhatsApp message to a connected channel and verify DB**

This requires a real WhatsApp message. Use any connected instance. After sending one message from a test phone to the instance:

```sql
-- Last message
SELECT id, id_lead, whatsapp_instance_id, direcao, data_hora
FROM public.mensagens_chat
ORDER BY data_hora DESC LIMIT 1;

-- Corresponding membership row
SELECT lcm.* FROM public.lead_channel_memberships lcm
JOIN public.mensagens_chat m ON m.id_lead = lcm.lead_id AND m.whatsapp_instance_id = lcm.whatsapp_instance_id
WHERE m.id = (SELECT id FROM public.mensagens_chat ORDER BY data_hora DESC LIMIT 1);
```

Expected: the message has `whatsapp_instance_id` populated. The membership row exists with `last_message_at` close to NOW().

- [ ] **Step 3.6: Commit**

```bash
git add supabase/functions/whatsapp-message-webhook/index.ts
git commit -m "feat(webhook): preencher whatsapp_instance_id em mensagens_chat + upsert membership

- INSERT em mensagens_chat agora passa whatsapp_instance_id = instanceId
  resolvido do webhook (canal de onde a msg chegou)
- INSERT/UPDATE em lead_channel_memberships: cliente texta um canal
  passa a ser membership 'inbound' automaticamente. Se ja existia (caso
  comum: lead respondendo), so atualiza last_message_at — preserva
  source='transferred' se estava transferido
- Falhas no LCM nao bloqueiam (log warning); a mensagem core continua
  sendo inserida"

git push origin feature/lead-channel-transfer
```

---

## Task 4: Send Edge Functions write `whatsapp_instance_id` + update membership

**Files:**
- Modify: `supabase/functions/send-whatsapp-message/index.ts`
- Modify: `supabase/functions/send-whatsapp-media/index.ts`
- Modify: `supabase/functions/send-whatsapp-audio/index.ts` (if exists)

These functions are called by the frontend when the user sends a message. They already receive `instance_name`; resolve to `instance_id` and write it.

- [ ] **Step 4.1: Open `send-whatsapp-message/index.ts` and locate the mensagens_chat INSERT**

Search for `.from('mensagens_chat').insert(`. The insert object includes `id_lead`, `corpo_mensagem`, `direcao: 'SAIDA'`, etc.

- [ ] **Step 4.2: Resolve `instance_id` from `instance_name` (if not already)**

Near the top of the request handler, after parsing the body and getting `instance_name`, look up the instance:

```ts
const { data: instanceRow, error: instanceLookupError } = await supabaseAdmin
  .from('whatsapp_instances')
  .select('id, organization_id')
  .eq('instance_name', instance_name)
  .single();

if (instanceLookupError || !instanceRow) {
  return new Response(
    JSON.stringify({ success: false, error: 'Instancia nao encontrada' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
  );
}

const instanceId = instanceRow.id;
const organizationId = instanceRow.organization_id;
```

Skip this block if the file already resolves `instanceId` elsewhere — search for `whatsapp_instances` to confirm.

- [ ] **Step 4.3: Add `whatsapp_instance_id: instanceId` to the mensagens_chat INSERT**

In the INSERT object:

```ts
.insert({
  id_lead: leadId,
  corpo_mensagem: message_text,
  direcao: 'SAIDA',
  evolution_message_id: data?.key?.id,
  status_entrega: 'SENT',
  data_hora: new Date().toISOString(),
  whatsapp_instance_id: instanceId, // NEW
  // ... existing fields
});
```

- [ ] **Step 4.4: After the INSERT succeeds, UPDATE membership.last_message_at**

```ts
// Atualiza last_message_at na membership do canal de envio para
// que a sidebar reordene corretamente. INSERT da membership nao
// rola aqui — assume-se que ja existe (lead ja era visivel no Chat
// pra esse user, logo membership ja foi criada pelo webhook ou
// transfer-lead-to-channel).
const { error: updateLcmError } = await supabaseAdmin
  .from('lead_channel_memberships')
  .update({ last_message_at: new Date().toISOString() })
  .eq('lead_id', leadId)
  .eq('whatsapp_instance_id', instanceId);

if (updateLcmError) {
  console.warn('⚠️ Falha ao atualizar last_message_at em lead_channel_memberships:', updateLcmError);
}
```

- [ ] **Step 4.5: Repeat Steps 4.1–4.4 in `send-whatsapp-media/index.ts`**

Same pattern. The file may have multiple INSERT sites (image vs document vs audio). Apply to all.

- [ ] **Step 4.6: Check `send-whatsapp-audio/index.ts`**

Run from the project root:

```bash
ls supabase/functions/send-whatsapp-audio/
```

If the directory exists, repeat Steps 4.1–4.4 there. If not, skip — audio is likely handled by send-whatsapp-media.

- [ ] **Step 4.7: Deploy all modified Edge Functions via MCP**

For each modified function, use `mcp__plugin_supabase_supabase__deploy_edge_function`:

```
name: send-whatsapp-message
entrypoint_path: index.ts
verify_jwt: true
files: [{name: "index.ts", content: <full content>}]
```

Repeat for `send-whatsapp-media` (and `send-whatsapp-audio` if it exists). `verify_jwt: true` — these are called from the authenticated frontend.

- [ ] **Step 4.8: Live test — send a message from the CRM**

Open the CRM (any environment with the deployed Edge Functions — preview is fine). Send a text message to a lead. Then verify in MCP SQL:

```sql
SELECT id, id_lead, whatsapp_instance_id, direcao, data_hora
FROM public.mensagens_chat
WHERE direcao = 'SAIDA'
ORDER BY data_hora DESC LIMIT 1;
```

Expected: row has `whatsapp_instance_id` populated.

- [ ] **Step 4.9: Commit**

```bash
git add supabase/functions/send-whatsapp-message/index.ts \
       supabase/functions/send-whatsapp-media/index.ts
# add send-whatsapp-audio/index.ts if modified
git commit -m "feat(send): preencher whatsapp_instance_id + atualizar membership

- send-whatsapp-message, send-whatsapp-media (e -audio se aplicavel)
  passam whatsapp_instance_id no INSERT de mensagens_chat
- Apos INSERT, atualizam lead_channel_memberships.last_message_at
  da row (lead_id, instance_id) para reordenar sidebar
- Resolucao instance_name -> instance_id via whatsapp_instances"

git push origin feature/lead-channel-transfer
```

---

## Task 5: New Edge Function `transfer-lead-to-channel`

**Files:**
- Create: `supabase/functions/transfer-lead-to-channel/index.ts`

- [ ] **Step 5.1: Create the function file**

```ts
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
    // 1) Resolver user logado via JWT
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

    // 2) Parse body
    const body: TransferRequestBody = await req.json();
    const { lead_id, target_instance_id } = body;

    if (!lead_id || !target_instance_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'lead_id e target_instance_id sao obrigatorios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 3) Resolver lead e validar org-membership do user
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

    // 4) Validar canal alvo: mesma org, conectado
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

    // 5) Identificar canal de origem da transferencia.
    //    Heuristica: o canal de onde o user enxerga o lead atualmente.
    //    Para owner/admin: usa o lead.whatsapp_instance_id como origem
    //    (canal "principal" do lead). Para member: requer WCM em algum
    //    canal cuja membership o lead tenha.
    let sourceInstanceId: string | null = null;

    if (isOwnerAdmin) {
      sourceInstanceId = lead.whatsapp_instance_id || null;
    } else {
      // Member: descobrir intersecao entre WCMs do user e memberships do lead
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
      const intersection = [...leadChannelSet].filter(id => userChannelSet.has(id));

      if (intersection.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sem permissao para transferir esse lead' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      // Pega o canal mais ativo (last_message_at desc) como origem
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

    // 6) Verificar se ja existe membership no canal alvo (idempotencia)
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

    // 7) INSERT da membership transferida
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
      JSON.stringify({ success: false, error: err.message || 'Erro desconhecido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
```

- [ ] **Step 5.2: Deploy via MCP**

`mcp__plugin_supabase_supabase__deploy_edge_function`:
- `name`: `transfer-lead-to-channel`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `true`
- `files`: array including `index.ts`. Shared imports (`../_shared/cors.ts`, `../_shared/evolution-config.ts`) are resolved by Deno runtime on the platform.

- [ ] **Step 5.3: Manual test — invoke via curl or Supabase client**

Use MCP execute_sql to find a valid test lead, target channel, and user token. Then test via `curl` (or any HTTP client):

```bash
curl -X POST 'https://uxttihjsxfowursjyult.supabase.co/functions/v1/transfer-lead-to-channel' \
  -H 'Authorization: Bearer <USER_JWT>' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"lead_id": "<LEAD_UUID>", "target_instance_id": "<INSTANCE_UUID>"}'
```

Expected: `{"success": true, ...}`. Verify in DB:

```sql
SELECT * FROM public.lead_channel_memberships
WHERE lead_id = '<LEAD_UUID>' AND source = 'transferred'
ORDER BY created_at DESC LIMIT 1;
```

The row should exist with `transferred_at`, `transferred_by_user_id`, etc. populated.

- [ ] **Step 5.4: Commit**

```bash
git add supabase/functions/transfer-lead-to-channel/index.ts
git commit -m "feat(edge): transfer-lead-to-channel

Nova Edge Function que materializa a transferencia de um lead de
um canal WhatsApp para outro:

1) Valida JWT do user
2) Valida org-membership do user no lead
3) Valida canal alvo (mesma org, status CONNECTED)
4) Determina canal de origem (lead.whatsapp_instance_id para
   owner/admin; intersecao WCM x lead_channel_memberships para
   member)
5) INSERT em lead_channel_memberships com source='transferred',
   transferred_from_instance_id, transferred_at, transferred_by_user_id
6) Retorna {success, lead_id, target_instance_id, source_instance_id,
   transferred_at}

Erros estruturados: 401 (sem JWT), 403 (sem permissao), 404 (lead/
canal nao existe), 409 (lead ja esta no canal), 400 (canal nao
conectado, origem=alvo)."

git push origin feature/lead-channel-transfer
```

---

## Task 6: Frontend hook `useLeadMemberships`

**Files:**
- Create: `src/hooks/useLeadMemberships.ts`

This hook is the new source of truth for "what shows in the chat sidebar". It queries `lead_channel_memberships` joined with `leads` and filters by the user's accessible channels (via WCM).

- [ ] **Step 6.1: Create the hook file**

```ts
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAssignedChannels } from "@/hooks/useAssignedChannels";

export interface LeadMembershipCard {
  // membership fields
  lead_id: string;
  whatsapp_instance_id: string;
  source: 'inbound' | 'transferred';
  transferred_from_instance_id: string | null;
  transferred_at: string | null;
  transferred_by_user_id: string | null;
  last_message_at: string | null;
  membership_created_at: string;
  // lead fields (joined)
  nome_lead: string;
  telefone_lead: string;
  email: string | null;
  stage: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
  last_seen: string | null;
  source_lead: string | null; // 'WhatsApp' / 'Facebook' / etc.
  responsavel: string | null;
  responsavel_user_id: string | null;
  lead_created_at: string;
  lead_updated_at: string;
  organization_id: string;
  lead_whatsapp_instance_id: string | null;
}

interface UseLeadMembershipsResult {
  cards: LeadMembershipCard[];
  loading: boolean;
  reload: () => Promise<void>;
}

const MAX_CARDS = 300;

/**
 * Carrega "cards" da sidebar do Chat = pares (lead, canal) que o user
 * tem acesso a ver. Substitui a query antiga direta em `leads`.
 *
 * - Owner/admin (hasFullAccess): ve todos os memberships da org.
 * - Member: ve memberships cujo whatsapp_instance_id esta no WCM dele,
 *   ou (legado) ve tudo se WCM esta vazio (sem opt-in).
 *
 * Ordenacao por last_message_at DESC NULLS LAST + lead.updated_at DESC.
 */
export function useLeadMemberships(): UseLeadMembershipsResult {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { assignedChannelIds, hasFullAccess, loading: wcmLoading } = useAssignedChannels();

  const [cards, setCards] = useState<LeadMembershipCard[]>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const reload = useCallback(async () => {
    if (!user?.id || !organizationId) return;
    if (wcmLoading) return; // espera WCM resolver
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      // Monta o filtro de canais visiveis
      let instanceFilter: string[] | null = null;
      if (!hasFullAccess) {
        if (assignedChannelIds === null) {
          // owner/admin (nao deveria cair aqui dado hasFullAccess, mas seguranca)
          instanceFilter = null;
        } else if (assignedChannelIds.size === 0) {
          // Legado: sem opt-in WCM, ve tudo (regra de retro-compat)
          instanceFilter = null;
        } else {
          instanceFilter = Array.from(assignedChannelIds);
        }
      }

      let query = supabase
        .from('lead_channel_memberships')
        .select(`
          lead_id,
          whatsapp_instance_id,
          source,
          transferred_from_instance_id,
          transferred_at,
          transferred_by_user_id,
          last_message_at,
          created_at,
          organization_id,
          lead:leads!inner (
            id, nome_lead, telefone_lead, email, stage, avatar_url,
            is_online, last_seen, source, responsavel, responsavel_user_id,
            created_at, updated_at, whatsapp_instance_id
          )
        `)
        .eq('organization_id', organizationId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(MAX_CARDS);

      if (instanceFilter) {
        query = query.in('whatsapp_instance_id', instanceFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('useLeadMemberships error:', error);
        return;
      }

      const mapped: LeadMembershipCard[] = (data || []).map((row: any) => ({
        lead_id: row.lead_id,
        whatsapp_instance_id: row.whatsapp_instance_id,
        source: row.source,
        transferred_from_instance_id: row.transferred_from_instance_id,
        transferred_at: row.transferred_at,
        transferred_by_user_id: row.transferred_by_user_id,
        last_message_at: row.last_message_at,
        membership_created_at: row.created_at,
        nome_lead: row.lead?.nome_lead || '',
        telefone_lead: row.lead?.telefone_lead || '',
        email: row.lead?.email || null,
        stage: row.lead?.stage || null,
        avatar_url: row.lead?.avatar_url || null,
        is_online: row.lead?.is_online ?? null,
        last_seen: row.lead?.last_seen || null,
        source_lead: row.lead?.source || null,
        responsavel: row.lead?.responsavel || null,
        responsavel_user_id: row.lead?.responsavel_user_id || null,
        lead_created_at: row.lead?.created_at || '',
        lead_updated_at: row.lead?.updated_at || '',
        organization_id: row.organization_id,
        lead_whatsapp_instance_id: row.lead?.whatsapp_instance_id ?? null,
      }));

      setCards(mapped);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [user?.id, organizationId, hasFullAccess, assignedChannelIds, wcmLoading]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { cards, loading, reload };
}
```

- [ ] **Step 6.2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 6.3: Commit (intermediate — hook only, not consumed yet)**

```bash
git add src/hooks/useLeadMemberships.ts
git commit -m "feat(hook): useLeadMemberships — fonte de verdade da sidebar do Chat

Hook que carrega ate 300 cards (par lead × canal) da org, filtrado
por canais visiveis ao user (WCM). Substitui a query direta em leads
no Chat.tsx no proximo commit.

Regras de filtro:
- Owner/admin: todos memberships
- Member com WCM nao-vazio: memberships dos canais do WCM
- Member com WCM vazio: tudo (legado, retro-compat)

Ordena por last_message_at DESC NULLS LAST."

git push origin feature/lead-channel-transfer
```

---

## Task 7: Chat.tsx — switch leads list to memberships

This is the largest refactor. The current `loadAllChatData` uses `leads` directly. Switch to `useLeadMemberships`. Also introduce `selectedMembership` state alongside `selectedLead`.

**Files:**
- Modify: `src/pages/Chat.tsx`

- [ ] **Step 7.1: Import the new hook**

At the top of `src/pages/Chat.tsx`:

```ts
import { useLeadMemberships, type LeadMembershipCard } from "@/hooks/useLeadMemberships";
```

- [ ] **Step 7.2: Add `selectedMembership` state and replace `leads` state derivation**

Near the existing `const [leads, setLeads] = useState<Lead[]>([])` block (~line 78), KEEP the `leads` state for the moment (other places consume it) but ADD:

```ts
const [selectedMembership, setSelectedMembership] = useState<LeadMembershipCard | null>(null);
const { cards: membershipCards, loading: membershipsLoading, reload: reloadMemberships } = useLeadMemberships();
```

- [ ] **Step 7.3: Derive `leads` from `membershipCards` so existing code keeps working**

Add a `useMemo` after the hook call that converts cards back to the `Lead[]` shape, deduplicated by `lead_id`. This preserves backward compatibility with the rest of Chat.tsx that still references `leads`:

```ts
const leadsFromMemberships = useMemo(() => {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const c of membershipCards) {
    if (seen.has(c.lead_id)) continue;
    seen.add(c.lead_id);
    out.push({
      id: c.lead_id,
      nome_lead: c.nome_lead,
      telefone_lead: c.telefone_lead,
      email: c.email,
      stage: c.stage,
      avatar_url: c.avatar_url,
      is_online: c.is_online,
      last_seen: c.last_seen,
      last_message_at: c.last_message_at,
      source: c.source_lead,
      responsavel: c.responsavel,
      responsavel_user_id: c.responsavel_user_id,
      created_at: c.lead_created_at,
      updated_at: c.lead_updated_at,
      organization_id: c.organization_id,
      whatsapp_instance_id: c.lead_whatsapp_instance_id,
    });
  }
  return out;
}, [membershipCards]);

useEffect(() => {
  setLeads(leadsFromMemberships);
}, [leadsFromMemberships]);
```

- [ ] **Step 7.4: Remove the old `loadAllChatData` lead query — replace with `reloadMemberships`**

Find `loadAllChatData` (around line 708). The function currently does, in this order:
1. Resolve `organizationId` (already done after multi-org fix in commit 969a284).
2. Build `leadsQuery` for `leads`.
3. `Promise.all([leadsQuery, lead_tags query, profiles query])`.
4. `setLeads(leadsData)` + presence map population.
5. Load `channelsData` from `whatsapp_instances`.
6. Load tag assignments + responsibles + RPC for masked names.

We're removing **only steps 2, 3 (the leads part), and 4** — the rest stays unchanged. The new step 2-4 becomes a single `await reloadMemberships()`. The `setLeads` call is now done indirectly via the `useEffect` added in Step 7.3 that copies `leadsFromMemberships` to `leads` state.

Concretely, find this current block:

```ts
  // Build leads query - RLS policy handles role-based filtering automatically
  // Admins/Owners see all leads, Members see only assigned leads via RLS
  const leadsQuery = supabase
    .from("leads")
    .select(...)
    .eq("organization_id", organizationId)
    .order(...)
    .limit(300);

  // Execute all queries in parallel
  const [leadsResult, tagsResult, profileResult] = await Promise.all([
    leadsQuery,
    supabase.from("lead_tags").select("*").eq("organization_id", organizationId).order("name"),
    supabase.from("profiles").select("notification_sound_enabled").eq("user_id", user.id).single()
  ]);

  // Process leads
  const leadsData = leadsResult.data || [];
  setLeads(leadsData);

  // Set presence status
  const initialPresence = new Map<string, PresenceInfo>();
  leadsData.forEach((lead) => {
    if (lead.is_online !== null || lead.last_seen) {
      initialPresence.set(lead.id, { isOnline: !!lead.is_online, lastSeen: lead.last_seen || undefined });
    }
  });
  setPresenceStatus(initialPresence);
```

Replace it with:

```ts
  // Leads agora vem do useLeadMemberships (1 card por par lead × canal).
  // O hook ja faz a query e popula membershipCards; aqui so disparamos
  // o reload (idempotente, primeira chamada faz o fetch).
  await reloadMemberships();

  // Tags + profile rodam em paralelo (sem leads no Promise.all)
  const [tagsResult, profileResult] = await Promise.all([
    supabase.from("lead_tags").select("*").eq("organization_id", organizationId).order("name"),
    supabase.from("profiles").select("notification_sound_enabled").eq("user_id", user.id).single()
  ]);

  // Presence eh populado a partir de leadsFromMemberships via useEffect
  // separado (ver Step 7.4b abaixo).
```

- [ ] **Step 7.4b: Move presence population into its own effect, depending on memberships**

Add this useEffect right after the `setLeads(leadsFromMemberships)` effect from Step 7.3:

```ts
useEffect(() => {
  const presenceMap = new Map<string, PresenceInfo>();
  leadsFromMemberships.forEach((lead: any) => {
    if (lead.is_online !== null || lead.last_seen) {
      presenceMap.set(lead.id, { isOnline: !!lead.is_online, lastSeen: lead.last_seen || undefined });
    }
  });
  setPresenceStatus(presenceMap);
}, [leadsFromMemberships]);
```

The remainder of `loadAllChatData` (channels query at line ~759, tag assignments and responsibles section starting around line ~785) stays exactly as it is — none of it depends on leads-from-leads-table directly; they all use `organizationId` or `leadsData.map(l => l.id)`. For the latter, change to `leadsFromMemberships.map(l => l.id)` since `leadsData` no longer exists in this scope.

- [ ] **Step 7.5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0. If TS complains about `leads` shape mismatch, ensure the `leadsFromMemberships` mapping fields match the existing `Lead` type. Cast as `any[]` for now if needed (the type can be tightened in a later cleanup commit).

- [ ] **Step 7.6: Run vite build**

```bash
./node_modules/.bin/vite build 2>&1 | tail -10
```

Expected: build success.

- [ ] **Step 7.7: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "refactor(chat): leads list agora vem de lead_channel_memberships

- Adiciona useLeadMemberships e estado selectedMembership
- Substitui a query direta em leads dentro de loadAllChatData por
  reloadMemberships() do hook
- Mantem o estado leads[] derivado dos memberships (deduplicado por
  lead_id) para nao quebrar o resto do componente
- Tags, canais, perfil e demais loads inalterados

Visualmente, ainda 1 card por lead (dedup). O salto para 1 card por
membership rola no proximo commit, quando o componente da sidebar
passar a iterar membershipCards diretamente."

git push origin feature/lead-channel-transfer
```

---

## Task 8: Chat sidebar — render one card per membership

Replace the rendering loop in the sidebar to iterate `membershipCards` instead of the deduplicated `leads`.

**Files:**
- Modify: `src/pages/Chat.tsx`

- [ ] **Step 8.1: Locate the sidebar rendering**

In `src/pages/Chat.tsx`, find the `<TabsContent value="all">` section (around line 1620 in the current file). It currently maps over `unpinnedFilteredLeads.map((lead) => <ChatLeadItem ... />)`.

- [ ] **Step 8.2: Switch the data source for the sidebar to filtered memberships**

Add new memos near the existing `baseFilteredLeads` (around line 1390):

```ts
const baseFilteredMemberships = useMemo(() => membershipCards.filter((card) => {
  const matchesSearch = card.nome_lead.toLowerCase().includes(searchQuery.toLowerCase())
    || card.telefone_lead.includes(searchQuery);
  const matchesChannel = !selectedChannelId || card.whatsapp_instance_id === selectedChannelId;
  // Membership ja vem filtrado pelo WCM no hook — sem necessidade de
  // recheck via isLeadVisibleByChannel.
  if (selectedTagIds.length > 0) {
    const leadTags = leadTagsMap.get(card.lead_id) || [];
    return matchesSearch && matchesChannel && selectedTagIds.some((tagId) => leadTags.includes(tagId));
  }
  return matchesSearch && matchesChannel;
}), [membershipCards, searchQuery, selectedTagIds, leadTagsMap, selectedChannelId]);

// Pinned/Unpinned operam sobre cards (par lead × canal). Pinned guarda
// lead_id no localStorage, mas o filtro aplica via lead_id do card.
const pinnedFilteredMemberships = useMemo(
  () => baseFilteredMemberships.filter((c) => pinnedLeads.includes(c.lead_id))
    .sort((a, b) => pinnedLeads.indexOf(a.lead_id) - pinnedLeads.indexOf(b.lead_id)),
  [baseFilteredMemberships, pinnedLeads]
);

const unpinnedFilteredMemberships = useMemo(() => {
  return baseFilteredMemberships.filter((c) => !pinnedLeads.includes(c.lead_id)).sort((a, b) => {
    if (a.lead_id === lockedLeadId) return -1;
    if (b.lead_id === lockedLeadId) return 1;
    switch (filterOption) {
      case "alphabetical": return a.nome_lead.localeCompare(b.nome_lead);
      case "created":
        return new Date(b.lead_created_at).getTime() - new Date(a.lead_created_at).getTime();
      case "last_interaction":
        return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
      default:
        return new Date(b.last_message_at || b.lead_updated_at || 0).getTime()
             - new Date(a.last_message_at || a.lead_updated_at || 0).getTime();
    }
  });
}, [baseFilteredMemberships, pinnedLeads, lockedLeadId, filterOption]);
```

- [ ] **Step 8.3: Update the sidebar render to map over memberships**

Inside the `<TabsContent value="all">` block, replace the iteration over `unpinnedFilteredLeads.map((lead) => ...)` with `unpinnedFilteredMemberships.map((card) => ...)`. Update the `ChatLeadItem` props to pass the `card` and a click handler that sets both `selectedLead` AND `selectedMembership`:

```tsx
{unpinnedFilteredMemberships.map((card) => (
  <ChatLeadItem
    key={`${card.lead_id}-${card.whatsapp_instance_id}`}
    lead={leadsFromMemberships.find(l => l.id === card.lead_id) || (card as any)}
    isSelected={selectedMembership?.lead_id === card.lead_id && selectedMembership?.whatsapp_instance_id === card.whatsapp_instance_id}
    channelColor={channelsRef.current.find(c => c.id === card.whatsapp_instance_id)?.channel_color || null}
    presenceStatus={presenceStatus.get(card.lead_id)}
    tagVersion={(leadTagsMap.get(card.lead_id) || []).join(",")}
    responsibleInfo={permissions.canViewAllLeads && card.responsavel_user_id ? responsiblesMap.get(card.responsavel_user_id) : undefined}
    onClick={() => {
      const leadObj = leadsFromMemberships.find(l => l.id === card.lead_id);
      setSelectedLead(leadObj as any);
      setSelectedMembership(card);
      setLockedLeadId(card.lead_id);
      if (leadObj) refreshPresenceForLead(leadObj as any);
    }}
    onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
    isPinned={pinnedLeads.includes(card.lead_id)}
    onTogglePin={() => togglePin(card.lead_id)}
  />
))}
```

Repeat for `pinnedFilteredMemberships` in the pinned tab.

- [ ] **Step 8.4: Same change in the Pinned tab and Broadcast (if they iterate leads)**

Search for `unpinnedFilteredLeads` and `pinnedFilteredLeads` references in the JSX. Replace each with its memberships counterpart.

- [ ] **Step 8.5: Typecheck + build**

```bash
npx tsc --noEmit
./node_modules/.bin/vite build 2>&1 | tail -5
```

Both should pass.

- [ ] **Step 8.6: Smoke test (local dev)**

Run dev server:

```bash
npm run dev
```

Open `http://localhost:5173/chat` in the browser. Login as a user with multiple WhatsApp channels (test on the Vercel preview if local Supabase isn't available). Verify:
- The sidebar shows cards.
- If a test lead has memberships in 2 channels (run an SQL INSERT manually to test), the same lead appears twice with different colored borders.

- [ ] **Step 8.7: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat(chat-sidebar): 1 card por membership (par lead × canal)

- Substitui rendering loop em leads pelo loop em membershipCards
- Mantem busca/tags/pinning operando por lead_id, mas a key da
  React e (lead_id, instance_id) — 1 card por canal ao qual o lead
  pertence
- Click no card seta selectedMembership + selectedLead em conjunto.
  selectedLead continua valendo (compat); selectedMembership ganha
  contexto de canal pra filtrar mensagens no proximo commit
- Sort e filtros operam sobre baseFilteredMemberships"

git push origin feature/lead-channel-transfer
```

---

## Task 9: Filter messages by channel in the conversation view

Now that the sidebar has `selectedMembership`, filter the message list by `whatsapp_instance_id = selectedMembership.whatsapp_instance_id`.

**Files:**
- Modify: `src/pages/Chat.tsx`

- [ ] **Step 9.1: Locate `loadMessages`**

Find the function `loadMessages(leadId: string)` (~line 895). It queries `mensagens_chat.eq('id_lead', leadId)`.

- [ ] **Step 9.2: Add channel filter to the query**

Modify the query to also filter by `whatsapp_instance_id`. Mensagens com `whatsapp_instance_id = NULL` (legacy/un-backfilled) ainda aparecem como fallback:

```ts
const loadMessages = async (leadId: string) => {
  setLoading(true);
  setHasMoreMessages(false);
  oldestMessageTimeRef.current = null;
  try {
    const currentChannel = selectedMembership?.whatsapp_instance_id;

    let query = supabase
      .from('mensagens_chat')
      .select('id, id_lead, corpo_mensagem, direcao, data_hora, evolution_message_id, status_entrega, created_at, media_type, media_url, media_metadata, whatsapp_instance_id, quoted_message_id, quoted:quoted_message_id (corpo_mensagem, direcao, media_type)')
      .eq('id_lead', leadId)
      .order('data_hora', { ascending: true })
      .limit(MESSAGE_PAGE_SIZE);

    if (currentChannel) {
      // Filtro de canal + fallback para msgs antigas (whatsapp_instance_id = NULL)
      query = query.or(`whatsapp_instance_id.eq.${currentChannel},whatsapp_instance_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('loadMessages error:', error);
      setLoading(false);
      return;
    }

    const parsed = parseMessages(data || []);
    setMessages(parsed);
    // ... existing oldestMessageTimeRef and hasMoreMessages logic
    setLoading(false);
  } catch (err) {
    console.error('loadMessages error:', err);
    setLoading(false);
  }
};
```

- [ ] **Step 9.3: Same filter on `loadMoreMessages` (pagination)**

Find `loadMoreMessages` (if it exists, around line 990). Apply the same `.or(...)` filter pattern.

- [ ] **Step 9.4: Update the lead-specific Realtime subscription filter**

In the `useEffect` that sets up `leadChannel` (around line 497–680), the `mensagens_chat` postgres_changes filter currently is `id_lead=eq.${selectedLead.id}`. The new logic: if `selectedMembership.whatsapp_instance_id` is set, also filter by channel. Realtime's `filter` syntax doesn't support `or`, so:

Option A (simpler): keep the lead-only filter, drop messages in the handler if `whatsapp_instance_id !== selectedMembership.whatsapp_instance_id` and not null:

```ts
.on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens_chat", filter: `id_lead=eq.${selectedLead.id}` }, (payload) => {
  const msg = payload.new as any;
  const currentChannel = selectedMembership?.whatsapp_instance_id;
  if (currentChannel && msg.whatsapp_instance_id && msg.whatsapp_instance_id !== currentChannel) {
    return; // msg de outro canal — nao mostra nessa thread
  }
  // ... existing logic to setMessages
})
```

Apply the same skip to the UPDATE handler for mensagens_chat.

- [ ] **Step 9.5: Trigger `loadMessages` on `selectedMembership` change**

The existing effect triggers on `selectedLead` change. Update to also depend on `selectedMembership?.whatsapp_instance_id`:

```ts
useEffect(() => {
  if (selectedLead?.id) {
    loadMessages(selectedLead.id);
  }
}, [selectedLead?.id, selectedMembership?.whatsapp_instance_id]);
```

- [ ] **Step 9.6: Typecheck + build**

```bash
npx tsc --noEmit
./node_modules/.bin/vite build 2>&1 | tail -5
```

- [ ] **Step 9.7: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat(chat-conversation): filtrar mensagens por canal (selectedMembership)

- loadMessages e loadMoreMessages agora filtram por
  whatsapp_instance_id = selectedMembership.whatsapp_instance_id
  com fallback OR whatsapp_instance_id IS NULL (msgs legadas
  sem backfill aparecem em qualquer canal pra nao sumirem)
- Realtime handler de INSERT/UPDATE em mensagens_chat dropa
  payload de outro canal antes de re-render
- Effect de carga de msgs depende tambem de selectedMembership

Com isso, abrir o lead em canal A vs canal B mostra threads
distintas (cada canal so ve suas proprias msgs +/- legacy)."

git push origin feature/lead-channel-transfer
```

---

## Task 10: Send messages from the current channel

When the user sends a message, use `selectedMembership.whatsapp_instance_id` instead of `selectedLead.whatsapp_instance_id`.

**Files:**
- Modify: `src/pages/Chat.tsx`

- [ ] **Step 10.1: Locate the `sendMessage` callback**

Around line 1010. Currently it looks up the `instance_name` via `selectedLead.whatsapp_instance_id`. Change to `selectedMembership.whatsapp_instance_id`:

```ts
const sendMessage = useCallback(async (text: string) => {
  if (!selectedLead || !selectedMembership || sending) return;
  // ... existing optimisticMessage
  try {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) throw new Error("Usuário não autenticado");
    if (!organizationId) throw new Error("Organização não encontrada");

    const instanceId = selectedMembership.whatsapp_instance_id;

    const { data: instanceRow } = await supabase
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('id', instanceId)
      .eq('status', 'CONNECTED')
      .maybeSingle();

    if (!instanceRow) throw new Error("Canal nao esta conectado");

    const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
      body: {
        instance_name: instanceRow.instance_name,
        remoteJid: selectedLead.telefone_lead,
        message_text: fullMessage,
        leadId: selectedLead.id,
        quotedMessageId: replyingTo?.evolution_message_id || undefined,
      },
    });

    // ... rest unchanged
  } catch (err) {
    // ... unchanged
  }
}, [selectedLead, selectedMembership, organizationId, currentUserName, toast, replyingTo, sending]);
```

- [ ] **Step 10.2: Repeat for `sendAudio` and `handleFileSelect`**

Same pattern: resolve `instance_name` via `selectedMembership.whatsapp_instance_id`. Replace the existing instance-resolution blocks.

- [ ] **Step 10.3: Disable input when read-only mode** (preview of Task 12 read-only split; full split in Task 13)

For now, disable the send input if the message being viewed is the read-only top section. Concrete logic deferred to Task 13. Skip for now.

- [ ] **Step 10.4: Typecheck + build + commit**

```bash
npx tsc --noEmit
./node_modules/.bin/vite build 2>&1 | tail -5
git add src/pages/Chat.tsx
git commit -m "feat(chat-send): enviar mensagem pelo canal da membership selecionada

sendMessage, sendAudio e handleFileSelect agora usam
selectedMembership.whatsapp_instance_id para resolver o
instance_name do envio. Antes usavam selectedLead.whatsapp_instance_id,
que apontava sempre para o canal de origem — incompativel com
o modelo de lead em multiplos canais."

git push origin feature/lead-channel-transfer
```

---

## Task 11: TransferLeadDialog component

**Files:**
- Create: `src/components/chat/TransferLeadDialog.tsx`

- [ ] **Step 11.1: Create the dialog component**

```tsx
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChannelOption {
  id: string;
  instance_name: string;
  channel_name: string | null;
  channel_color: string | null;
  status: string;
  alreadyHasMembership: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  organizationId: string;
  currentChannelId: string;
}

export function TransferLeadDialog({
  open, onOpenChange, leadId, leadName, organizationId, currentChannelId,
}: Props) {
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [{ data: instances }, { data: memberships }] = await Promise.all([
        supabase
          .from('whatsapp_instances')
          .select('id, instance_name, channel_name, channel_color, status')
          .eq('organization_id', organizationId)
          .eq('status', 'CONNECTED')
          .order('created_at', { ascending: true }),
        supabase
          .from('lead_channel_memberships')
          .select('whatsapp_instance_id')
          .eq('lead_id', leadId),
      ]);

      if (cancelled) return;

      const existingIds = new Set((memberships || []).map((m: any) => m.whatsapp_instance_id));
      const options: ChannelOption[] = (instances || []).map((i: any) => ({
        id: i.id,
        instance_name: i.instance_name,
        channel_name: i.channel_name,
        channel_color: i.channel_color,
        status: i.status,
        alreadyHasMembership: existingIds.has(i.id),
      }));

      // Filter out current channel + already-memberships
      const filtered = options.filter(o => o.id !== currentChannelId && !o.alreadyHasMembership);
      setChannels(filtered);
      setSelectedTargetId(filtered[0]?.id ?? null);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [open, leadId, organizationId, currentChannelId]);

  const handleTransfer = async () => {
    if (!selectedTargetId) return;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('transfer-lead-to-channel', {
        body: { lead_id: leadId, target_instance_id: selectedTargetId },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Erro desconhecido');
      }

      const targetName = channels.find(c => c.id === selectedTargetId)?.channel_name
        || channels.find(c => c.id === selectedTargetId)?.instance_name
        || 'canal selecionado';

      toast({
        title: 'Lead transferido',
        description: `${leadName} agora também está no canal ${targetName}.`,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Erro ao transferir',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transferir conversa para outro canal
          </DialogTitle>
          <DialogDescription>
            Selecione o canal para onde <strong>{leadName}</strong> deve ser transferido.
            O canal alvo poderá ver o histórico atual em modo leitura e iniciar uma nova conversa.
            O canal atual continua com acesso normal ao lead.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Não há outros canais conectados disponíveis para transferência.
            </p>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm">Canal alvo:</Label>
              {channels.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedTargetId === c.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="target_channel"
                    checked={selectedTargetId === c.id}
                    onChange={() => setSelectedTargetId(c.id)}
                    className="h-4 w-4"
                  />
                  <div
                    className="h-4 w-1 rounded"
                    style={{ backgroundColor: c.channel_color || '#888' }}
                  />
                  <span className="text-sm font-medium">
                    {c.channel_name || c.instance_name}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedTargetId || submitting || loading}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 11.2: Export from chat barrel**

In `src/components/chat/index.ts`, add:

```ts
export { TransferLeadDialog } from "./TransferLeadDialog";
```

- [ ] **Step 11.3: Typecheck + build**

```bash
npx tsc --noEmit
./node_modules/.bin/vite build 2>&1 | tail -5
```

- [ ] **Step 11.4: Commit**

```bash
git add src/components/chat/TransferLeadDialog.tsx src/components/chat/index.ts
git commit -m "feat(chat): TransferLeadDialog — modal de selecao do canal alvo

Modal com:
- Lista de canais conectados da org, excluindo (a) canal atual e
  (b) canais que o lead ja tem membership
- Radio button selection com badge de cor do canal
- Chama Edge Function transfer-lead-to-channel ao confirmar
- Toast de sucesso / erro
- Estados loading / submitting"

git push origin feature/lead-channel-transfer
```

---

## Task 12: Context menu / long-press on ChatLeadItem

**Files:**
- Modify: `src/components/chat/ChatLeadItem.tsx`

- [ ] **Step 12.1: Read the current ChatLeadItem to understand its shape**

```bash
cat src/components/chat/ChatLeadItem.tsx | head -100
```

The component receives `lead`, `isSelected`, `channelColor`, `onClick`, etc. We'll wrap it in a Radix `ContextMenu` and add long-press detection.

- [ ] **Step 12.2: Add context menu support**

Modify `ChatLeadItem.tsx`. First, add the prop for the transfer callback:

```tsx
// Add to props interface
onTransferClick?: () => void;
```

Wrap the root element of the card in a `ContextMenu` from Radix (shadcn/ui has it). Add a long-press detector (touch events) that fires the same callback as right-click:

```tsx
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ArrowRightLeft } from "lucide-react";
import { useRef } from "react";

// Inside the component
const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

const handleTouchStart = () => {
  if (!onTransferClick) return;
  longPressTimerRef.current = setTimeout(() => {
    onTransferClick();
  }, 500);
};

const handleTouchEnd = () => {
  if (longPressTimerRef.current) {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }
};

// Wrap the original card JSX
return (
  <ContextMenu>
    <ContextMenuTrigger asChild>
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* ... existing card JSX ... */}
      </div>
    </ContextMenuTrigger>
    {onTransferClick && (
      <ContextMenuContent>
        <ContextMenuItem onClick={onTransferClick}>
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Transferir para outro canal...
        </ContextMenuItem>
      </ContextMenuContent>
    )}
  </ContextMenu>
);
```

If `src/components/ui/context-menu.tsx` doesn't exist, add it via `npx shadcn-ui add context-menu` or copy from another shadcn project. (Check first; the project likely already has it given the rest of the shadcn stack.)

- [ ] **Step 12.3: Wire the dialog from Chat.tsx**

In `src/pages/Chat.tsx`, add state for the transfer dialog and a callback to open it for a specific membership:

```tsx
const [transferDialogState, setTransferDialogState] = useState<{
  open: boolean;
  leadId: string | null;
  leadName: string;
  channelId: string | null;
}>({ open: false, leadId: null, leadName: '', channelId: null });

const handleOpenTransfer = useCallback((card: LeadMembershipCard) => {
  setTransferDialogState({
    open: true,
    leadId: card.lead_id,
    leadName: card.nome_lead,
    channelId: card.whatsapp_instance_id,
  });
}, []);
```

In the ChatLeadItem render, pass:

```tsx
onTransferClick={() => handleOpenTransfer(card)}
```

Render the dialog once near the bottom of the JSX:

```tsx
{transferDialogState.leadId && transferDialogState.channelId && organizationId && (
  <TransferLeadDialog
    open={transferDialogState.open}
    onOpenChange={(open) => setTransferDialogState(s => ({ ...s, open }))}
    leadId={transferDialogState.leadId}
    leadName={transferDialogState.leadName}
    organizationId={organizationId}
    currentChannelId={transferDialogState.channelId}
  />
)}
```

Also import:

```ts
import { TransferLeadDialog } from "@/components/chat";
```

- [ ] **Step 12.4: Typecheck + build**

```bash
npx tsc --noEmit
./node_modules/.bin/vite build 2>&1 | tail -5
```

- [ ] **Step 12.5: Smoke test on Vercel preview**

After pushing, Vercel will create a preview deploy. Open it, log in, right-click a lead card in chat → menu should appear → "Transferir para outro canal..." → click opens the dialog → select target → submit → toast success.

Verify in DB:
```sql
SELECT * FROM public.lead_channel_memberships
WHERE source='transferred'
ORDER BY created_at DESC LIMIT 5;
```

The row created by the test transfer should appear.

- [ ] **Step 12.6: Commit**

```bash
git add src/components/chat/ChatLeadItem.tsx src/pages/Chat.tsx
git commit -m "feat(chat): right-click menu + long-press para abrir TransferLeadDialog

- ChatLeadItem ganha onTransferClick prop
- Wrapped em Radix ContextMenu com item 'Transferir para outro canal...'
- Long-press de 500ms no mobile dispara o mesmo callback
- Chat.tsx orquestra: estado transferDialogState + handler que abre
  o dialog para a (lead × canal) clicada com botao direito"

git push origin feature/lead-channel-transfer
```

---

## Task 13: Read-only history split (TransferDivider + message list)

**Files:**
- Create: `src/components/chat/TransferDivider.tsx`
- Modify: `src/components/chat/VirtualizedMessageList.tsx`
- Modify: `src/pages/Chat.tsx`

- [ ] **Step 13.1: Create TransferDivider component**

```tsx
import { ArrowRightLeft } from "lucide-react";

interface Props {
  transferredAt: string;
  transferredByName: string | null;
  fromChannelName: string;
}

export function TransferDivider({ transferredAt, transferredByName, fromChannelName }: Props) {
  const date = new Date(transferredAt);
  const dateStr = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="my-4 flex items-center gap-3 px-4">
      <div className="flex-1 h-px bg-border" />
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
        <ArrowRightLeft className="h-3 w-3" />
        <span>
          Conversa transferida de <strong>{fromChannelName}</strong>
          {transferredByName ? ` por ${transferredByName}` : ''} em {dateStr}
        </span>
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
```

Export from `src/components/chat/index.ts`:

```ts
export { TransferDivider } from "./TransferDivider";
```

- [ ] **Step 13.2: Fetch read-only history when membership is 'transferred'**

In `src/pages/Chat.tsx`, alongside `loadMessages`, add `loadPreTransferHistory`:

```ts
const [preTransferMessages, setPreTransferMessages] = useState<Message[]>([]);

const loadPreTransferHistory = useCallback(async (membership: LeadMembershipCard) => {
  if (membership.source !== 'transferred' || !membership.transferred_from_instance_id || !membership.transferred_at) {
    setPreTransferMessages([]);
    return;
  }

  const { data, error } = await supabase
    .from('mensagens_chat')
    .select('id, id_lead, corpo_mensagem, direcao, data_hora, evolution_message_id, status_entrega, created_at, media_type, media_url, media_metadata, whatsapp_instance_id, quoted_message_id, quoted:quoted_message_id (corpo_mensagem, direcao, media_type)')
    .eq('id_lead', membership.lead_id)
    .eq('whatsapp_instance_id', membership.transferred_from_instance_id)
    .lt('data_hora', membership.transferred_at)
    .order('data_hora', { ascending: true })
    .limit(200); // historico maximo exibido como read-only

  if (error) {
    console.error('loadPreTransferHistory error:', error);
    setPreTransferMessages([]);
    return;
  }

  setPreTransferMessages(parseMessages(data || []));
}, []);

useEffect(() => {
  if (selectedMembership) loadPreTransferHistory(selectedMembership);
}, [selectedMembership, loadPreTransferHistory]);
```

- [ ] **Step 13.3: Modify VirtualizedMessageList to accept pre-transfer history (non-virtualized prefix approach)**

In `src/components/chat/VirtualizedMessageList.tsx`, add props:

```ts
interface Props {
  // ... existing props
  preTransferMessages?: Message[];
  transferDivider?: { transferred_at: string; transferred_by_name: string | null; from_channel_name: string } | null;
}
```

**Approach chosen for v1: non-virtualized prefix.** Don't fold pre-transfer messages into the virtualization. Instead, render them as a static block at the top of the scrolling container, BEFORE the virtual list. Rationale: pre-transfer messages are bounded (`limit(200)` in Step 13.2), virtualization machinery would over-complicate the read-only/interactive split, and the perf cost of rendering 200 static rows is negligible.

Concrete structure inside the component's return:

```tsx
return (
  <div ref={containerRef} className="flex-1 overflow-y-auto">
    {/* Read-only pre-transfer block (non-virtualized) */}
    {preTransferMessages && preTransferMessages.length > 0 && (
      <div className="bg-muted/30 py-2">
        <div className="px-4 py-2 text-xs text-muted-foreground italic">
          📋 Histórico do canal anterior (somente leitura)
        </div>
        {preTransferMessages.map((m) => (
          <div key={`pre-${m.id}`} className="opacity-75 pointer-events-none">
            <MessageBubble
              message={m}
              isReadOnly={true}
              {/* reuse existing props but pass isReadOnly to skip hover actions */}
            />
          </div>
        ))}
      </div>
    )}

    {/* Transfer divider */}
    {transferDivider && (
      <TransferDivider
        transferredAt={transferDivider.transferred_at}
        transferredByName={transferDivider.transferred_by_name}
        fromChannelName={transferDivider.from_channel_name}
      />
    )}

    {/* Virtual list of post-transfer/inbound messages — existing logic unchanged */}
    {/* ... existing virtualizer ... */}
  </div>
);
```

`MessageBubble` needs an `isReadOnly?: boolean` prop added. When `true`, suppress hover menu (reactions / reply / delete buttons) and disable any onClick that opens menus. Add the prop to the `MessageBubble` interface in its file (`src/components/chat/MessageBubble.tsx`) and short-circuit the affected handlers.

- [ ] **Step 13.4: Pass props from Chat.tsx**

In the JSX that renders `<VirtualizedMessageList />`:

```tsx
<VirtualizedMessageList
  messages={messages}
  preTransferMessages={preTransferMessages}
  transferDivider={
    selectedMembership?.source === 'transferred' && selectedMembership.transferred_at
      ? {
          transferred_at: selectedMembership.transferred_at,
          transferred_by_name: responsiblesMap.get(selectedMembership.transferred_by_user_id || '')?.full_name || null,
          from_channel_name: channelsRef.current.find(c => c.id === selectedMembership.transferred_from_instance_id)?.channel_name
            || channelsRef.current.find(c => c.id === selectedMembership.transferred_from_instance_id)?.instance_name
            || 'canal anterior',
        }
      : null
  }
  // ... other existing props
/>
```

- [ ] **Step 13.5: Typecheck + build + smoke test**

```bash
npx tsc --noEmit
./node_modules/.bin/vite build 2>&1 | tail -5
```

On the preview, transfer a lead, open it in the target channel — see the read-only block, the divider, and an empty interactive area below.

- [ ] **Step 13.6: Commit**

```bash
git add src/components/chat/TransferDivider.tsx \
       src/components/chat/VirtualizedMessageList.tsx \
       src/components/chat/index.ts \
       src/pages/Chat.tsx
git commit -m "feat(chat): historico read-only + TransferDivider em conversa transferida

- Quando selectedMembership.source='transferred', carrega
  mensagens do transferred_from_instance_id com data_hora <
  transferred_at em estado preTransferMessages (limit 200)
- VirtualizedMessageList renderiza prefixo nao-virtualizado com
  preTransferMessages (read-only) + TransferDivider + lista virtual
  normal de mensagens novas
- TransferDivider mostra: 'Conversa transferida de <Canal> por <Nome> em <data>'"

git push origin feature/lead-channel-transfer
```

---

## Task 14: Realtime subscribe to memberships + toast

**Files:**
- Modify: `src/pages/Chat.tsx`
- Modify: `src/contexts/ChatMessageNotificationContext.tsx`

- [ ] **Step 14.1: Add realtime subscribe in `Chat.tsx` for membership changes**

Inside the existing global channel useEffect (around line 343), add a new `.on()` for `lead_channel_memberships`:

```ts
.on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_channel_memberships" }, (payload) => {
  const m = payload.new as any;
  if (m.organization_id !== orgIdRef.current) return;
  // Refetch memberships — incremental update would require fetching the joined lead
  reloadMemberships();
})
.on("postgres_changes", { event: "UPDATE", schema: "public", table: "lead_channel_memberships" }, (payload) => {
  const m = payload.new as any;
  if (m.organization_id !== orgIdRef.current) return;
  reloadMemberships();
})
.on("postgres_changes", { event: "DELETE", schema: "public", table: "lead_channel_memberships" }, () => {
  reloadMemberships();
})
```

The `reloadMemberships` function is from `useLeadMemberships` — already in scope.

- [ ] **Step 14.2: Add toast notification on `source='transferred'` INSERT**

In `src/contexts/ChatMessageNotificationContext.tsx`, add a subscribe to `lead_channel_memberships` INSERTs:

```ts
// Inside the existing useEffect that subscribes to mensagens_chat
const lcmChannel = supabase
  .channel(`lcm-notif-${organizationId}-${Date.now()}`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'lead_channel_memberships' },
    async (payload) => {
      const m = payload.new as any;
      if (m.organization_id !== organizationId) return;
      if (m.source !== 'transferred') return;

      // Resolve lead name
      const { data: lead } = await supabase
        .from('leads')
        .select('nome_lead, avatar_url')
        .eq('id', m.lead_id)
        .maybeSingle();

      // Resolve transferring user's name (best-effort)
      let transferredByName = 'um colega';
      if (m.transferred_by_user_id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', m.transferred_by_user_id)
          .maybeSingle();
        if (prof?.full_name) transferredByName = prof.full_name;
      }

      // Verifica se o canal alvo esta no WCM do user (ou hasFullAccess)
      const ids = assignedChannelIdsRef.current;
      const hasAccess = hasFullAccessRef.current
        || (ids && (ids.size === 0 || ids.has(m.whatsapp_instance_id)));
      if (!hasAccess) return;

      addNotification({
        id: `lcm-${m.lead_id}-${m.whatsapp_instance_id}`,
        lead_id: m.lead_id,
        lead_name: lead?.nome_lead || 'Lead',
        avatar_url: lead?.avatar_url ?? null,
        message_preview: `📥 Transferido por ${transferredByName}`,
        media_type: null,
      });
    }
  )
  .subscribe();

// Cleanup:
return () => {
  supabase.removeChannel(channel);    // existing
  supabase.removeChannel(lcmChannel);  // new
  clearInterval(pollInterval);         // existing
};
```

- [ ] **Step 14.3: Typecheck + build**

```bash
npx tsc --noEmit
./node_modules/.bin/vite build 2>&1 | tail -5
```

- [ ] **Step 14.4: Smoke test on preview**

Open the CRM in two browser windows logged as different users (or two channels with different members). User A transfers a lead. User B (in WCM of the target channel) sees the toast appear AND the new card appears in their sidebar within a second or two.

- [ ] **Step 14.5: Commit**

```bash
git add src/pages/Chat.tsx src/contexts/ChatMessageNotificationContext.tsx
git commit -m "feat(chat): realtime + toast para transferencias recebidas

- Chat.tsx: subscribe em lead_channel_memberships INSERT/UPDATE/DELETE
  chama reloadMemberships() para refresh da sidebar em tempo real
- ChatMessageNotificationContext: subscribe novo em lcm INSERTs com
  source='transferred' — quando o canal alvo esta no WCM do user
  (ou ele e admin), dispara toast com nome do lead + quem transferiu"

git push origin feature/lead-channel-transfer
```

---

## Task 15: End-to-end smoke test on Vercel preview

**Files:** None. Validation only.

- [ ] **Step 15.1: Confirm latest preview deploy is green**

Run `gh pr checks` if a PR exists, or check Vercel directly. The `feature/lead-channel-transfer` preview URL should serve the new feature.

- [ ] **Step 15.2: Multi-account walk-through**

Manually verify the entire flow:

1. Login as User X (owner of an org with 2 channels A and B).
2. Send a WhatsApp msg from a test phone to A's number. Lead appears in sidebar with A's color. Confirm in DB: membership row with source='inbound', mensagens_chat row with whatsapp_instance_id=A.
3. Right-click the lead card → "Transferir para outro canal..." → select B → submit.
4. Confirm: lead card with B's color now ALSO appears in sidebar. Original A's card stays.
5. Open the B-card → see read-only history of A on top, divider with "Transferido por User X em [date]", empty thread below.
6. Send a message from B-card. Customer's WhatsApp receives it from B's number.
7. Open A-card → still shows full history including the original messages; the new B-message is NOT in this view.
8. Send another WhatsApp msg from test phone to A's number. A-card thread shows it. B-card thread does NOT.
9. Verify DB:
   ```sql
   SELECT id, whatsapp_instance_id, direcao, corpo_mensagem, data_hora
   FROM public.mensagens_chat
   WHERE id_lead = '<TEST_LEAD_ID>'
   ORDER BY data_hora;
   ```
   Each msg has the correct `whatsapp_instance_id`.

- [ ] **Step 15.3: Edge case checks**

- Try to transfer to the same channel (origin == target) → error toast.
- Try to transfer to a channel that already has membership → option not shown (disabled / filtered).
- Try as a member without WCM access to the lead's channel → backend rejects 403.

- [ ] **Step 15.4: Performance sanity**

In a browser with the preview open, watch the network tab during a transfer. Verify:
- 1 invoke of `transfer-lead-to-channel` → ~200-400ms.
- Realtime INSERT propagates → ~1-2s for card to appear in other user's sidebar.
- No infinite loops / extra refetches.

- [ ] **Step 15.5: Document any issues found**

For each issue, either fix it inline (re-open the relevant task, fix, commit, retest) or note as a follow-up. Critical issues block merge to main.

- [ ] **Step 15.6: Notify the user**

> "Smoke test concluído no preview Vercel — link: [URL do preview]. Funcionamento validado: transferência, leitura read-only, separação por canal, toast. Lista de itens menores observados: [se houver]. Pronto pra merge em `main` quando você confirmar."

**WAIT for the user to confirm before any merge to `main`.**

---

## Task 16: Merge to main (only after user OK)

**Files:** None.

- [ ] **Step 16.1: User confirms validation**

Wait for explicit user confirmation: "pode mergear" or equivalent.

- [ ] **Step 16.2: Open PR if not already**

```bash
gh pr create --base main --head feature/lead-channel-transfer \
  --title "feat: transferência de leads entre canais WhatsApp" \
  --body "$(cat <<'EOF'
## Summary

Implementa transferência de uma conversa de um canal WhatsApp para outro dentro da mesma org:

- Mesmo lead pode existir em múltiplos canais simultaneamente (via `lead_channel_memberships`)
- Conversas isoladas por canal: cada msg carrega `whatsapp_instance_id`
- Canal destino vê histórico do canal origem em modo leitura, separado por divider visual no momento da transferência
- Right-click no card do lead na sidebar / long-press no mobile dispara modal de seleção do canal alvo
- Backend Edge Function `transfer-lead-to-channel` valida permissão (owner/admin OR member com WCM na origem) e materializa o INSERT
- Toast in-app pra quem recebe a transferência

Spec: `docs/superpowers/specs/2026-05-13-lead-channel-transfer-design.md`
Plan: `docs/superpowers/plans/2026-05-13-lead-channel-transfer.md`

## Test plan

- [x] Migração aplicada + backfill validado em DB
- [x] Edge Functions (webhook + sends + transfer) deployadas e testadas
- [x] Smoke test end-to-end no preview Vercel (Task 15)
- [x] `tsc --noEmit` limpo
- [x] `vite build` verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 16.3: User merges via GitHub (Squash and merge recommended)**

Wait for user to click Merge.

- [ ] **Step 16.4: Vercel auto-deploys production**

Verify via `gh api repos/<user>/<repo>/commits/<merge_sha>/statuses` that Vercel state is `success`.

- [ ] **Step 16.5: Cleanup**

```bash
git worktree remove ../crm-lead-transfer
git push origin --delete feature/lead-channel-transfer
```

Done.

---

## Self-review: spec coverage

| Spec section | Task(s) |
|---|---|
| Modelo de dados: `lead_channel_memberships` | Task 1 |
| Modelo de dados: `mensagens_chat.whatsapp_instance_id` | Task 1 |
| Backfill memberships | Task 1 (in-migration) |
| Backfill mensagens_chat | Task 2 |
| Webhook | Task 3 |
| Send Edge Functions | Task 4 |
| Transfer Edge Function | Task 5 |
| Frontend hook | Task 6 |
| Chat.tsx — leads via memberships | Task 7 |
| Chat sidebar — 1 card por membership | Task 8 |
| Conversa filtrada por canal | Task 9 |
| Envio pelo canal certo | Task 10 |
| TransferLeadDialog | Task 11 |
| Context menu / long-press | Task 12 |
| Read-only history + divider | Task 13 |
| Realtime subscribe + toast | Task 14 |
| Smoke test E2E | Task 15 |
| Merge to main (gated) | Task 16 |

Spec items DEFERRED (documented in spec as v1.1):
- "Notinha inline no canal origem" mostrando que houve transferência saindo dali — sem task explícita; opcionalmente adicionável em Task 13 se baixo custo.
- "Untransfer" / reverter — fora do v1 (spec confirmou).

---

## Notes for the executing engineer

- Each task is self-contained and ends in a commit + push. The branch state after each commit should be deployable on Vercel preview.
- If any verification step fails (typecheck, build, smoke test), STOP and fix before moving on. Do not chain broken commits.
- The plan assumes that the engineer has access to the Supabase MCP tools for SQL queries, migration application, and Edge Function deploys. If not available, equivalent commands via `psql` and Supabase Dashboard work.
- All commits should be co-authored with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (per project convention seen in recent commits).
- Do NOT touch the user's other work-in-progress on `feature/collaborator-deletion-cascade`. This branch is independent.
