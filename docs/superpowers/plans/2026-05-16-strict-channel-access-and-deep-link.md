# Strict Channel Access + Deep-Link Pipeline→Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar 2 bugs no Chat: (1) members sem nenhuma row em `whatsapp_channel_members` (WCM) deixam de ver tudo via fallback "legacy" e passam a ver só os canais aos quais foram atribuídos; (2) deep-link `?lead_id=X` do Pipeline passa a abrir a conversa no canal compatível com o WCM do member (em vez do canal de origem do lead).

**Architecture:** Mudança cirúrgica em 4 arquivos do frontend (remove o fallback "Set vazio = libera tudo") + 1 arquivo do frontend (deep-link handler escolhe membership preferida) + 1 migration SQL de backfill defensivo (atribui members atuais sem WCM a todos os canais conectados da org no instante do deploy, pra preservar estado de acesso). Sem mudança de schema, RLS ou RPC SQL — todos já são strict no Postgres.

**Tech Stack:** TypeScript + React 18 + Vite, Supabase (Postgres + RLS + supabase-js + Edge Functions já em prod). Sem framework de teste — verificação via `tsc --noEmit` + `vite build` + Supabase MCP SQL + smoke manual no Vercel preview.

**Spec:** `docs/superpowers/specs/2026-05-16-strict-channel-access-and-deep-link-design.md`

**Branch / worktree:** Todo o trabalho acontece no worktree `../crm-strict-wcm` na branch `feature/strict-wcm-and-deep-link` (já criada de `origin/main`). Cada task termina em commit + push. **NÃO mergear em `main`** até validação completa do usuário no Vercel preview.

---

## Contexto pro engenheiro (ler uma vez)

Você não tem contexto desse codebase. Pontos-chave:

- **Migrations** vivem em `supabase/migrations/`, nomeadas `YYYYMMDDHHMMSS_<topic>.sql`, rodam em ordem lexicográfica. Use timestamp `20260516120000` pro arquivo deste plan.
- **Aplicar migration** via Supabase MCP: `mcp__plugin_supabase_supabase__apply_migration` com `project_id = "uxttihjsxfowursjyult"`. NÃO commitar e rodar `supabase db push` — o MCP é a forma autorizada.
- **WCM** = tabela `whatsapp_channel_members(whatsapp_instance_id, user_id, organization_id, created_at)`. PK composta `(whatsapp_instance_id, user_id)`. Owner não precisa ter row — `usePermissions.canViewAllLeads = isOwner` no frontend, e `is_org_owner()` RPC no Postgres dá bypass.
- **`isLeadVisibleByChannel(leadInstanceId, assignedChannelIds)`** é o helper canônico usado por consumidores. Today retorna `true` quando `assignedChannelIds.size === 0` (fallback legacy). O fix muda esse retorno pra `false` quando o lead tem canal e o Set é vazio.
- **`useLeadMemberships`** é a fonte de verdade da sidebar do Chat. Query base em `lead_channel_memberships JOIN leads`. Quando member tem WCM vazio, hoje o filtro `instanceFilter = null` significa "sem filtro" (= retorna tudo). Fix: trata como filtro vazio = 0 rows.
- **Cargos custom**: `customRolePerms.can_view_all_leads` pode dar bypass igual owner. Isso é respeitado via `hasFullAccess`. Não mexer.
- **Deep-link**: Pipeline tem balão (`MessageCircle`) em `src/components/LeadCard.tsx:403` que faz `navigate("/chat?lead_id=" + id)`. O Chat lê em `src/pages/Chat.tsx:401-439` e faz `setSelectedLead(found)`. Bug: NUNCA chama `setSelectedMembership(...)`, então o canal contextual fica null → envio cai no canal de origem do lead.
- **No framework de teste**: verificação = `./node_modules/.bin/tsc --noEmit` + `./node_modules/.bin/vite build` + smoke manual.
- **Não merge em `main`** sem validação explícita do usuário.

---

## File structure (mudanças deste plan)

