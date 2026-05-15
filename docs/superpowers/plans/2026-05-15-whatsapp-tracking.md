# WhatsApp Tracking (Lead de Anúncio) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar canais WhatsApp para auditoria de primeira-mensagem; quando bate em keywords, lead novo recebe tag "Lead de anúncio"; UI nova em /integracoes para configurar por canal.

**Architecture:** Tabela nova `whatsapp_tracking_rules` (PK por canal). Webhook ganha hook que chama helper compartilhado `_shared/ad-lead-tagging.ts` logo após criar lead novo. Helper avalia rule, normaliza texto (lowercase + remove acentos), testa keywords (`includes` em modo 'any'), aplica tag (lazy-create da tag "Lead de anúncio"). UI adiciona aba "Trackeamento WhatsApp" com card por canal.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions Deno), React 18 + TypeScript + Vite, shadcn/ui, Tailwind, `@supabase/supabase-js`.

**Spec:** `docs/superpowers/specs/2026-05-15-whatsapp-tracking-design.md`

**Branch / worktree:** Trabalho em `../crm-tracking` na branch `feature/whatsapp-tracking` (criada de origin/main). Push frequente; **sem merge em `main`** até validação local + OK explícito.

---

## Constraint operacional crítico

**LOCAL FIRST.** Ordem de validação:

1. Engineer roda `supabase start` (Supabase CLI) ou cria branch via Supabase MCP `create_branch`.
2. Tasks 1–8 implementadas no worktree, migração aplicada SOMENTE no local/branch DB.
3. Task 9 valida cenários manualmente no local.
4. Task 10 (deploy de prod) só após **confirmação explícita do usuário**.

Se a sessão não tiver `supabase` CLI disponível e Supabase Pro/branch não estiver configurado, **PARE em Task 1** e pergunte ao usuário qual via prefere (CLI local, branch, ou autorização para aplicar direto em prod).

---

## Context for engineer

- **Migrations** em `supabase/migrations/YYYYMMDDHHMMSS_<topic>.sql`. Use timestamp `20260515120000` ou posterior.
- **Edge Functions** em `supabase/functions/<name>/index.ts`, deploy via Supabase MCP `deploy_edge_function`.
- **Tabs no Integrations** seguem padrão custom (`useState<'connections'|'webhooks'|'logs'>` + array literal mapeado). Não é shadcn `<Tabs>`.
- **shadcn/ui já instalado**: `Button`, `Switch`, `Input`, `Label`, `Badge`, `Tooltip`, `useToast`, etc.
- **Sem framework de teste** no projeto. Verificação = `tsc --noEmit` + `vite build` + Supabase MCP SQL queries + smoke manual.
- **Padrão de RLS no projeto**: SELECT por org-member. Policies de write usam `organization_members.role IN ('owner','admin')`.
- **Co-author**: incluir `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` em todo commit (convenção do projeto).

---

## File structure

