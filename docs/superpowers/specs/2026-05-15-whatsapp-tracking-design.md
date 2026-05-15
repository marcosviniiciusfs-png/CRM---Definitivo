# Trackeamento de mensagens WhatsApp (Lead de anúncio)

**Status:** Design aprovado. Implementação restrita a ambiente local (`supabase start` ou Supabase branch) até validação explícita do usuário antes de qualquer write em produção.

**Data:** 2026-05-15

## Problema

Quando uma org roda Click-to-WhatsApp Ads no Meta, o lead que vem do anúncio chega no número da empresa com uma mensagem pré-preenchida (ex: *"Olá, vim do anúncio do verão!"*). Hoje a CRM não distingue esse lead dos outros — todos viram "WhatsApp" no campo `source` e ficam misturados no funil. Marketing quer separar leads de anúncio dos orgânicos para medir ROI das campanhas, sem perder os leads que vierem por outros caminhos.

A solução: o admin marca canais para "tracking", define palavras-chave que identificam mensagens vindas de anúncios; quando a primeira mensagem de um lead novo chega num canal tracked e bate com alguma keyword, o lead recebe a tag **"Lead de anúncio"**. Leads que não baterem entram normalmente, sem a tag.

## Não-objetivos (v1)

- **Não** bloquear leads que não batem com keywords (todos entram normalmente; tag é o único diferencial).
- **Não** aplicar tag retroativamente em leads existentes que enviarem mensagens novas que batem com keywords. Só FIRST msg de lead NOVO.
- **Não** suportar regex / match modes 'all' / 'exact phrase' no v1 (schema está preparado, mas só 'any' é exposto na UI).
- **Não** distinguir maiúsculas/acentos no v1 (case-insensitive + accent-insensitive sempre).
- **Não** mexer no campo `lead.source` — continua "WhatsApp" como hoje. A categorização vem via tag.
- **Não** notificar o cliente final / não auto-responder.
- **Não** integrar com Meta Ads Manager (futuro: cruzar com `lead_extras` campaign data se existir).

## Modelo de dados

### Tabela nova: `whatsapp_tracking_rules`

| Coluna | Tipo | Comentário |
|---|---|---|
| `whatsapp_instance_id` | uuid PK | FK → `whatsapp_instances(id)` ON DELETE CASCADE. Uma rule por canal (no máximo). |
| `organization_id` | uuid NOT NULL | FK → `organizations(id)` ON DELETE CASCADE; denormalizado pra RLS |
| `enabled` | boolean NOT NULL DEFAULT true | toggle on/off sem apagar keywords |
| `keywords` | text[] NOT NULL DEFAULT '{}' | array de termos a procurar |
| `match_mode` | text NOT NULL DEFAULT 'any' | CHECK IN ('any','all','exact_phrase'). v1: só 'any' ativo. |
| `case_sensitive` | boolean NOT NULL DEFAULT false | v1: sempre false. |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | trigger atualiza |

**Índices:**
- PK em `(whatsapp_instance_id)` — único.
- `idx_wtr_org` em `(organization_id)` para RLS lookups.

**RLS:**
- SELECT: org members.
- INSERT/UPDATE/DELETE: owner/admin only (policy verifica `organization_members.role IN ('owner','admin')`).

**Trigger:** `updated_at = now()` no UPDATE (padrão do projeto).

**Realtime:** **NÃO** adicionar à publication. Mudanças nas rules são raras e o webhook lê on-demand. Sem realtime evita ruído.

### Tag "Lead de anúncio"

Reutiliza tabela existente `lead_tags` (id, organization_id, name, color, created_at). Sem mudanças de schema.

**Auto-criação na primeira aplicação:**

```sql
-- Webhook tenta achar; se não existe, cria.
SELECT id FROM lead_tags
WHERE organization_id = $1 AND name = 'Lead de anúncio'
LIMIT 1;
-- se vazio:
INSERT INTO lead_tags (organization_id, name, color)
VALUES ($1, 'Lead de anúncio', '#FB923C') -- laranja Tailwind orange-400
RETURNING id;
```