| Path | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260516120000_strict_wcm_backfill.sql` | Create | Backfill defensivo: pra cada member não-owner sem nenhum WCM, insere row pra cada canal CONNECTED da org. Idempotente (`ON CONFLICT DO NOTHING`). |
| `src/hooks/useAssignedChannels.ts` | Modify (1 spot) | Função `isLeadVisibleByChannel`: remover a linha do fallback Set vazio. Atualizar comentário. |
| `src/hooks/useLeadMemberships.ts` | Modify (1 spot) | Quando `assignedChannelIds.size === 0` e member sem hasFullAccess, retornar `[]` (vazio) em vez de continuar query sem filtro. |
| `src/components/ChannelSelector.tsx` | Modify (1 spot) | Quando `assignedChannelIds.size === 0`, retornar `[]` em vez de `channels`. |
| `src/contexts/ChatMessageNotificationContext.tsx` | Modify (1 spot) | Filtro WCM: remover o `&& ids.size > 0` (Set vazio passa a bloquear). |
| `src/pages/Chat.tsx` | Modify (1 effect) | Deep-link handler: após resolver o lead, escolher membership compatível (`pickPreferredMembership`) e chamar `setSelectedMembership`. |

---

## Task 1: Migration SQL — backfill defensivo de WCM

**Files:**
- Create: `supabase/migrations/20260516120000_strict_wcm_backfill.sql`

- [ ] **Step 1.1: Verificar estado pre-backfill via Supabase MCP**

Rode via `mcp__plugin_supabase_supabase__execute_sql` (project_id: `uxttihjsxfowursjyult`):

```sql
-- Contagem de members sem WCM em orgs com 1+ canal CONNECTED
WITH org_channels AS (
  SELECT organization_id, COUNT(*) AS connected_count
  FROM public.whatsapp_instances
  WHERE status = 'CONNECTED'
  GROUP BY organization_id
)
SELECT
  COUNT(*) AS members_without_wcm,
  COUNT(DISTINCT om.organization_id) AS affected_orgs
FROM public.organization_members om
JOIN org_channels oc ON oc.organization_id = om.organization_id
LEFT JOIN public.whatsapp_channel_members wcm
  ON wcm.organization_id = om.organization_id
 AND wcm.user_id = om.user_id
WHERE om.role <> 'owner'
  AND wcm.user_id IS NULL;
```

Anote o número de members afetados — o backfill vai inserir exatamente `members_without_wcm × canais_da_org` rows.

- [ ] **Step 1.2: Criar o arquivo de migration**

Conteúdo de `supabase/migrations/20260516120000_strict_wcm_backfill.sql`:

```sql
-- ============================================================
-- Strict WCM backfill (channel access tightening)
-- ============================================================
-- Pre-condicao: frontend hoje libera leads para members sem WCM
-- (fallback "Set vazio = visivel"). Os fixes do frontend tornam
-- o filtro estrito: member sem nenhuma row em whatsapp_channel_members
-- (WCM) deixa de ver leads WhatsApp.
--
-- Este backfill defensivo preserva o estado de acesso atual no
-- instante do deploy. Para cada org com 1+ canal CONNECTED e member
-- nao-owner que esta sem nenhuma row WCM nessa org, insere uma row
-- por canal CONNECTED. Daí em diante, owner controla o acesso de
-- cada member adicionando/removendo rows manualmente.
--
-- Idempotente: PK composta (whatsapp_instance_id, user_id) +
-- ON CONFLICT garantem que rodar duas vezes nao gera erro nem
-- duplica.
-- ============================================================

INSERT INTO public.whatsapp_channel_members (organization_id, user_id, whatsapp_instance_id)
SELECT om.organization_id, om.user_id, wi.id
FROM public.organization_members om
JOIN public.whatsapp_instances wi
  ON wi.organization_id = om.organization_id
 AND wi.status = 'CONNECTED'
LEFT JOIN public.whatsapp_channel_members existing
  ON existing.organization_id = om.organization_id
 AND existing.user_id = om.user_id
WHERE om.role <> 'owner'
  AND existing.user_id IS NULL
ON CONFLICT (whatsapp_instance_id, user_id) DO NOTHING;
```

- [ ] **Step 1.3: Aplicar a migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration`:
- `project_id`: `uxttihjsxfowursjyult`
- `name`: `strict_wcm_backfill`
- `query`: o SQL inteiro do Step 1.2

Esperado: success, sem erro.

- [ ] **Step 1.4: Verificar resultado do backfill**

Run via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
-- Após o backfill, deve dar 0 members sem WCM em orgs com canal CONNECTED
WITH org_channels AS (
  SELECT organization_id, COUNT(*) AS connected_count
  FROM public.whatsapp_instances
  WHERE status = 'CONNECTED'
  GROUP BY organization_id
)
SELECT
  COUNT(*) AS members_still_without_wcm
