# Tracking por contato desconhecido + reposicionar tag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar heurística complementar "contato desconhecido na agenda do aparelho" ao tracking de leads de anúncio + mover a posição da tag no ChatLeadItem para a linha do telefone.

**Architecture:** Coluna nova `detect_unknown_contacts` em `whatsapp_tracking_rules`. Helper `ad-lead-tagging.ts` ganha um segundo branch: se keyword não bate e a flag está ligada, consulta `/chat/findContacts` da Evolution API; se número não está em contatos (ou `isMyContact=false`), tagueia. Sentinel `'__unknown_contact__'` em `tracking_match_log.matched_keyword`. UI ganha 2º toggle no modal + indicador no card + linha especial nas stats. ChatLeadItem move a tag para depois do telefone.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions Deno), Evolution API v2, React 18 + TypeScript + Vite, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-05-16-tracking-unknown-contacts-design.md`

**Branch / worktree:** Trabalho em `../crm-tracking` na branch `feature/whatsapp-tracking` (já checked-out, mesma branch da feature parent — incremento, ainda não mergeada em main). Push frequente.

---

## Constraint operacional

**LOCAL-FIRST mantido.** Toda mudança de schema (migration) e deploy de Edge Function em prod precisa de **OK explícito do usuário**. Frontend pode ir pro Vercel preview livremente (já não atinge prod).

Sequência:
1. Tasks 1–9 implementação no worktree (sem aplicar migration em prod).
2. Task 10: pergunta ao usuário → aplica migration + redeploy webhook em prod (mesma via que vinha sendo usada: `apply_migration` + `deploy_edge_function` via MCP).
3. Task 11: smoke test no Vercel preview.

---

## Context for engineer

- **Worktree** `C:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/crm-tracking/`. Use `cd "../crm-tracking"` ou absolute paths.
- **Branch** `feature/whatsapp-tracking` já checked-out.
- **Sem `node_modules`** no worktree. Para typecheck, use o tsc do worktree principal: `node ../CRM---Definitivo/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`. Ou pula typecheck e valida visualmente — o Vercel rebuild detecta erros.
- **Convenção de commit**: incluir `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Helpers de Evolution API** já existem em `supabase/functions/_shared/evolution-config.ts`: `getEvolutionApiUrl()`, `getEvolutionApiKey()`. Use esses.
- **Helper atual** `_shared/ad-lead-tagging.ts` exporta `maybeApplyAdLeadTag({supabase, organizationId, leadId, instanceId, messageInfo})`. Vamos estender a assinatura com `instanceName` e `senderJid`.

---

## File structure

| Path | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260516120000_tracking_detect_unknown_contacts.sql` | Create | ADD COLUMN detect_unknown_contacts |
| `supabase/functions/_shared/ad-lead-tagging.ts` | Modify | Nova assinatura + branch de contato desconhecido + chamada Evolution API |
| `supabase/functions/whatsapp-message-webhook/index.ts` | Modify | Passar instanceName + senderJid na chamada |
| `src/hooks/useTrackingRules.ts` | Modify | Tipo TrackingRule ganha campo + upsertRule aceita |
| `src/components/integrations/TrackingChannelDialog.tsx` | Modify | 2º toggle + estado + save |
| `src/components/integrations/TrackingChannelCard.tsx` | Modify | Indicador "📵 desconhecidos" no footer |
| `src/components/integrations/TrackingChannelStats.tsx` | Modify | Linha especial pro sentinel |
| `src/components/chat/ChatLeadItem.tsx` | Modify | Move tag pra linha do telefone |

---

## Task 1: Migration `detect_unknown_contacts`

**Files:** Create `supabase/migrations/20260516120000_tracking_detect_unknown_contacts.sql`

- [ ] **Step 1.1: Criar arquivo**

```sql
-- ============================================================
-- Tracking: detect_unknown_contacts
-- ============================================================
-- Heuristica complementar: leads cujo numero nao esta na agenda do
-- aparelho do canal recebem tag "Lead de anuncio" mesmo sem match
-- de keyword. Opt-in por canal. Default false preserva comportamento.
-- ============================================================