Cor padrão `#FB923C` (orange-400). Admin pode renomear via UI de Tags existente; webhook ainda encontra pelo nome "Lead de anúncio". **Caveat conhecido**: se admin renomear o nome da tag, futuros leads criam uma nova tag com nome "Lead de anúncio". V1 aceita esse trade-off (simplicidade); v2 pode usar flag `is_system` se virar problema.

### `lead_tag_assignments`

Sem mudanças de schema. INSERT padrão `(lead_id, tag_id, organization_id)`.

## Fluxo do webhook

Modificação em `supabase/functions/whatsapp-message-webhook/index.ts`. Hook entra **logo após criar o lead novo**, **antes do INSERT em mensagens_chat** (mantém ordem: lead → tagging → mensagem → demais).

```ts
// SE for lead recém-criado (não existia antes):
if (!existingLead /* lead foi criado nesse webhook */) {
  await maybeApplyAdLeadTag({
    supabase,
    organizationId,
    leadId,
    instanceId,
    messageInfo, // o objeto data.message do Evolution
  });
}
```

Helper `maybeApplyAdLeadTag` (novo, em `_shared/ad-lead-tagging.ts`):

```ts
export async function maybeApplyAdLeadTag({
  supabase, organizationId, leadId, instanceId, messageInfo,
}: Args): Promise<{ tagged: boolean; reason?: string }> {
  // 1) Lê rule do canal
  const { data: rule } = await supabase
    .from('whatsapp_tracking_rules')
    .select('enabled, keywords, match_mode, case_sensitive')
    .eq('whatsapp_instance_id', instanceId)
    .maybeSingle();

  if (!rule || !rule.enabled || !rule.keywords?.length) {
    return { tagged: false, reason: 'no_active_rule' };
  }

  // 2) Extrai texto (priority chain)
  const text =
    messageInfo?.conversation
    || messageInfo?.extendedTextMessage?.text
    || messageInfo?.imageMessage?.caption
    || messageInfo?.videoMessage?.caption
    || messageInfo?.documentMessage?.caption
    || '';

  if (!text.trim()) return { tagged: false, reason: 'empty_text' };

  // 3) Normaliza (lowercase + remove acentos via decomposicao Unicode)
  // Range ̀-ͯ cobre os combining diacritical marks (acento agudo,
  // til, circunflexo, etc) que aparecem apos NFD decomposicao.
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const haystack = normalize(text);
  const needles = rule.keywords.map(normalize);

  // 4) Match mode 'any': qualquer keyword bate
  const matched = needles.some(n => n.length > 0 && haystack.includes(n));

  if (!matched) return { tagged: false, reason: 'no_match' };

  // 5) Resolve (ou cria) tag "Lead de anúncio"
  let { data: tag } = await supabase
    .from('lead_tags')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('name', 'Lead de anúncio')
    .maybeSingle();

  if (!tag) {
    const { data: created, error: createErr } = await supabase
      .from('lead_tags')
      .insert({
        organization_id: organizationId,
        name: 'Lead de anúncio',
        color: '#FB923C',
      })
      .select('id')
      .single();
    if (createErr || !created) {
      console.warn('⚠️ Falha criar tag Lead de anúncio:', createErr);
      return { tagged: false, reason: 'tag_create_failed' };
    }
    tag = created;
  }

  // 6) Associa tag ao lead
  // Nota: schema atual de lead_tag_assignments tem (lead_id, tag_id) e
  // possivelmente organization_id (verificar). Se a coluna nao existir,
  // remover do payload — RLS via lead_id deve cobrir.
  const { error: assignErr } = await supabase
    .from('lead_tag_assignments')
    .insert({
      lead_id: leadId,
      tag_id: tag.id,
      organization_id: organizationId,
    });

  if (assignErr) {
    // 23505 (duplicate) é OK — já taggeado; nada a fazer.
    if ((assignErr as any)?.code !== '23505') {
      console.warn('⚠️ Falha associar tag:', assignErr);
      return { tagged: false, reason: 'assign_failed' };
    }
  }

  console.log(`🎯 Lead ${leadId} taggeado como Lead de anúncio (canal ${instanceId})`);
  return { tagged: true };
}
```