FROM public.organization_members om
JOIN org_channels oc ON oc.organization_id = om.organization_id
LEFT JOIN public.whatsapp_channel_members wcm
  ON wcm.organization_id = om.organization_id
 AND wcm.user_id = om.user_id
WHERE om.role <> 'owner'
  AND wcm.user_id IS NULL;
```

Esperado: `members_still_without_wcm = 0`.

Spot-check específico na sua org:

```sql
SELECT
  om.role,
  p.full_name,
  COUNT(wcm.whatsapp_instance_id) AS wcm_channels
FROM public.organization_members om
LEFT JOIN public.profiles p ON p.user_id = om.user_id
LEFT JOIN public.whatsapp_channel_members wcm
  ON wcm.user_id = om.user_id AND wcm.organization_id = om.organization_id
WHERE om.organization_id = '9ec6c4cc-bda6-47f5-a571-bd7319f831fc'
GROUP BY om.role, p.full_name
ORDER BY om.role, p.full_name;
```

Esperado: os 6 non-owner members (Ferbatista, João batista, João Silva, Marcos santos, Teste, Teste 02) com `wcm_channels = 2` cada. (João batista já tinha 1, ganhou 1 a mais.)

> **Cuidado**: se "João batista" só tinha 1 row apontando pra canal Mateus, este backfill **vai dar a ele acesso ao canal Brito também** (porque a regra é "se não tem nenhuma row, atribui a todos"). MAS o `WHERE existing.user_id IS NULL` impede isso — ele JÁ tem 1 row, então fica de fora. Verifique no spot-check que João batista permanece com **1** wcm_channel, não 2.

- [ ] **Step 1.5: Commit + push da migration**

Trabalhar no worktree: `cd "C:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/crm-strict-wcm"`.

```bash
git add supabase/migrations/20260516120000_strict_wcm_backfill.sql
git commit -m "feat(db): backfill defensivo de WCM antes do strict mode

Antes dos frontend fixes que removem o fallback 'Set vazio = libera',
preservar acesso atual de members sem WCM atribuindo-os a todos os
canais conectados da org. Idempotente via ON CONFLICT.

Daqui em diante owner controla acesso de cada member adicionando/
removendo rows WCM. Member sem nenhuma row -> sem leads WhatsApp."
git push origin feature/strict-wcm-and-deep-link
```

---

## Task 2: `isLeadVisibleByChannel` — remover fallback Set vazio

**Files:**
- Modify: `src/hooks/useAssignedChannels.ts`

- [ ] **Step 2.1: Aplicar a edit**

No worktree, no arquivo `src/hooks/useAssignedChannels.ts`, localize a função `isLeadVisibleByChannel` (linhas 100-118). Substitua o JSDoc + corpo da função:

```ts
/**
 * Helper para decidir se um lead e visivel para o user atual com base na
 * atribuicao de canais.
 *
 * - Lead sem whatsapp_instance_id (criado manual / Facebook / etc.): sempre visivel.
 * - Owner/admin com hasFullAccess (assignedChannelIds === null): sempre visivel.
 * - Member com Set nao-vazio: visivel apenas se o canal do lead esta no Set.
 * - Member com Set vazio (sem WCM): NAO visivel. Owner precisa atribuir
 *   explicitamente. Migration 20260516120000 fez backfill defensivo no
 *   deploy para nao quebrar acesso de members existentes.
 */
export function isLeadVisibleByChannel(
  leadInstanceId: string | null | undefined,
  assignedChannelIds: Set<string> | null
): boolean {
  if (!leadInstanceId) return true;
  if (assignedChannelIds === null) return true;
  return assignedChannelIds.has(leadInstanceId);
}
```

- [ ] **Step 2.2: Typecheck**

```bash
cd "C:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/crm-strict-wcm"
./node_modules/.bin/tsc --noEmit
```

Esperado: exit 0, sem erros.

> Se a pasta `node_modules` não existir no worktree, rode `npm install` uma vez nele.

- [ ] **Step 2.3: Commit**

```bash
git add src/hooks/useAssignedChannels.ts
git commit -m "fix(wcm): isLeadVisibleByChannel passa a bloquear Set vazio

Remove o fallback 'Set vazio = visivel' (legacy pre-feature).
Member sem nenhuma row em whatsapp_channel_members deixa de ver
leads WhatsApp da org. Owner/admin com hasFullAccess (Set null)
continua bypass. Lead sem canal (Facebook/manual) continua visivel.