ALTER TABLE public.whatsapp_tracking_rules
  ADD COLUMN IF NOT EXISTS detect_unknown_contacts BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 1.2: Commit (sem apply — Task 10 aplica)**

```bash
cd "../crm-tracking"
git add supabase/migrations/20260516120000_tracking_detect_unknown_contacts.sql
git commit -m "feat(db): whatsapp_tracking_rules.detect_unknown_contacts

Coluna boolean opt-in por canal. Quando true, helper tagueia leads
cujo numero nao esta na agenda do aparelho do canal (heuristica
complementar ao match de keyword).

Default false preserva comportamento existente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 2: Estender helper `ad-lead-tagging.ts`

**Files:** Modify `supabase/functions/_shared/ad-lead-tagging.ts`

Atual: helper recebe `instanceId` (UUID), tenta keyword match, tagueia se bate. Novo: recebe também `instanceName` (string, ex: `crm-abc-123`) e `senderJid` (string, ex: `5511...@s.whatsapp.net`). Se keyword não bate E `rule.detect_unknown_contacts=true`, consulta Evolution API.

- [ ] **Step 2.1: Substituir arquivo inteiro pelo conteúdo abaixo**

```ts
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
```

- [ ] **Step 2.2: Commit**

```bash
cd "../crm-tracking"
git add supabase/functions/_shared/ad-lead-tagging.ts
git commit -m "feat(edge-shared): ad-lead-tagging suporta detect_unknown_contacts

Helper estendido:
- Nova assinatura: instanceName + senderJid no args
- Refactor: applyTagAndLog extraido pra reuso entre 2 caminhos
- Branch novo: se keyword nao bate E rule.detect_unknown_contacts=true,
  consulta Evolution API /chat/findContacts. Se numero nao esta na
  agenda do aparelho (vazio, isMyContact=false, ou campo ausente),
  tagueia com matched_keyword='__unknown_contact__'.
- Timeout 5s na chamada Evolution; erro nao tagueia (conservador).
- Reasons novos: 'unknown_contact_check_failed', 'contact_known'.

Sem mudanca no fluxo de keyword (regressao zero).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 3: Webhook passa `instanceName` + `senderJid`

**Files:** Modify `supabase/functions/whatsapp-message-webhook/index.ts`

A chamada atual do helper precisa de 2 args novos. As variáveis `instance` (string, nome) e `messageKey.remoteJid` (string, JID) já existem em escopo no webhook.

- [ ] **Step 3.1: Localizar chamada do helper**

```bash
cd "../crm-tracking"
grep -n "maybeApplyAdLeadTag" supabase/functions/whatsapp-message-webhook/index.ts
```

Esperado: 1 chamada (linhas ~1407-1420, inserida na Task 3 da feature parent).

- [ ] **Step 3.2: Atualizar chamada**

Encontre o bloco:

```ts
await maybeApplyAdLeadTag({
  supabase,
  organizationId,
  leadId,
  instanceId,
  messageInfo,
});
```

Substitua por:

```ts
await maybeApplyAdLeadTag({
  supabase,
  organizationId,
  leadId,
  instanceId,
  instanceName: instance,
  senderJid: messageKey.remoteJid || senderPhone,
  messageInfo,
});
```

(`instance` é o nome da instância vindo do payload; `messageKey.remoteJid` é o JID do remetente; `senderPhone` é fallback caso `remoteJid` esteja vazio.)

- [ ] **Step 3.3: Commit**