**Falhas no helper NÃO bloqueiam o fluxo principal.** O lead entra normal, a mensagem é salva, automações rodam — só não recebe a tag. Logs registram pra debug.

**Detecção de "novo lead"**: a função `whatsapp-message-webhook` já distingue entre `existingLead` encontrado por telefone e lead recém-criado. O hook só dispara no segundo caso.

## UI (frontend)

### Estrutura

| Arquivo | Responsabilidade |
|---|---|
| `src/pages/Integrations.tsx` | Modificar: adicionar nova `<TabsTrigger value="tracking">` e `<TabsContent value="tracking">` |
| `src/components/integrations/WhatsAppTrackingTab.tsx` | Container da aba |
| `src/components/integrations/TrackingChannelCard.tsx` | Card por canal: toggle + KeywordsInput + estado salvar |
| `src/components/integrations/KeywordsInput.tsx` | Input de chips: Enter adiciona, X remove, validação básica |
| `src/hooks/useTrackingRules.ts` | Hook: lista rules da org + mutations upsert/delete |

### Comportamento detalhado

**Lista de canais**: query em `whatsapp_instances WHERE organization_id = X AND status = 'CONNECTED'` ordenada por `created_at`. Para cada canal, LEFT JOIN com `whatsapp_tracking_rules` pra mostrar estado atual.

**Toggle "Trackear"**: ON → upsert da row com `enabled=true`. OFF → upsert com `enabled=false` (mantém keywords). Se nunca configurado, cria row vazia com `enabled=false`.

**KeywordsInput**:
- Type-and-enter cria chip.
- Backspace em input vazio remove último chip.
- X em chip remove individual.
- Trim + dedup + lowercase de armazenamento (display preserva caso).

  Wait — armazenamento dedup-lowercase quebra o caso original. Decisão: armazenar **case original** mas comparar normalizado. Display = original; matching = normalizado. Dedup case-insensitive.

- Validação: rejeita strings vazias, máximo 100 caracteres por keyword.

**Auto-save**: debounced 800ms após última mudança. Toast discreto "Salvo" no canto. Indicador de "salvando..." inline no card.

**Tag preview no topo da aba**: query "Lead de anúncio" da org; se existe mostra badge com cor + nome + link "Editar →" → navega pra `/configuracoes/tags` (ou wherever Tags settings live). Se não existe ainda, mostra placeholder "Tag será criada automaticamente quando o primeiro lead bater nas keywords".

**Empty state**: nenhum canal conectado → "Conecte um canal WhatsApp na aba **WhatsApp** primeiro" + botão que muda a aba ativa.

**Permissões**: só owner/admin acessam. Member que tentar acessar via URL: aba sumir do TabsList + se forçar URL via state, redirect ou disable.

## Migração

### Step 1 — Schema

Arquivo: `supabase/migrations/YYYYMMDDHHMMSS_whatsapp_tracking_rules.sql`.

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

-- Trigger updated_at
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

### Step 2 — Webhook update

Adicionar import em `whatsapp-message-webhook/index.ts`:

```ts
import { maybeApplyAdLeadTag } from "../_shared/ad-lead-tagging.ts";
```

Logo após o bloco que cria o lead novo (search por `// 🆕 Criar novo lead` ou `existingLead = newLead`), inserir:

```ts
// Lead recem-criado: avalia tracking rule do canal
try {
  await maybeApplyAdLeadTag({
    supabase,
    organizationId,
    leadId,
    instanceId,
    messageInfo,
  });
} catch (tagErr) {
  console.warn('⚠️ Erro ao avaliar tracking (nao bloqueia):', tagErr);
}
```

### Step 3 — Helper compartilhado

Criar `supabase/functions/_shared/ad-lead-tagging.ts` com a função `maybeApplyAdLeadTag` definida na seção "Fluxo do webhook" acima.