Backfill defensivo no deploy (migration 20260516120000) preservou
o acesso de members existentes."
git push origin feature/strict-wcm-and-deep-link
```

---

## Task 3: `useLeadMemberships` — Set vazio = 0 rows

**Files:**
- Modify: `src/hooks/useLeadMemberships.ts`

- [ ] **Step 3.1: Aplicar a edit**

No arquivo `src/hooks/useLeadMemberships.ts`, localize o bloco de cálculo do `instanceFilter` (linhas ~67-76 hoje):

```ts
      let instanceFilter: string[] | null = null;
      if (!hasFullAccess) {
        if (assignedChannelIds === null) {
          instanceFilter = null;
        } else if (assignedChannelIds.size === 0) {
          instanceFilter = null;
        } else {
          instanceFilter = Array.from(assignedChannelIds);
        }
      }
```

Substitua por:

```ts
      let instanceFilter: string[] | null = null;
      if (!hasFullAccess) {
        if (assignedChannelIds === null) {
          // owner/admin via custom-role (defesa — nao deveria cair aqui
          // dado hasFullAccess ja seria true)
          instanceFilter = null;
        } else {
          // Member: filtra estritamente pelo WCM. Set vazio = sem acesso
          // a leads WhatsApp. Fallback legacy 'Set vazio -> sem filtro'
          // foi removido; migration 20260516120000 backfilled members
          // existentes para preservar acesso no deploy.
          instanceFilter = Array.from(assignedChannelIds);
        }
      }

      // Member sem WCM (instanceFilter array vazio) -> nada a mostrar.
      // Early return ANTES da query. O `finally` do try ja existente vai
      // resetar loadingRef e setLoading(false).
      if (instanceFilter && instanceFilter.length === 0) {
        setCards([]);
        return;
      }
```

Não duplique. O resto da função (`let query = supabase.from('lead_channel_memberships')... if (instanceFilter) query = query.in(...)`) fica como está.

- [ ] **Step 3.2: Conferir o `finally`**

Confirme no arquivo que existe um `finally` que faz:
```ts
} finally {
  loadingRef.current = false;
  setLoading(false);
}
```
Se sim, o `return` precoce no `try` ainda passa pelo `finally`. Se não, adicione `setLoading(false)` antes do `return`. (Comportamento atual é com finally — preserve.)

- [ ] **Step 3.3: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

Esperado: exit 0.

- [ ] **Step 3.4: Commit**

```bash
git add src/hooks/useLeadMemberships.ts
git commit -m "fix(wcm): useLeadMemberships zera cards quando member sem WCM

Antes: Set vazio -> instanceFilter = null -> query SEM filtro -> retorna
todos os memberships da org (bug do fallback legacy). Agora: Set vazio
nao-owner -> early return com cards=[]. Member sem atribuicao nao ve
nenhum lead WhatsApp na sidebar."
git push origin feature/strict-wcm-and-deep-link
```

---

## Task 4: `ChannelSelector` — Set vazio = 0 canais

**Files:**
- Modify: `src/components/ChannelSelector.tsx`

- [ ] **Step 4.1: Aplicar a edit**

Localize o bloco em `src/components/ChannelSelector.tsx` linhas 30-38. Substitua:

```tsx
  // Members veem apenas canais aos quais foram atribuidos. Owner/admin
  // (hasFullAccess) ve todos. Set vazio = member sem WCM = 0 canais
  // visiveis (alinhado com isLeadVisibleByChannel + useLeadMemberships
  // apos a remocao do fallback legacy).
  const visibleChannels = useMemo(() => {
    if (hasFullAccess) return channels;
    if (loading || !assignedChannelIds) return [];
    return channels.filter((c) => assignedChannelIds.has(c.id));
  }, [channels, hasFullAccess, loading, assignedChannelIds]);

  if (visibleChannels.length <= 1) return null;
```

Mudança: removida a linha `if (assignedChannelIds.size === 0) return channels;`. Set vazio agora cai no filter e retorna `[]`. Dropdown automaticamente some via `visibleChannels.length <= 1`.

- [ ] **Step 4.2: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4.3: Commit**

```bash
git add src/components/ChannelSelector.tsx
git commit -m "fix(wcm): ChannelSelector esconde dropdown para member sem WCM