```bash
git add supabase/functions/whatsapp-message-webhook/index.ts
git commit -m "feat(webhook): passa instanceName + senderJid pra ad-lead-tagging

Args adicionais que o helper precisa pra consultar Evolution API
quando rule.detect_unknown_contacts=true.

instanceName = nome da instancia (variavel 'instance' no payload)
senderJid = messageKey.remoteJid (fallback senderPhone se vazio)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 4: Hook `useTrackingRules` aceita novo campo

**Files:** Modify `src/hooks/useTrackingRules.ts`

- [ ] **Step 4.1: Estender tipo `TrackingRule`**

Encontre a interface `TrackingRule` no arquivo. Adicione `detect_unknown_contacts`:

```ts
export interface TrackingRule {
  whatsapp_instance_id: string;
  organization_id: string;
  enabled: boolean;
  keywords: string[];
  match_mode: 'any' | 'all' | 'exact_phrase';
  case_sensitive: boolean;
  detect_unknown_contacts: boolean;   // NOVO
  updated_at: string;
}
```

- [ ] **Step 4.2: Estender `upsertRule`**

Encontre a função `upsertRule`. Adicione `detect_unknown_contacts` no tipo do `patch` E no objeto `next`:

```ts
const upsertRule = useCallback(async (
  instanceId: string,
  patch: Partial<Pick<TrackingRule, 'enabled' | 'keywords' | 'match_mode' | 'case_sensitive' | 'detect_unknown_contacts'>>
) => {
  if (!organizationId) return;

  const current = channels.find(c => c.instance_id === instanceId)?.rule;
  const next = {
    whatsapp_instance_id: instanceId,
    organization_id: organizationId,
    enabled: patch.enabled ?? current?.enabled ?? true,
    keywords: patch.keywords ?? current?.keywords ?? [],
    match_mode: patch.match_mode ?? current?.match_mode ?? 'any',
    case_sensitive: patch.case_sensitive ?? current?.case_sensitive ?? false,
    detect_unknown_contacts: patch.detect_unknown_contacts ?? current?.detect_unknown_contacts ?? false,   // NOVO
  };

  // ... resto da função inalterado (upsert + setChannels otimista)
});
```

Atualize também o objeto otimista (`setChannels(prev => ...)`) — o spread `...next` já inclui o novo campo, deve funcionar sem mudança extra. Confirme lendo o arquivo após edit.

- [ ] **Step 4.3: Commit**

```bash
git add src/hooks/useTrackingRules.ts
git commit -m "feat(hook): useTrackingRules suporta detect_unknown_contacts

- Tipo TrackingRule ganha campo boolean
- upsertRule aceita no patch e merge com default false
- setChannels otimista inclui via spread (sem mudanca explicita)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 5: `TrackingChannelDialog` ganha 2º toggle

**Files:** Modify `src/components/integrations/TrackingChannelDialog.tsx`

- [ ] **Step 5.1: Adicionar estado local**

No componente, ao lado de `enabled` e `keywords`:

```ts
const [detectUnknown, setDetectUnknown] = useState(false);
```

Sincronizar com `channel.rule?.detect_unknown_contacts` no `useEffect` que sincroniza com prop quando dialog abre:

Encontre o effect que faz:

```ts
useEffect(() => {
  if (channel) {
    setEnabled(channel.rule?.enabled ?? false);
    setKeywords(channel.rule?.keywords ?? []);
    isDirtyRef.current = false;
  }
}, [channel?.instance_id]);
```

Adicione a linha de detectUnknown:

```ts
useEffect(() => {
  if (channel) {
    setEnabled(channel.rule?.enabled ?? false);
    setKeywords(channel.rule?.keywords ?? []);
    setDetectUnknown(channel.rule?.detect_unknown_contacts ?? false);   // NOVO
    isDirtyRef.current = false;
  }
}, [channel?.instance_id]);
```

E no effect de sync externo:

```ts
useEffect(() => {
  if (channel && !isDirtyRef.current) {
    setEnabled(channel.rule?.enabled ?? false);
    setKeywords(channel.rule?.keywords ?? []);
    setDetectUnknown(channel.rule?.detect_unknown_contacts ?? false);   // NOVO
  }
}, [channel?.rule?.enabled, channel?.rule?.keywords, channel?.rule?.detect_unknown_contacts]);
```

- [ ] **Step 5.2: Adicionar handler de toggle**

Junto com `handleToggle` e `handleKeywordsChange`:

```ts
const handleDetectUnknownToggle = (next: boolean) => {
  setDetectUnknown(next);
  scheduleSave({ enabled, keywords, detect_unknown_contacts: next });
};
```

E atualizar `handleToggle` + `handleKeywordsChange` para passar `detect_unknown_contacts` no patch:

```ts
const handleToggle = (next: boolean) => {
  setEnabled(next);
  scheduleSave({ enabled: next, keywords, detect_unknown_contacts: detectUnknown });
};

const handleKeywordsChange = (next: string[]) => {
  setKeywords(next);
  scheduleSave({ enabled, keywords: next, detect_unknown_contacts: detectUnknown });
};
```

E o `handleOpenChange` (flush antes de fechar):

```ts
onSave(channel.instance_id, { enabled, keywords, detect_unknown_contacts: detectUnknown }).finally(...);
```

A `scheduleSave` precisa aceitar o campo novo no tipo do patch — atualizar:

```ts
const scheduleSave = (patch: { enabled?: boolean; keywords?: string[]; detect_unknown_contacts?: boolean }) => { ... };
```

- [ ] **Step 5.3: Renderizar 2º toggle no JSX**

Logo APÓS o bloco do toggle existente "Trackear este canal" e ANTES do bloco `{/* Keywords editor */}`, adicione:

```tsx
          {/* NOVO: detect unknown contacts */}
          <div className={cn(
            "flex items-center justify-between p-3 border border-border rounded-md bg-muted/30",
            !enabled && "opacity-50 pointer-events-none"
          )}>
            <div>
              <Label className="text-sm font-medium">Detectar contatos desconhecidos</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Tagueia leads cujo número não está na agenda do aparelho do canal.
                Útil pra pegar leads que apagaram a mensagem pré-preenchida do anúncio.
              </p>
            </div>
            <Switch
              checked={detectUnknown}
              disabled={!canEdit || !enabled}
              onCheckedChange={handleDetectUnknownToggle}
              aria-label="Detectar contatos desconhecidos"
              className="data-[state=checked]:bg-green-500"
            />
          </div>
```

- [ ] **Step 5.4: Commit**

```bash
git add src/components/integrations/TrackingChannelDialog.tsx
git commit -m "feat(integrations): 2o toggle 'Detectar contatos desconhecidos' no dialog

- Estado local detectUnknown (mirror de rule.detect_unknown_contacts)
- Handler handleDetectUnknownToggle dispara debounce save
- Outros handlers (toggle master, keywords) tb passam o campo
- JSX: bloco novo abaixo do master toggle, gated por enabled
- Switch verde quando ativo (data-[state=checked]:bg-green-500)
- Estilo casa com o toggle master existente

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 6: Indicador no `TrackingChannelCard`

**Files:** Modify `src/components/integrations/TrackingChannelCard.tsx`

- [ ] **Step 6.1: Adicionar indicador no footer**

Localize a parte do JSX:

```tsx
{enabled && (
  <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
    <span>
      <strong className="text-foreground font-medium">{keywordCount}</strong>{" "}
      {keywordCount === 1 ? 'palavra cadastrada' : 'palavras cadastradas'}
    </span>
    {canEdit && (
      <span className="flex items-center gap-0.5 text-primary">
        Configurar
        <ChevronRight className="h-3 w-3" />
      </span>
    )}
  </div>
)}
```

Substitua por:

```tsx
{enabled && (
  <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <span className="truncate">
        <strong className="text-foreground font-medium">{keywordCount}</strong>{" "}
        {keywordCount === 1 ? 'palavra' : 'palavras'}
      </span>
      {channel.rule?.detect_unknown_contacts && (
        <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" title="Detecta números desconhecidos">
          <UserX className="h-3 w-3" />
          desconhecidos
        </span>
      )}
    </div>
    {canEdit && (
      <span className="flex items-center gap-0.5 text-primary flex-shrink-0">
        Configurar
        <ChevronRight className="h-3 w-3" />
      </span>
    )}
  </div>
)}
```

E adicione `UserX` no import:

```ts
import { ChevronRight, UserX } from "lucide-react";
```

- [ ] **Step 6.2: Commit**

```bash
git add src/components/integrations/TrackingChannelCard.tsx
git commit -m "feat(integrations): indicador 'desconhecidos' no card compacto

Quando channel.rule.detect_unknown_contacts=true, footer mostra
ícone UserX + label 'desconhecidos' ao lado do contador de palavras.
Cor azul (text-blue-600) pra diferenciar do contador de palavras.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 7: Linha especial no `TrackingChannelStats`