### Step 4 — Frontend

Implementar os 5 arquivos da tabela na seção UI. Tipos TypeScript:

```ts
// src/hooks/useTrackingRules.ts
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
```

### Step 5 — Restrição: tudo local primeiro

Sequência **obrigatória** de validação antes de qualquer write em prod:

1. Engineer roda `supabase start` ou cria branch via Supabase MCP.
2. Migration aplicada localmente; webhook + frontend testados num lead-de-teste numa instância de WhatsApp dedicada.
3. Cenários a validar:
   - Canal SEM rule: lead novo entra sem tag (regressão zero).
   - Canal COM rule + keywords vazias: lead novo entra sem tag.
   - Canal COM rule + match: lead novo entra COM tag "Lead de anúncio".
   - Canal COM rule + sem match: lead novo entra sem tag.
   - Lead já existente envia msg que daria match: NÃO recebe tag.
   - Lead novo com mídia sem caption: sem tag.
4. **Só após confirmação explícita do usuário**, aplica em produção via MCP `apply_migration` + redeploy do webhook.

## Edge cases

1. **Webhook concorrente** (cliente envia 2 msgs em sequência rápida): o helper roda só pra "lead recém-criado". Segunda msg vê o lead como existente → não dispara. ✓
2. **Tag "Lead de anúncio" deletada por admin**: próxima execução re-cria. Idempotente.
3. **Keyword com regex chars** (`.`, `*`, `(`): tratado como string literal (uso `String.includes`, não regex). Sem injeção possível.
4. **Keyword vazia ou só espaços**: filtrada na validação do input + `n.length > 0` no matcher (defesa em profundidade).
5. **Rule existe mas canal foi deletado**: FK ON DELETE CASCADE → row some.
6. **Org com 100+ canais**: query paginada na UI (limit 50, scroll). v1 aceita lista plana — refatora se virar problema.
7. **Lead criado por roleta antes do webhook chegar**: improvável (roleta dispara via webhook). Se acontecer, helper não roda (não-novo). Aceitável.
8. **Campanha muda texto**: admin atualiza keywords; novos leads usam novas keywords. Leads antigos ficam como estavam (sem retroatividade).

## Componentes (resumo da implementação)

| Componente | Responsabilidade |
|---|---|
| `whatsapp_tracking_rules` (migration) | Schema novo |
| `_shared/ad-lead-tagging.ts` (Edge) | Helper que avalia rule + aplica tag |
| `whatsapp-message-webhook` (Edge, modificada) | Chama o helper logo após criar lead novo |
| `useTrackingRules` (hook) | Query rules + mutations |
| `WhatsAppTrackingTab` (componente) | Container da aba |
| `TrackingChannelCard` (componente) | Card por canal |
| `KeywordsInput` (componente) | Chip-style input |
| `Integrations.tsx` (modificada) | Adiciona TabsTrigger + TabsContent |

## Testes (esboço de plano)

- **Manual local**: cenários listados na Step 5.
- **Unit (frontend)**: validação do KeywordsInput (dedup case-insensitive, trim, max length).
- **Integration (Supabase local)**: helper `maybeApplyAdLeadTag` chamado isoladamente — verifica que tag é criada na primeira vez e reutilizada nas seguintes.
- **E2E manual em prod (após validação local)**: criar canal de teste + rule + simular ad lead via Evolution Sandbox.

## Aberto (deferido pra v1.1+)

- Match modes 'all' / 'exact_phrase' / regex — schema preparado, UI não expõe.
- Aplicação retroativa de tag em leads existentes (botão "Reanalisar leads").
- Múltiplas tags por keyword set (ex: keyword "verão" → tag "Anúncio Verão"; keyword "black" → tag "Anúncio Black"). v1 só tem uma tag global "Lead de anúncio".
- Métrica/relatório: quantos leads tagged por canal/dia.
- Notificação ao admin quando keywords param de bater por X dias (campanha trocou e ele esqueceu de atualizar).