Member sem nenhuma row WCM tinha o fallback 'Set vazio = mostra
todos os canais'. Agora cai no filter padrao e retorna lista vazia.
Dropdown some (≤1 visivel) alinhado com a sidebar vazia."
git push origin feature/strict-wcm-and-deep-link
```

---

## Task 5: `ChatMessageNotificationContext` — Set vazio bloqueia toast

**Files:**
- Modify: `src/contexts/ChatMessageNotificationContext.tsx`

- [ ] **Step 5.1: Aplicar a edit**

Localize o bloco em `src/contexts/ChatMessageNotificationContext.tsx` linhas 145-157. Substitua:

```ts
        // Filtro de atribuicao: aplica APOS resolver o lead (cache funciona
        // mesmo quando atribuicoes mudam — proxima check usa Set atualizado).
        // Member sem WCM (Set vazio) -> bloqueia notificacao. Lead sem canal
        // (Facebook/manual) continua passando pelo bloco `if (leadInstanceId)`.
        if (!hasFullAccessRef.current) {
            if (leadInstanceId) {
                const ids = assignedChannelIdsRef.current;
                if (ids && !ids.has(leadInstanceId)) {
                    return null;
                }
            }
        }
        return info;
```

Mudança: removido `&& ids.size > 0` do `if`. Set vazio antes curto-circuitava (liberava toast); agora bloqueia.

- [ ] **Step 5.2: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5.3: Commit**

```bash
git add src/contexts/ChatMessageNotificationContext.tsx
git commit -m "fix(wcm): toast de chat respeita member sem WCM

resolveLeadInfo() tinha o curto-circuito 'ids.size > 0 &&' que
liberava notificacao para Set vazio. Removido. Member sem WCM
nao recebe mais toast de msg WhatsApp. Lead sem canal continua
passando porque o filtro so aplica quando leadInstanceId existe."
git push origin feature/strict-wcm-and-deep-link
```

---

## Task 6: Chat.tsx deep-link — `pickPreferredMembership` + setSelectedMembership

**Files:**
- Modify: `src/pages/Chat.tsx`

- [ ] **Step 6.1: Locate o effect do deep-link**

Em `src/pages/Chat.tsx`, encontre o useEffect que começa em torno da linha 401:

```ts
  // Auto-seleciona lead via query param (?lead_id=<uuid>). Usado pelo
  // balao "abrir chat" no Pipeline. Roda uma vez se o param mudar.
  useEffect(() => {
    const leadIdParam = searchParams.get("lead_id");
    if (!leadIdParam) return;

    const found = leads.find((l) => l.id === leadIdParam);
    if (found) {
      setSelectedLead(found);
    } else {
      // ...
    }
    // ...
  }, [searchParams.get("lead_id"), leads]);
```

- [ ] **Step 6.2: Adicionar helper `pickPreferredMembership` ABOVE the effect**

Antes do useEffect do deep-link, adicione o helper como função pura. Pode ficar logo após a declaração de `selectedMembership` ou junto com outros helpers no arquivo. Sugestão: declare como `const` no escopo do componente (acesso ao closure):

```ts
  /**
   * Escolhe a membership "preferida" pra abrir um lead via deep-link.
   * - Owner com hasFullAccess: candidatas = todas memberships do lead na org.
   * - Member: candidatas = memberships do lead que estao no WCM dele
   *   (membershipCards ja vem filtrado pelo hook useLeadMemberships).
   *
   * Tie-break: maior last_message_at NULLS LAST (default razoavel —
   * usuario pode trocar de canal clicando em outro card colorido na
   * sidebar). Retorna null se nao ha candidata.
   */
  const pickPreferredMembership = useCallback(
    (leadId: string): LeadMembershipCard | null => {
      const candidates = membershipCards.filter((c) => c.lead_id === leadId);
      if (candidates.length === 0) return null;
      const sorted = [...candidates].sort((a, b) => {
        const aTs = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bTs = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bTs - aTs;
      });
      return sorted[0];
    },
    [membershipCards]
  );