**Files:** Modify `src/components/integrations/TrackingChannelStats.tsx`

- [ ] **Step 7.1: Renderizar linha pro sentinel `'__unknown_contact__'`**

Localize a renderização da lista de keywords (`{keywords.map(kw => ...)}`). ANTES dela (dentro do mesmo container `<div className="space-y-1">`), adicione:

```tsx
{counts['__unknown_contact__'] > 0 && (
  <div className="flex items-center justify-between gap-2 px-2 py-1 rounded text-[11px] bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 border border-blue-200/50 dark:border-blue-800/50">
    <span className="flex-1 flex items-center gap-1 truncate">
      <UserX className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">Número desconhecido (não está na agenda)</span>
    </span>
    <span className="font-mono tabular-nums font-medium flex-shrink-0">
      {counts['__unknown_contact__']}
    </span>
  </div>
)}
```

Adicione `UserX` no import:

```ts
import { BarChart3, UserX } from "lucide-react";
```

- [ ] **Step 7.2: Commit**

```bash
git add src/components/integrations/TrackingChannelStats.tsx
git commit -m "feat(integrations): linha especial no stats para '__unknown_contact__'

Quando counts['__unknown_contact__'] > 0, renderiza barra azul no topo
da lista com icone UserX e label 'Número desconhecido (não está na
agenda)'. Counter inclui no total geral automaticamente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 8: Mover tag no `ChatLeadItem`

**Files:** Modify `src/components/chat/ChatLeadItem.tsx`

Hoje o `<LeadTagsBadge>` aparece na linha do nome do lead, espremendo o layout. Mover pra logo após o telefone.

- [ ] **Step 8.1: Localizar render atual da tag**

```bash
cd "../crm-tracking"
grep -n "LeadTagsBadge" src/components/chat/ChatLeadItem.tsx
```

- [ ] **Step 8.2: Mover o componente**

O componente está renderizado dentro do grupo do nome (linha com nome do lead). Remova-o de lá e cole DEPOIS do elemento que renderiza o telefone do lead.

Procure pelo bloco que renderiza o telefone — geralmente algo como:

```tsx
<div className="flex items-center gap-1 text-xs text-muted-foreground">
  <Phone className="h-3 w-3" />
  {lead.telefone_lead}
</div>
```

ou similar. Adicione o `<LeadTagsBadge>` logo após esse bloco (e remova-o da posição original ao lado do nome).

Mantenha props passadas (`leadId`, `compact`, `maxVisible`, etc.) — não mude a API do `LeadTagsBadge`.

Se a linha do nome usava `flex` + `min-w-0` + `flex-shrink overflow-hidden` (do fix anterior) só pra acomodar a tag, considere relaxar essas constraints (já que o nome não compete mais com a tag). Mas só relaxe se isso não quebrar outro elemento; em dúvida, deixa como está.

- [ ] **Step 8.3: Commit**

```bash
git add src/components/chat/ChatLeadItem.tsx
git commit -m "feat(chat): tags movem pra linha do telefone (mais espaço)

Antes a tag 'Lead de anuncio' (e outras tags do lead) competiam com
o nome do lead pelo espaco horizontal — em leads com nome longo,
ficava cortado mesmo com o fix de truncation.