| Path | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260515120000_whatsapp_tracking_rules.sql` | Create | Schema + RLS + trigger updated_at |
| `supabase/functions/_shared/ad-lead-tagging.ts` | Create | Helper compartilhado: avalia rule + aplica tag |
| `supabase/functions/whatsapp-message-webhook/index.ts` | Modify | Importa helper + chama logo após criar lead novo |
| `src/hooks/useTrackingRules.ts` | Create | Hook: query (rules + canais joined) + mutations |
| `src/components/integrations/KeywordsInput.tsx` | Create | Input chip-style |
| `src/components/integrations/TrackingChannelCard.tsx` | Create | Card por canal: toggle + KeywordsInput + auto-save |
| `src/components/integrations/WhatsAppTrackingTab.tsx` | Create | Container: lista canais + tag preview + empty state |
| `src/pages/Integrations.tsx` | Modify | Adiciona tab "tracking" no array + content |

---

## Task 1: DB migration

**Files:**
- Create: `supabase/migrations/20260515120000_whatsapp_tracking_rules.sql`

- [ ] **Step 1.1: Decidir via de aplicação local**

Pergunte ao usuário ANTES de prosseguir:

> "Para validação local, qual via você prefere?
> **(A)** Eu rodo `supabase start` local (Supabase CLI; precisa Docker)
> **(B)** Eu crio Supabase branch via MCP `create_branch` (precisa plano Pro)
> **(C)** Eu autorizo aplicação direto em prod (schema é aditivo, mesma decisão do feature anterior)"

Se (A): pergunte se Docker está rodando + supabase CLI instalado. Espere confirmação. Use `supabase db push` ou `supabase migration up`.
Se (B): use `mcp__plugin_supabase_supabase__create_branch` + aplique migration na branch.
Se (C): siga Step 1.3 com `mcp__plugin_supabase_supabase__apply_migration` no projeto principal.

**Não prosseguir sem resposta.**

- [ ] **Step 1.2: Escrever migration**

Conteúdo exato do arquivo `supabase/migrations/20260515120000_whatsapp_tracking_rules.sql`:

```sql
-- ============================================================
-- WhatsApp Tracking Rules (Lead de Anuncio)
-- ============================================================
-- Marca canais WhatsApp para auditoria de primeira-mensagem de leads
-- novos. Quando match contra keywords cadastradas, lead recebe a tag
-- "Lead de anuncio" (criada lazily na primeira aplicacao).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_tracking_rules (
  whatsapp_instance_id UUID PRIMARY KEY
    REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  match_mode TEXT NOT NULL DEFAULT 'any'
    CHECK (match_mode IN ('any', 'all', 'exact_phrase')),
  case_sensitive BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wtr_org
  ON public.whatsapp_tracking_rules (organization_id);

-- Trigger: updated_at = now() em todo UPDATE
CREATE OR REPLACE FUNCTION public.touch_wtr_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wtr_updated_at ON public.whatsapp_tracking_rules;
CREATE TRIGGER trg_wtr_updated_at
  BEFORE UPDATE ON public.whatsapp_tracking_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_wtr_updated_at();

-- RLS
ALTER TABLE public.whatsapp_tracking_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wtr_org_select ON public.whatsapp_tracking_rules;
CREATE POLICY wtr_org_select ON public.whatsapp_tracking_rules
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS wtr_admin_write ON public.whatsapp_tracking_rules;
CREATE POLICY wtr_admin_write ON public.whatsapp_tracking_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = whatsapp_tracking_rules.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = whatsapp_tracking_rules.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Sem ALTER PUBLICATION supabase_realtime — rules nao precisam realtime.
```

- [ ] **Step 1.3: Aplicar migration**

Conforme via escolhida em 1.1:
- (A) `supabase db push` (ou `supabase migration up`).
- (B) `mcp__plugin_supabase_supabase__apply_migration` com `project_id=<branch_id>`, `name="whatsapp_tracking_rules"`, `query=<SQL completo acima>`.
- (C) Mesma chamada com `project_id="uxttihjsxfowursjyult"` (prod).

- [ ] **Step 1.4: Verificar schema**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='whatsapp_tracking_rules'
ORDER BY ordinal_position;

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND tablename='whatsapp_tracking_rules';
```

Esperado:
- 8 colunas (whatsapp_instance_id, organization_id, enabled, keywords, match_mode, case_sensitive, created_at, updated_at).
- 2 policies (`wtr_org_select` SELECT, `wtr_admin_write` ALL).

- [ ] **Step 1.5: Commit**

```bash
cd ../crm-tracking
git add supabase/migrations/20260515120000_whatsapp_tracking_rules.sql
git commit -m "feat(db): whatsapp_tracking_rules — schema + RLS + trigger

- Tabela com PK por whatsapp_instance_id (uma rule por canal)
- Colunas: enabled, keywords[], match_mode, case_sensitive
- match_mode CHECK aceita 'any','all','exact_phrase' (v1 usa 'any')
- RLS: SELECT por org-member; INSERT/UPDATE/DELETE owner/admin only
- Trigger updated_at = now() em UPDATE
- Sem realtime publication (rules raras, leitura on-demand)

Aplicado [LOCAL via supabase CLI | branch <id> | prod uxttihjsxfowursjyult]
após autorização do usuário (Step 1.1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 2: Edge helper `_shared/ad-lead-tagging.ts`

**Files:**
- Create: `supabase/functions/_shared/ad-lead-tagging.ts`

- [ ] **Step 2.1: Criar arquivo do helper**

Conteúdo de `supabase/functions/_shared/ad-lead-tagging.ts`:

```ts
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
 * Range ̀-ͯ (U+0300-U+036F) cobre combining diacritical marks
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
```

- [ ] **Step 2.2: Verificar schema de `lead_tag_assignments`**

Antes do helper rodar em produção, confirme se a tabela tem coluna `organization_id`. Rode via MCP execute_sql:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='lead_tag_assignments'
ORDER BY ordinal_position;
```

Se houver `organization_id` NOT NULL, edite o `.insert({...})` na função para incluir `organization_id: organizationId`. Se for opcional ou ausente, deixe como está.

- [ ] **Step 2.3: Commit**

```bash
git add supabase/functions/_shared/ad-lead-tagging.ts
git commit -m "feat(edge-shared): helper ad-lead-tagging

Avalia rule de tracking do canal e aplica tag 'Lead de anuncio'
em lead recem-criado quando primeira mensagem bate em keywords.

- Le whatsapp_tracking_rules; se ausente/disabled/keywords vazias,
  retorna {tagged:false, reason}
- Extrai texto via priority chain (conversation, extendedText.text,
  captions de mídia)
- Normaliza com NFD + strip combining marks (case+accent insensitive)
- Match mode 'any': qualquer keyword bate
- Auto-cria tag 'Lead de anuncio' (#FB923C) se nao existe na org
- Insert em lead_tag_assignments idempotente (23505 OK)
- Falhas retornam reason; nunca throw — caller decide nao bloquear

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 3: Webhook integration

**Files:**
- Modify: `supabase/functions/whatsapp-message-webhook/index.ts`

- [ ] **Step 3.1: Localizar ponto de criação de lead novo**

No webhook, busque o bloco que cria um lead que não existia. Tipicamente após `if (!existingLead) { ... .insert ... }`. Procure por `// 🆕 Criar novo lead` ou similar:

```bash
grep -n "Criar novo lead\|isNewLead\|!existingLead" "../crm-tracking/supabase/functions/whatsapp-message-webhook/index.ts"
```

Anote o número da linha onde `leadId` foi atribuído via INSERT (lead recém-criado).

- [ ] **Step 3.2: Adicionar import**

No topo do arquivo, junto com os outros imports do `_shared`:

```ts
import { maybeApplyAdLeadTag } from "../_shared/ad-lead-tagging.ts";
```

- [ ] **Step 3.3: Inserir chamada do helper**

Logo após o `INSERT` no `leads` que cria o novo lead (e depois de o `leadId` estar resolvido), antes do INSERT em `mensagens_chat`:

```ts
// Lead recem-criado: avalia tracking rule do canal para aplicar
// tag "Lead de anuncio" se a primeira msg bater em keywords.
// Falhas nao bloqueiam o fluxo principal.
try {
  await maybeApplyAdLeadTag({
    supabase,
    organizationId,
    leadId,
    instanceId,
    messageInfo,
  });
} catch (tagErr) {
  console.warn('⚠️ [webhook] erro ao aplicar tag de anuncio (nao bloqueia):', tagErr);
}
```

`messageInfo` é o objeto `data.message` do payload da Evolution; já está em escopo no webhook (busque por `const messageInfo` ou `data.message`).

- [ ] **Step 3.4: Deploy do webhook (gated em via local)**

- (A) Local CLI: `supabase functions serve whatsapp-message-webhook` em outro terminal pra testar.
- (B) Branch: `mcp__plugin_supabase_supabase__deploy_edge_function` com `project_id=<branch_id>`, `name="whatsapp-message-webhook"`, files inclui `index.ts` (~1700 linhas, lê em chunks). **Inclua também o helper** (`_shared/ad-lead-tagging.ts`) na lista de files se a estrutura do deploy exigir, OU verifique se o platform resolve auto.
- (C) Prod: SOMENTE após Task 9 + OK explícito do usuário.

- [ ] **Step 3.5: Commit**

```bash
git add supabase/functions/whatsapp-message-webhook/index.ts
git commit -m "feat(webhook): chamar ad-lead-tagging apos criar lead novo

Logo apos o INSERT em leads (lead recem-criado), o webhook chama
maybeApplyAdLeadTag passando supabase/org/lead/instance/messageInfo.

Falhas no helper sao log-warned mas nao bloqueiam o fluxo principal
— a mensagem continua sendo salva e demais automacoes rodam.

Helper retorna {tagged:false, reason} ou {tagged:true}; webhook nao
inspeciona o resultado (fire-and-forget pra performance).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 4: Frontend hook `useTrackingRules`

**Files:**
- Create: `src/hooks/useTrackingRules.ts`

- [ ] **Step 4.1: Criar o hook**

Conteúdo de `src/hooks/useTrackingRules.ts`:

```ts
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

export interface TrackingRule {
  whatsapp_instance_id: string;
  organization_id: string;
  enabled: boolean;
  keywords: string[];
  match_mode: 'any' | 'all' | 'exact_phrase';
  case_sensitive: boolean;
  updated_at: string;
}

export interface ChannelWithRule {
  instance_id: string;
  instance_name: string;
  channel_name: string | null;
  channel_color: string | null;
  phone_number: string | null;
  rule: TrackingRule | null;
}

interface UseTrackingRulesResult {
  channels: ChannelWithRule[];
  loading: boolean;
  reload: () => Promise<void>;
  upsertRule: (
    instanceId: string,
    patch: Partial<Pick<TrackingRule, 'enabled' | 'keywords' | 'match_mode' | 'case_sensitive'>>
  ) => Promise<void>;
}

export function useTrackingRules(): UseTrackingRulesResult {
  const { organizationId } = useOrganization();
  const [channels, setChannels] = useState<ChannelWithRule[]>([]);
  const [loading, setLoading] = useState(false);
  const inflight = useRef(false);

  const reload = useCallback(async () => {
    if (!organizationId) return;
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);

    try {
      const [{ data: instances, error: instErr }, { data: rules, error: ruleErr }] = await Promise.all([
        supabase
          .from('whatsapp_instances')
          .select('id, instance_name, channel_name, channel_color, phone_number, status')
          .eq('organization_id', organizationId)
          .eq('status', 'CONNECTED')
          .order('created_at', { ascending: true }),
        supabase
          .from('whatsapp_tracking_rules')
          .select('*')
          .eq('organization_id', organizationId),
      ]);

      if (instErr) {
        console.error('useTrackingRules instances error:', instErr);
        return;
      }
      if (ruleErr) {
        console.error('useTrackingRules rules error:', ruleErr);
        return;
      }

      const ruleByInstance = new Map<string, TrackingRule>();
      (rules || []).forEach((r: any) => ruleByInstance.set(r.whatsapp_instance_id, r as TrackingRule));

      const merged: ChannelWithRule[] = (instances || []).map((i: any) => ({
        instance_id: i.id,
        instance_name: i.instance_name,
        channel_name: i.channel_name,
        channel_color: i.channel_color,
        phone_number: i.phone_number,
        rule: ruleByInstance.get(i.id) || null,
      }));

      setChannels(merged);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [organizationId]);

  const upsertRule = useCallback(async (
    instanceId: string,
    patch: Partial<Pick<TrackingRule, 'enabled' | 'keywords' | 'match_mode' | 'case_sensitive'>>
  ) => {
    if (!organizationId) return;

    // Merge com row existente (se houver)
    const current = channels.find(c => c.instance_id === instanceId)?.rule;
    const next = {
      whatsapp_instance_id: instanceId,
      organization_id: organizationId,
      enabled: patch.enabled ?? current?.enabled ?? true,
      keywords: patch.keywords ?? current?.keywords ?? [],
      match_mode: patch.match_mode ?? current?.match_mode ?? 'any',
      case_sensitive: patch.case_sensitive ?? current?.case_sensitive ?? false,
    };

    const { error } = await supabase
      .from('whatsapp_tracking_rules')
      .upsert(next, { onConflict: 'whatsapp_instance_id' });

    if (error) {
      console.error('upsertRule error:', error);
      throw error;
    }

    // Atualiza estado local sem refetch (otimista)
    setChannels(prev => prev.map(c =>
      c.instance_id === instanceId
        ? { ...c, rule: { ...next, updated_at: new Date().toISOString() } as TrackingRule }
        : c
    ));
  }, [organizationId, channels]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { channels, loading, reload, upsertRule };
}
```

- [ ] **Step 4.2: Typecheck**

```bash
cd ../crm-tracking
npx tsc --noEmit 2>&1 | head -20
```

Esperado: exit 0.

- [ ] **Step 4.3: Commit**

```bash
git add src/hooks/useTrackingRules.ts
git commit -m "feat(hook): useTrackingRules

Carrega canais CONNECTED da org + LEFT JOIN com whatsapp_tracking_rules.
Expõe channels[] (com rule|null), loading, reload, e upsertRule.

upsertRule faz merge com a row atual (se existir) e usa Supabase upsert
com onConflict=whatsapp_instance_id. Atualiza estado local de forma
otimista (sem refetch).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 5: Component `KeywordsInput`

**Files:**
- Create: `src/components/integrations/KeywordsInput.tsx`

- [ ] **Step 5.1: Criar componente**

Conteúdo de `src/components/integrations/KeywordsInput.tsx`:

```tsx
import { useState, useRef, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxKeywordLength?: number;
}

const MAX_LEN = 100;

/**
 * Chip-style input para array de strings.
 * - Enter cria chip (trim, dedup case-insensitive)
 * - Backspace em input vazio remove último chip
 * - X em chip remove individual
 * - Display preserva case original; comparação interna é case-insensitive
 */
export function KeywordsInput({
  value,
  onChange,
  placeholder = "Digite uma palavra e pressione Enter",
  disabled = false,
  maxKeywordLength = MAX_LEN,
}: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addKeyword = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.length > maxKeywordLength) return;
    // Dedup case-insensitive
    const lowerExisting = value.map(v => v.toLowerCase());
    if (lowerExisting.includes(trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div
      className={cn(
        "min-h-[42px] flex flex-wrap items-center gap-1.5 px-2 py-1.5 border border-border rounded-md bg-background",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "focus-within:ring-1 focus-within:ring-ring focus-within:border-primary cursor-text"
      )}
      onClick={() => !disabled && inputRef.current?.focus()}
    >
      {value.map((kw, idx) => (
        <span
          key={`${kw}-${idx}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200"
        >
          {kw}
          {!disabled && (
            <button
              type="button"
              className="hover:bg-orange-200 dark:hover:bg-orange-800 rounded-sm p-0.5"
              onClick={(e) => { e.stopPropagation(); removeAt(idx); }}
              aria-label={`Remover ${kw}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        disabled={disabled}
        maxLength={maxKeywordLength}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
      />
    </div>
  );
}
```

- [ ] **Step 5.2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Esperado: exit 0.

- [ ] **Step 5.3: Commit**

```bash
git add src/components/integrations/KeywordsInput.tsx
git commit -m "feat(integrations): KeywordsInput chip-style

Input para array de strings:
- Enter adiciona chip (trim, dedup case-insensitive)
- Backspace em input vazio remove ultimo chip
- X em chip remove individual
- Display preserva case original
- maxKeywordLength=100 default
- Estilo: orange-100/900 bg pra combinar com a tag 'Lead de anuncio'
- Disabled state cinza, sem interacoes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 6: Component `TrackingChannelCard`

**Files:**
- Create: `src/components/integrations/TrackingChannelCard.tsx`

- [ ] **Step 6.1: Criar componente**

```tsx
import { useState, useEffect, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Info } from "lucide-react";
import { ChannelWithRule } from "@/hooks/useTrackingRules";
import { KeywordsInput } from "./KeywordsInput";
import { cn } from "@/lib/utils";

interface Props {
  channel: ChannelWithRule;
  canEdit: boolean;
  onSave: (
    instanceId: string,
    patch: { enabled?: boolean; keywords?: string[] }
  ) => Promise<void>;
}

const DEBOUNCE_MS = 800;

/**
 * Card por canal: toggle 'Trackear' + KeywordsInput + auto-save debounced.
 *
 * Estado local mirror do estado vindo da rule, com debounce de 800ms para
 * batchear writes. Indicador "salvando..." inline. Toggle off mantém keywords
 * salvas (pra reativar depois sem reconfigurar).
 */
export function TrackingChannelCard({ channel, canEdit, onSave }: Props) {
  const initialEnabled = channel.rule?.enabled ?? false;
  const initialKeywords = channel.rule?.keywords ?? [];

  const [enabled, setEnabled] = useState(initialEnabled);
  const [keywords, setKeywords] = useState<string[]>(initialKeywords);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const mountedRef = useRef(true);

  // Sync quando o canal vem de fora (reload externo)
  useEffect(() => {
    if (!isDirtyRef.current) {
      setEnabled(channel.rule?.enabled ?? false);
      setKeywords(channel.rule?.keywords ?? []);
    }
  }, [channel.rule?.enabled, channel.rule?.keywords]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const scheduleSave = (patch: { enabled?: boolean; keywords?: string[] }) => {
    if (!canEdit) return;
    isDirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await onSave(channel.instance_id, patch);
      } finally {
        if (mountedRef.current) {
          setSaving(false);
          isDirtyRef.current = false;
        }
      }
    }, DEBOUNCE_MS);
  };

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    scheduleSave({ enabled: next, keywords });
  };

  const handleKeywordsChange = (next: string[]) => {
    setKeywords(next);
    scheduleSave({ enabled, keywords: next });
  };

  const channelLabel = channel.channel_name || channel.instance_name;
  const phoneLabel = channel.phone_number ? ` (${channel.phone_number})` : '';

  return (
    <div className="border border-border rounded-md p-4 bg-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="w-1 h-5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: channel.channel_color || '#888' }}
          />
          <Label className="text-sm font-medium truncate">
            {channelLabel}
            <span className="text-muted-foreground font-normal">{phoneLabel}</span>
          </Label>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={enabled}
            disabled={!canEdit}
            onCheckedChange={handleToggle}
            aria-label="Trackear este canal"
          />
        </div>
      </div>

      <div className={cn(!enabled && "opacity-50 pointer-events-none")}>
        <Label className="text-xs text-muted-foreground mb-1.5 block">
          Palavras-chave (qualquer match)
        </Label>
        <KeywordsInput
          value={keywords}
          onChange={handleKeywordsChange}
          disabled={!canEdit || !enabled}
          placeholder={enabled ? "Digite uma palavra e pressione Enter" : "Ative o trackeamento primeiro"}
        />

        <div className="flex items-start gap-1.5 mt-2 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            Compara sem distinguir maiúsculas/acentos. Mensagens de leads novos que contiverem
            qualquer uma dessas palavras receberão a tag <strong>Lead de anúncio</strong>.
          </span>
        </div>

        {enabled && keywords.length === 0 && (
          <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            ⚠ Nenhuma palavra cadastrada — nenhum lead será tagueado.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6.2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 6.3: Commit**

```bash
git add src/components/integrations/TrackingChannelCard.tsx
git commit -m "feat(integrations): TrackingChannelCard

Card por canal:
- Header: barra colorida do channel_color + nome + telefone
- Switch 'Trackear' + indicador 'salvando' (Loader2)
- KeywordsInput abaixo (disabled se !enabled)
- Auto-save com debounce 800ms; estado local mirror
- Sync com props quando reload externo (sem dirty flag local)
- Warning amarelo se enabled+keywords vazios
- Tooltip info sobre case/accent insensitive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 7: Component `WhatsAppTrackingTab`

**Files:**
- Create: `src/components/integrations/WhatsAppTrackingTab.tsx`

- [ ] **Step 7.1: Criar componente**

```tsx
import { useEffect, useState } from "react";
import { Loader2, Target, Tag as TagIcon } from "lucide-react";
import { useTrackingRules } from "@/hooks/useTrackingRules";
import { useOrganization } from "@/contexts/OrganizationContext";
import { TrackingChannelCard } from "./TrackingChannelCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const TAG_NAME = 'Lead de anúncio';
const TAG_COLOR_DEFAULT = '#FB923C';

interface AdTagInfo {
  id: string;
  name: string;
  color: string;
}

export function WhatsAppTrackingTab() {
  const { organizationId, permissions } = useOrganization();
  const { channels, loading, upsertRule } = useTrackingRules();
  const { toast } = useToast();
  const [adTag, setAdTag] = useState<AdTagInfo | null>(null);

  const canEdit = permissions.role === 'owner' || permissions.role === 'admin';

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from('lead_tags')
      .select('id, name, color')
      .eq('organization_id', organizationId)
      .eq('name', TAG_NAME)
      .maybeSingle()
      .then(({ data }) => setAdTag(data as AdTagInfo | null));
  }, [organizationId, channels]); // re-fetch quando channels muda (auto-criação após primeiro tag)

  const handleSave = async (
    instanceId: string,
    patch: { enabled?: boolean; keywords?: string[] }
  ) => {
    try {
      await upsertRule(instanceId, patch);
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  if (!canEdit) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Apenas owner ou admin pode configurar o trackeamento.
      </div>
    );
  }

  if (loading && channels.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <Target className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <h3 className="text-sm font-medium mb-1">Nenhum canal WhatsApp conectado</h3>
        <p className="text-xs text-muted-foreground">
          Conecte um canal WhatsApp na aba <strong>Conexões</strong> primeiro.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Trackeamento WhatsApp</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Identifique automaticamente leads que vêm de anúncios WhatsApp marcando-os com a tag{" "}
          <strong>Lead de anúncio</strong>.
        </p>

        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md text-xs">
          <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Tag aplicada:</span>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
            style={{
              backgroundColor: `${adTag?.color || TAG_COLOR_DEFAULT}33`,
              color: adTag?.color || TAG_COLOR_DEFAULT,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: adTag?.color || TAG_COLOR_DEFAULT }}
            />
            {adTag?.name || TAG_NAME}
          </span>
          {!adTag && (
            <span className="text-muted-foreground italic ml-auto">
              (será criada quando o primeiro lead bater)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {channels.map(c => (
          <TrackingChannelCard
            key={c.instance_id}
            channel={c}
            canEdit={canEdit}
            onSave={handleSave}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7.2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 7.3: Commit**

```bash
git add src/components/integrations/WhatsAppTrackingTab.tsx
git commit -m "feat(integrations): WhatsAppTrackingTab container

Lista de canais conectados + tag preview no topo.

- Header com Target icon + descricao
- Tag preview: badge colorido com nome+cor da tag (ou placeholder
  'sera criada quando primeiro lead bater')
- Grid 1col mobile / 2cols lg de TrackingChannelCard
- Permission gate: nao-admin ve mensagem 'apenas owner/admin'
- Empty state: 'Conecte um canal WhatsApp primeiro'
- Loading state com spinner
- handleSave delega pra upsertRule do hook + toast em erro

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 8: Adicionar tab no Integrations.tsx

**Files:**
- Modify: `src/pages/Integrations.tsx`

- [ ] **Step 8.1: Atualizar tipo do estado e import**

Localize a linha (`grep -n 'tab' src/pages/Integrations.tsx | head -5`) que declara o tipo do tab. Provavelmente:

```ts
const [tab, setTab] = useState<"connections" | "webhooks" | "logs">("connections");
```

Substitua por:

```ts
const [tab, setTab] = useState<"connections" | "webhooks" | "logs" | "tracking">("connections");
```

E adicione o import logo após os imports de outros tabs (`grep -n 'WebhookIntegrationsTab' src/pages/Integrations.tsx`):

```ts
import { WhatsAppTrackingTab } from "@/components/integrations/WhatsAppTrackingTab";
```

- [ ] **Step 8.2: Adicionar 'tracking' no array de tabs**

Localize:

```tsx
{(["connections", "webhooks", "logs"] as const).map(t => (
```

Substitua por:

```tsx
{(["connections", "webhooks", "logs", "tracking"] as const).map(t => (
```

E atualize o ternário do label dentro do `<button>`:

```tsx
{t === "connections" ? "Conexões" : t === "webhooks" ? "Webhooks" : t === "logs" ? "Logs" : "Trackeamento"}
```

- [ ] **Step 8.3: Adicionar TabsContent**

Após o bloco `{tab === "logs" && ( ... )}`, adicione:

```tsx
{/* ── Tracking Tab ── */}
{tab === "tracking" && (
  <div className="bg-card border border-border rounded-lg">
    <WhatsAppTrackingTab />
  </div>
)}
```

- [ ] **Step 8.4: Typecheck + build**

```bash
npx tsc --noEmit 2>&1 | head -10
./node_modules/.bin/vite build 2>&1 | tail -10
```

Ambos exit 0.

- [ ] **Step 8.5: Commit**

```bash
git add src/pages/Integrations.tsx
git commit -m "feat(integrations): adicionar aba 'Trackeamento'

- Estado do tab estende para incluir 'tracking'
- Array de labels do TabsList ganha 'tracking' como ultimo item
- Label exibido: 'Trackeamento'
- TabsContent renderiza <WhatsAppTrackingTab />

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 9: Validação local (manual)

**Files:** None.

- [ ] **Step 9.1: Confirmar Vercel preview da branch está verde**

```bash
gh api repos/marcosviniiciusfs-png/CRM---Definitivo/commits/$(git rev-parse origin/feature/whatsapp-tracking)/statuses 2>&1 | head -30
```

Esperado: state=success do Vercel. Anote a URL do preview.

- [ ] **Step 9.2: Cenários de teste manual**

Acesse o preview Vercel logado como owner. Vá em `/integracoes` → aba "Trackeamento". Para cada cenário, marque o resultado:

**Cenário A — Canal SEM rule (regressão zero):**
1. Não habilite tracking em nenhum canal.
2. Envie msg de WhatsApp de número novo pro número de A.
3. Lead aparece no Pipeline/Chat normal, **sem** tag "Lead de anúncio". ✓

**Cenário B — Canal COM rule + keywords + match:**
1. Habilite tracking em canal A. Adicione keyword "promocao verao" (sem acento).
2. Envie de número novo (lead novo na org): "Olá, vi a Promoção de Verão!"
3. Lead aparece **com** tag "Lead de anúncio". ✓
4. Verifique no Supabase MCP:
   ```sql
   SELECT t.name, t.color FROM lead_tag_assignments lta
   JOIN lead_tags t ON t.id = lta.tag_id
   WHERE lta.lead_id = '<UUID_DO_LEAD_TESTE>';
   ```
   Esperado: 1 row com `name='Lead de anúncio'`, `color='#FB923C'`.

**Cenário C — Canal COM rule + keywords + sem match:**
1. Mesma configuração do B.
2. Envie de outro número novo: "Bom dia, queria informações"
3. Lead **sem** tag. ✓

**Cenário D — Canal COM rule + keywords vazias:**
1. Toggle ON, lista de keywords vazia.
2. Envie msg.
3. Lead sem tag. ✓ (Warning amarelo aparece na UI.)

**Cenário E — Lead já existente (não retroativo):**
1. Mesmo número que já existe na org como lead, envia msg que daria match.
2. Lead **NÃO** ganha tag. ✓ (Hook só dispara em lead recém-criado.)

**Cenário F — Mídia sem caption:**
1. Lead novo manda só uma foto, sem caption. Match config seria positivo se tivesse texto.
2. Lead sem tag. ✓ (extractText retorna vazio.)

**Cenário G — UI auto-save:**
1. Adicione 3 keywords, espere 1s, recarregue a página.
2. Keywords persistem. ✓

**Cenário H — Permissão member:**
1. Login como member (não owner/admin).
2. Acesse `/integracoes`. Aba "Trackeamento" aparece (visualizar OK), mas TrackingChannelCard tem switches/inputs **desabilitados** + texto "Apenas owner ou admin pode configurar".

- [ ] **Step 9.3: Reportar resultado ao usuário**

Mensagem-modelo:

> "Smoke test local concluído. Cenários A-H validados ✓ [ou: cenários X falhou — descrição do problema]. Preview URL: <link>. Pronto para deploy de produção quando você confirmar."

**WAIT for user OK before Task 10.**

---

## Task 10: Deploy de produção (gated)

**Files:** None (deploys via MCP).

- [ ] **Step 10.1: Aguardar OK explícito do usuário**

Não prosseguir sem mensagem do usuário tipo "pode deployar em prod" ou equivalente.

- [ ] **Step 10.2: Aplicar migration em prod**

```
mcp__plugin_supabase_supabase__apply_migration:
  project_id: uxttihjsxfowursjyult
  name: whatsapp_tracking_rules
  query: <SQL completo do Step 1.2>
```

- [ ] **Step 10.3: Verificar schema em prod**

Mesmas queries do Step 1.4 contra `uxttihjsxfowursjyult`. Confirmar 8 colunas + 2 policies.

- [ ] **Step 10.4: Deploy do webhook em prod**

`mcp__plugin_supabase_supabase__deploy_edge_function`:
- `project_id`: `uxttihjsxfowursjyult`
- `name`: `whatsapp-message-webhook`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `false`
- `files`: incluir o `index.ts` modificado completo. Helpers compartilhados (`_shared/cors.ts`, `_shared/evolution-config.ts`, `_shared/ad-lead-tagging.ts`) precisam estar acessíveis — incluir no array `files` se a estrutura do platform exigir.

- [ ] **Step 10.5: Smoke test em prod**

Repetir Cenários A, B, C do Step 9.2 contra um canal de teste real conectado em prod. Se algum falhar, **reverter** webhook (deploy versão anterior) e investigar.

- [ ] **Step 10.6: Abrir PR para main**

```bash
cd ../crm-tracking
gh pr create --base main --head feature/whatsapp-tracking \
  --title "feat: trackeamento de mensagens WhatsApp (Lead de Anúncio)" \
  --body "$(cat <<'EOF'
## Summary

- Tabela `whatsapp_tracking_rules` (PK por canal): keywords + enabled + match_mode.
- Helper `_shared/ad-lead-tagging.ts`: avalia rule e aplica tag em lead novo.
- Webhook chama helper logo após criar lead.
- Tag "Lead de anúncio" lazy-create (#FB923C).
- UI: nova aba "Trackeamento" em /integracoes com card por canal CONNECTED.

Spec: `docs/superpowers/specs/2026-05-15-whatsapp-tracking-design.md`
Plan: `docs/superpowers/plans/2026-05-15-whatsapp-tracking.md`

## Test plan

- [x] Migration aplicada em prod
- [x] Webhook deployado em prod
- [x] 8 cenários manuais validados no preview Vercel (Task 9)
- [x] Smoke test em prod (Task 10.5)
- [x] tsc + vite build verdes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 10.7: Aguardar usuário mergear via GitHub UI**

Recomendado **Squash and merge**.

- [ ] **Step 10.8: Cleanup**

```bash
git worktree remove ../crm-tracking
git push origin --delete feature/whatsapp-tracking
```

---

## Self-review: spec coverage

| Spec section | Task |
|---|---|
| Schema `whatsapp_tracking_rules` + RLS + trigger | Task 1 |
| Helper `_shared/ad-lead-tagging.ts` | Task 2 |
| Webhook integration (chama helper após criar lead novo) | Task 3 |
| Hook `useTrackingRules` | Task 4 |
| KeywordsInput chip-style | Task 5 |
| TrackingChannelCard (toggle + auto-save) | Task 6 |
| WhatsAppTrackingTab (container) | Task 7 |
| Integrations.tsx (nova aba) | Task 8 |
| Local-first validation | Task 9 |
| Prod deploy gated + PR + cleanup | Task 10 |

Spec items DEFERIDOS (documented in spec):
- Match modes 'all'/'exact_phrase'/regex — schema preparado, sem task de UI.
- Aplicação retroativa de tag em leads existentes — fora v1.
- Múltiplas tags por keyword set — fora v1.
- Métricas/relatórios — fora v1.

---

## Notes for executing engineer

- Cada task termina em commit + push. Estado da branch após cada commit deve ser typecheck-clean.
- Se qualquer typecheck/build falhar, PARE e conserte antes de avançar.
- Webhook deploy só após Task 9 OK + Step 10.1 confirmação.
- Nunca aplique migration em prod sem Step 1.1 ter sido respondido com (B) ou (C) explicitamente.
- Co-author footer obrigatório em todo commit.