```

- [ ] **Step 6.3: Substituir o effect do deep-link**

Substitua o useEffect inteiro (linhas ~401-439) por:

```ts
  // Auto-seleciona lead via query param (?lead_id=<uuid>). Usado pelo
  // balao "abrir chat" no Pipeline. Roda uma vez se o param mudar.
  // Espera membershipCards carregar para escolher a membership compativel
  // com o WCM do user.
  useEffect(() => {
    const leadIdParam = searchParams.get("lead_id");
    if (!leadIdParam) return;
    // Espera o hook de memberships carregar antes de decidir. Sem isso,
    // membershipCards pode estar vazio durante o boot e cair no toast
    // de "sem acesso" indevidamente.
    if (membershipsLoading) return;

    const pickedMembership = pickPreferredMembership(leadIdParam);

    if (pickedMembership) {
      // Caso normal: lead com membership acessivel.
      const leadObj = leads.find((l) => l.id === leadIdParam) || {
        id: pickedMembership.lead_id,
        nome_lead: pickedMembership.nome_lead,
        telefone_lead: pickedMembership.telefone_lead,
        email: pickedMembership.email,
        avatar_url: pickedMembership.avatar_url,
        is_online: pickedMembership.is_online,
        last_seen: pickedMembership.last_seen,
        last_message_at: pickedMembership.last_message_at,
        responsavel_user_id: pickedMembership.responsavel_user_id,
        whatsapp_instance_id: pickedMembership.lead_whatsapp_instance_id,
        organization_id: pickedMembership.organization_id,
      };
      setSelectedLead(leadObj as any);
      setSelectedMembership(pickedMembership);
    } else {
      // Sem membership compativel. Pode ser: (a) lead sem canal (Facebook/
      // manual), (b) lead com canal mas user sem WCM nesse canal, (c) lead
      // de outra org (RLS bloqueia). Fazemos fetch direto para distinguir.
      (async () => {
        const { data } = await supabase
          .from("leads")
          .select("*")
          .eq("id", leadIdParam)
          .maybeSingle();
        if (data) {
          // Lead existe (RLS liberou via owner OR responsavel OR sem canal).
          // Abre sem selectedMembership — sendMessage cai no fallback final
          // de lead.whatsapp_instance_id, e msgs aparecem sem filtro de canal.
          setSelectedLead(data as any);
          setSelectedMembership(null);
        } else {
          toast({
            title: "Sem acesso a esta conversa",
            description: "Voce nao foi atribuido ao canal deste lead.",
            variant: "destructive",
          });
        }
      })();
    }

    // Limpa o param da URL para nao reabrir ao navegar.
    setSearchParams(
      (params) => {
        params.delete("lead_id");
        return params;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("lead_id"), leads, membershipCards, membershipsLoading]);
```

> Mudanças vs. o effect antigo:
> 1. Bloqueia execução enquanto `membershipsLoading` for true.
> 2. Usa `pickPreferredMembership` em vez de `leads.find`.
> 3. Seta `selectedMembership` em conjunto com `selectedLead` (ou null no fallback).
> 4. Constrói o `leadObj` a partir da membership se `leads.find` não acha (cobre o caso de deep-link logo após login onde `leads` ainda não populou mas `membershipCards` sim — eles populam quase juntos, mas a ordem não é garantida).
> 5. Deps array inclui `membershipCards` e `membershipsLoading`.

- [ ] **Step 6.4: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 6.5: Build (sanity check)**

```bash
./node_modules/.bin/vite build 2>&1 | tail -10
```

Esperado: `✓ built in Xs`, sem erros (warnings de chunk size são OK).

- [ ] **Step 6.6: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "fix(chat): deep-link Pipeline abre conversa no canal do member

useEffect de ?lead_id agora aguarda membershipCards carregar e
escolhe via pickPreferredMembership(): membership do lead que esta
no WCM do user (membershipCards ja vem filtrado pelo hook), com
tie-break por last_message_at DESC.

- Antes: chamava setSelectedLead sem setar selectedMembership ->
  envio caia no canal de origem do lead, msgs apareciam sem filtro
- Agora: setSelectedLead + setSelectedMembership em conjunto;
  conversa abre no canal correto + envio sai pelo canal correto

Edge cases:
- Lead sem canal (Facebook/manual): pickedMembership=null,
  fallback fetch direto, abre sem membership (igual antes).
- Lead com canal mas user sem WCM nesse canal: candidates=[],
  fallback fetch retorna null (RLS via user_can_access_lead),
  toast 'sem acesso'."
git push origin feature/strict-wcm-and-deep-link
```

---

## Task 7: Smoke test end-to-end no Vercel preview

**Files:** Nenhum. Validação manual.

- [ ] **Step 7.1: Aguardar Vercel preview deploy**

Após o push da Task 6, o Vercel cria um preview para o último commit. Use:

```bash
gh api repos/marcosviniiciusfs-png/CRM---Definitivo/commits/$(git rev-parse HEAD)/statuses --jq 'sort_by(.updated_at) | reverse | .[0]'
```

Aguarde estado `success`. Pegue o URL do preview via deployment status:

```bash
gh api 'repos/marcosviniiciusfs-png/CRM---Definitivo/deployments?per_page=1' --jq '.[0].id' | xargs -I {} gh api "repos/marcosviniiciusfs-png/CRM---Definitivo/deployments/{}/statuses" --jq '.[0].environment_url'
```

Envie o URL ao usuário.

- [ ] **Step 7.2: Cenário 1 — owner**

Login como owner (Mateus Brito). Verificar:
- ✅ Vê todos os leads dos 2 canais (Mateus + Brito).
- ✅ Dropdown "Todos os canais" aparece e funciona.
- ✅ Clica em qualquer card → conversa abre normal, envio funciona.
- ✅ Vai no Pipeline, clica no balão de um lead → Chat abre com o lead selecionado E `selectedMembership` setado (verificar via DevTools React → component state OU comportamento: borda do card ativo é colorida do canal certo).

- [ ] **Step 7.3: Cenário 2 — member com WCM=1 (João batista, atribuído a "Mateus")**

Login como João batista. Verificar:
- ✅ Vê só leads do canal Mateus.
- ✅ Dropdown NÃO aparece (só 1 canal visível, comportamento intencional).
- ✅ Pipeline balão de um lead que tem membership no canal Mateus → abre OK no Chat.
- ✅ Pipeline balão de um lead que está SÓ no canal Brito → toast "Sem acesso a esta conversa".

- [ ] **Step 7.4: Cenário 3 — member com WCM=2 (pós-backfill, ex: Ferbatista)**

Login como Ferbatista. Verificar:
- ✅ Vê leads dos 2 canais (igual antes — backfill preservou acesso).
- ✅ Dropdown "Todos os canais" aparece com Mateus + Brito.

Agora, **owner remove o canal Brito do Ferbatista** (via tela de WhatsApp/Equipes — ou rode SQL direto: `DELETE FROM whatsapp_channel_members WHERE user_id = '<ferbatista_uuid>' AND whatsapp_instance_id = '<brito_uuid>';`). Recarrega Chat do Ferbatista:
- ✅ Sidebar passa a mostrar só leads do canal Mateus.
- ✅ Dropdown some (1 canal visível).
- ✅ Pipeline balão de lead de Brito → toast "Sem acesso".

- [ ] **Step 7.5: Cenário 4 — member SEM nenhum WCM (rollback test)**

Pra testar a regra estrita, remover TODOS os WCM do Ferbatista temporariamente:

```sql
DELETE FROM public.whatsapp_channel_members
WHERE user_id = '<ferbatista_uuid>'
  AND organization_id = '9ec6c4cc-bda6-47f5-a571-bd7319f831fc';
```

Recarrega Chat do Ferbatista:
- ✅ Sidebar vazia ("Nenhum contato").
- ✅ Dropdown não aparece (0 canais visíveis).
- ✅ Pipeline balão de qualquer lead WhatsApp → toast "Sem acesso".
- ✅ Notificação toast não dispara para nenhuma msg WhatsApp.

Restaurar via rodar a migration novamente (ela é idempotente):

```sql
INSERT INTO public.whatsapp_channel_members (organization_id, user_id, whatsapp_instance_id)
SELECT om.organization_id, om.user_id, wi.id
FROM public.organization_members om
JOIN public.whatsapp_instances wi
  ON wi.organization_id = om.organization_id
 AND wi.status = 'CONNECTED'
LEFT JOIN public.whatsapp_channel_members existing
  ON existing.organization_id = om.organization_id
 AND existing.user_id = om.user_id
WHERE om.role <> 'owner'
  AND existing.user_id IS NULL
ON CONFLICT (whatsapp_instance_id, user_id) DO NOTHING;
```

- [ ] **Step 7.6: Cenário 5 — deep-link em lead transferido (defesa)**

Crie cenário: lead originalmente no canal Mateus, transferido para Brito. (Pode reusar lead da feature de transferência se existir, ou criar um novo.) Login como member com WCM nos 2 canais. Pipeline → clica no balão do lead:
- ✅ Chat abre com `selectedMembership` na membership mais recente (`last_message_at` DESC).
- ✅ Envio sai pelo canal selecionado.

Tente login como member com WCM **só em Brito**. Mesmo lead:
- ✅ Chat abre na membership de Brito (única candidate).
- ✅ Vê histórico read-only do canal Mateus (feature de transferência existente).

- [ ] **Step 7.7: Reportar resultado ao usuário**

Resumo:
- ✅ Owner: tudo OK.
- ✅ Member com WCM: vê só atribuídos.
- ✅ Member sem WCM: vê NADA.
- ✅ Deep-link: respeita canal do member.
- ✅ Toast notifications: respeita WCM.

Se algum cenário falhar, abrir issue ou fix inline. Não passar para Task 8 sem todos os ✅.

---

## Task 8: Merge para `main` (gated no OK do usuário)

**Files:** Nenhum.

- [ ] **Step 8.1: Aguardar OK explícito do usuário**

Aguardar mensagem do tipo "pode mergear" ou equivalente.

- [ ] **Step 8.2: Abrir PR**

```bash
cd "C:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/crm-strict-wcm"
gh pr create --base main --head feature/strict-wcm-and-deep-link \
  --title "fix(chat): acesso estrito por canal + deep-link respeitando WCM" \
  --body "$(cat <<'EOF'
## Summary

Fecha 2 bugs reportados no Chat:

1. Members sem nenhuma row em `whatsapp_channel_members` (WCM) viam todos os leads/canais da org via fallback "Set vazio = libera". Agora veem **nada** até serem atribuídos explicitamente. Backfill defensivo aplicado no deploy para preservar acesso atual.
2. Deep-link `?lead_id=X` do Pipeline → Chat abria a conversa sem setar `selectedMembership`, fazendo o envio cair no canal de origem do lead. Agora escolhe a membership compatível com o WCM do member (`pickPreferredMembership`) e seta `selectedMembership` em conjunto com `selectedLead`.

Spec: `docs/superpowers/specs/2026-05-16-strict-channel-access-and-deep-link-design.md`
Plan: `docs/superpowers/plans/2026-05-16-strict-channel-access-and-deep-link.md`

## Test plan

- [x] Migração de backfill aplicada e verificada (0 members sem WCM em orgs com canais)
- [x] Smoke test owner / member com WCM=1 / member com WCM=2 / member sem WCM
- [x] Deep-link em leads simples e transferidos
- [x] tsc --noEmit limpo, vite build verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8.3: Merge (squash)**

```bash
gh pr merge <pr_number> --squash
```

- [ ] **Step 8.4: Verificar production deploy do Vercel**

```bash
sleep 60  # aguarda Vercel buildar prod
gh api repos/marcosviniiciusfs-png/CRM---Definitivo/commits/$(git rev-parse origin/main)/statuses --jq 'sort_by(.updated_at) | reverse | .[0]'
```

Esperado: `state: success` no contexto Vercel.

- [ ] **Step 8.5: Cleanup do worktree**

```bash
cd "C:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
git worktree remove --force "C:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/crm-strict-wcm"
git branch -d feature/strict-wcm-and-deep-link 2>&1 | tail -2
```

Done.

---

## Self-review: spec coverage

| Spec section | Task(s) |
|---|---|
| Migration: backfill defensivo de WCM | Task 1 |
| `isLeadVisibleByChannel` remove fallback | Task 2 |
| `useLeadMemberships` Set vazio = 0 rows | Task 3 |
| `ChannelSelector` Set vazio = 0 canais | Task 4 |
| `ChatMessageNotificationContext` strict | Task 5 |
| `Chat.tsx` deep-link `pickPreferredMembership` | Task 6 |
| `useChatAccess` **não muda** | (não-objetivo da spec — confirmado, sem task) |
| `LeadCard.tsx` Pipeline **não muda** | (não-objetivo da spec — confirmado, sem task) |
| RPC SQL **não muda** | (não-objetivo da spec — confirmado, sem task) |
| Smoke test end-to-end | Task 7 |
| Merge gated no OK do usuário | Task 8 |

---

## Notes para o engenheiro executando

- Cada task termina com commit + push. Após cada commit, Vercel cria preview deploy — você pode validar visualmente em qualquer ponto.
- Se algum `tsc --noEmit` falhar, **NÃO** prossiga para a próxima task. Corrija na hora.
- A migration é idempotente — pode rodar várias vezes sem problema.
- Não rodar `DELETE FROM whatsapp_channel_members` em prod sem confirmação do usuário.
- A pasta `node_modules` no worktree provavelmente não existe — rode `npm install` uma vez antes de tipar/buildar.
- Não pedir para tocar em `useChatAccess.ts` — ele MANTÉM o fallback intencionalmente (gate de entrada na tela /chat, não filtro de dados).