Agora LeadTagsBadge renderiza logo depois do telefone, que e tipicamente
mais curto e tem espaco sobrando. Truncation+tooltip continua valendo
como rede de seguranca.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin feature/whatsapp-tracking
```

---

## Task 9: Verificação local + build

**Files:** Nenhum.

- [ ] **Step 9.1: Verificar Vercel preview**

```bash
gh api "repos/marcosviniiciusfs-png/CRM---Definitivo/commits/$(git -C "../crm-tracking" rev-parse origin/feature/whatsapp-tracking)/statuses" --jq '.[] | select(.context=="Vercel") | {state, description}' 2>&1 | head -5
```

Esperado: `state: success`. Se `pending`, aguardar 2 minutos e re-checar. Se `failure`, ler logs do Vercel via `target_url` e reportar.

- [ ] **Step 9.2: Confirmar build verde**

Se Vercel verde, prosseguir pra Task 10. Se vermelho, identificar arquivo/linha do erro, corrigir, novo commit, voltar a 9.1.

---

## Task 10: Aplicar migration + redeploy webhook em prod (gated)

**Files:** Nenhum.

- [ ] **Step 10.1: Aguardar OK explícito do usuário**

Mensagem ao usuário:

> "Branch `feature/whatsapp-tracking` build verde. Posso aplicar migration `tracking_detect_unknown_contacts` em prod (aditiva, default false — sem impacto em rules existentes) e redeployar o webhook (v26 → v27)?"

NÃO prosseguir sem "sim" / "pode aplicar" explícito.

- [ ] **Step 10.2: Aplicar migration em prod**

```
mcp__plugin_supabase_supabase__apply_migration:
  project_id: uxttihjsxfowursjyult
  name: tracking_detect_unknown_contacts
  query: |
    ALTER TABLE public.whatsapp_tracking_rules
      ADD COLUMN IF NOT EXISTS detect_unknown_contacts BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 10.3: Verificar coluna criada**

```
mcp__plugin_supabase_supabase__execute_sql:
  project_id: uxttihjsxfowursjyult
  query: |
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='whatsapp_tracking_rules'
      AND column_name='detect_unknown_contacts';
```

Esperado: 1 linha, `data_type=boolean`, `is_nullable=NO`, `column_default=false`.

- [ ] **Step 10.4: Redeploy webhook**

Dispatch subagent (contexto grande). Prompt:

```
Redeploy whatsapp-message-webhook em prod com helper atualizado (commit 
da Task 2 da feature). Helper agora tem nova assinatura + branch 
detect_unknown_contacts.

Tool: mcp__plugin_supabase_supabase__deploy_edge_function
  project_id: uxttihjsxfowursjyult
  name: whatsapp-message-webhook
  entrypoint_path: index.ts
  verify_jwt: false
  files:
    - index.ts (full content de supabase/functions/whatsapp-message-webhook/index.ts)
    - ../_shared/cors.ts
    - ../_shared/evolution-config.ts
    - ../_shared/ad-lead-tagging.ts (atualizado na Task 2)

Worktree: C:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/crm-tracking/

Use ToolSearch select:mcp__plugin_supabase_supabase__deploy_edge_function pra 
carregar a tool. Reporte versao before/after.
```

- [ ] **Step 10.5: Confirmar deploy**

```
mcp__plugin_supabase_supabase__list_edge_functions:
  project_id: uxttihjsxfowursjyult
```

Procurar pelo `whatsapp-message-webhook` na resposta. Versão deve ter bumped (provavelmente 26 → 27).

---

## Task 11: Smoke test final

**Files:** Nenhum.

- [ ] **Step 11.1: Mensagem ao usuário com cenários**

> "Migration aplicada + webhook v27. Cenários pra você validar no preview Vercel (https://crm-definitivo-git-feature-whatsapp-tracking-kairozs-projects.vercel.app, Ctrl+F5):
>
> **A — Toggle aparece**: abrir Integrações → Trackeamento → clicar num canal → modal deve ter 2 toggles ("Trackear este canal" + "Detectar contatos desconhecidos"). 2º toggle disabled enquanto master está OFF.
>
> **B — Tag movida no Chat**: abrir Chat → leads taggeados mostram a tag na linha do TELEFONE, não do nome.
>
> **C — Detecção de desconhecido**: no card de um canal, abrir modal, ligar "Detectar contatos desconhecidos" (sem cadastrar keywords). De um número que (a) NÃO existe como lead na sua org, (b) NÃO está nos contatos do aparelho do canal, mande qualquer mensagem ('oi', 'tudo bem?'). Lead novo deve aparecer no Chat **com** a tag 'Lead de anúncio'.
>
> **D — Contato conhecido**: de um número que (a) NÃO existe como lead na org, (b) ESTÁ nos contatos do aparelho (você salvou no celular), mande mensagem. Lead aparece **sem** a tag.
>
> **E — Stats**: voltar ao modal do canal, scroll até stats. Se houver matches por desconhecido, deve aparecer linha azul 'Número desconhecido (não está na agenda)' com counter."

- [ ] **Step 11.2: Aguardar reporte do usuário**

Se algum cenário falhar, debugar e corrigir. Se todos OK, prosseguir pra abrir PR pra main.

---

## Task 12: Abrir PR para main

**Files:** Nenhum.

- [ ] **Step 12.1: Aguardar OK final do usuário**

Mensagem:

> "Smoke test concluído. Posso abrir PR para main?"

- [ ] **Step 12.2: Abrir PR**

```bash
gh pr create --base main --head feature/whatsapp-tracking \
  --title "feat: trackeamento de mensagens WhatsApp + redesign UI + detecção por contato desconhecido" \
  --body "$(cat <<'EOF'
## Summary

Feature de trackeamento de leads de anúncio em 3 fases:

1. **Core**: tabela whatsapp_tracking_rules, helper ad-lead-tagging, webhook integration, hook + UI inicial.
2. **UX**: KeywordsInput com botão Adicionar, fix de truncação de tag, redesign de cards compactos + modal de configuração, switch verde quando ativo, stats por keyword com filtro de data.
3. **Detecção complementar**: heurística "número não está na agenda do aparelho" como fallback quando keyword não bate. Toggle opt-in por canal. Reposicionamento da tag no Chat (linha do telefone).

Spec parent: `docs/superpowers/specs/2026-05-15-whatsapp-tracking-design.md`
Spec incremento: `docs/superpowers/specs/2026-05-16-tracking-unknown-contacts-design.md`
Plan parent: `docs/superpowers/plans/2026-05-15-whatsapp-tracking.md`
Plan incremento: `docs/superpowers/plans/2026-05-16-tracking-unknown-contacts.md`

## Test plan

- [x] Migrations aplicadas em prod (whatsapp_tracking_rules, tracking_match_log, detect_unknown_contacts column)
- [x] Webhook deployado em prod (v27)
- [x] Smoke test no preview Vercel: cenários A-E passaram
- [x] Build do Vercel verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 12.3: User merge via GitHub UI**

Aguardar o usuário clicar em "Squash and merge". Reportar a URL do PR.

---

## Self-review: spec coverage

| Spec section | Task |
|---|---|
| Schema: `detect_unknown_contacts` column | Task 1 |
| Helper: nova assinatura + branch unknown_contact | Task 2 |
| Webhook: passa instanceName + senderJid | Task 3 |
| Hook: tipo + upsertRule | Task 4 |
| UI: 2º toggle no Dialog | Task 5 |
| UI: indicador no Card | Task 6 |
| UI: linha especial no Stats | Task 7 |
| Chat: tag na linha do telefone | Task 8 |
| Build verification | Task 9 |
| Prod migration + webhook | Task 10 |
| Smoke test | Task 11 |
| PR + merge | Task 12 |

Items DEFERRED na spec (sem task):
- Cache de contatos (TTL ~5min): explicitamente fora do v1.
- Múltiplas tags por canal: fora do v1.
- Retroativo em leads históricos: fora do v1.

## Placeholder scan

Não há placeholders: todos os steps têm código completo ou comandos exatos. As referências entre tasks (ex: "commit da Task 2" no Task 10) usam o nome real do arquivo e contexto suficiente pra engineer encontrar.

## Type consistency

- `MaybeApplyAdLeadTagArgs` adiciona `instanceName: string` + `senderJid: string` (Task 2). Webhook (Task 3) passa exatamente esses campos com os nomes batendo.
- `TrackingRule.detect_unknown_contacts: boolean` (Task 4) usado em Dialog (Task 5), Card (Task 6), Stats (Task 7).
- Sentinel `'__unknown_contact__'` usado consistentemente em Task 2 (insert) e Task 7 (render).

---

## Notes for executing engineer

- Cada task termina em commit + push. Estado da branch após cada commit deve ser typecheck-clean.
- Migration NUNCA aplicada em prod sem Step 10.1 confirmado pelo usuário.
- Webhook deploy só após migration aplicada (ordem importa — helper espera coluna existente).
- Co-author footer obrigatório em todo commit (padrão do projeto).
