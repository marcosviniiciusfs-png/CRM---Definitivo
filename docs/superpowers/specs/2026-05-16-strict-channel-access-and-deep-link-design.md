# Acesso estrito por canal + deep-link respeitando WCM

**Status:** Design aprovado para desenvolvimento (rollout em feature branch / Vercel preview até validação completa pelo usuário).

**Data:** 2026-05-16

## Problema

Dois sintomas reportados:

1. **Members sem atribuição WCM veem TODOS os leads/canais da org.** Hoje os hooks `useAssignedChannels`, `useLeadMemberships`, `useChatAccess` e `isLeadVisibleByChannel` têm um "fallback de compatibilidade": se o member tem `Set` vazio de atribuições em `whatsapp_channel_members` (WCM), o sistema interpreta como "org não opt-ou pro filtro" e libera tudo. Resultado: na org do usuário (Mateus Brito's), dos 7 members, 5 com WCM vazio veem todos os leads dos 2 canais conectados, em vez de não verem nada. A regra desejada é: **member sem atribuição = sem acesso a leads WhatsApp da org**.

2. **Deep-link Pipeline → Chat ignora o canal do member.** No card do lead no Pipeline existe um balão (`MessageCircle`) que navega pra `/chat?lead_id=<uuid>`. No Chat, o handler em `src/pages/Chat.tsx:401-439` faz `setSelectedLead(found)` mas **nunca chama `setSelectedMembership`**. Resultado: a conversa abre sem contexto de canal → o filtro de mensagens fica sem `whatsapp_instance_id` (mostra todas as msgs históricas, pré-feature) → o envio cai no `selectedLead.whatsapp_instance_id` (canal de origem do lead), não no canal que o member está atribuído. Pra um member do canal Suporte ver um lead que entrou pelo canal Atendimento, hoje o sistema manda a resposta pelo canal Atendimento (errado: deveria sair pelo Suporte).

## Não-objetivos (v1)

- **Não** mexer no backend RLS de `lead_channel_memberships` (continua org-scoped; filtro de WCM continua sendo frontend-only — a memória "WCM em frontend" é alinhada com `mensagens_chat`).
- **Não** mudar o comportamento de leads sem canal (Facebook/manual): continuam visíveis pra todos os members da org, independente de WCM.
- **Não** mexer no `usePermissions.canViewChat`: o gate de "abrir a tela /chat" continua valendo (cargo custom pode liberar mesmo sem WCM); a partir daí o member vê sidebar vazia se não tem atribuição.
- **Não** mudar o RPC `user_can_access_lead` — ele já é strict (owner ou WCM ou responsavel ou lead sem canal); o bug é só no frontend.

## Modelo conceitual (sem mudança de schema)

Nada de tabela nova. As 3 tabelas-chave já existem:

| Tabela | Papel |
|---|---|
| `organization_members` | quem pertence à org + role (owner/admin/member) |
| `whatsapp_channel_members` (WCM) | quais canais cada user (não-owner) pode operar |
| `lead_channel_memberships` (LCM) | quais canais cada lead "está presente" — populado pela feature de transferência |

A semântica nova é: **WCM = porta de entrada pro Chat**. Member sem nenhuma row em WCM → não vê nenhum lead WhatsApp. Member com N rows → vê apenas leads cujas LCMs interceptam essas N rows.

## Mudanças

### 1. Migration: backfill defensivo de WCM

**Motivação**: hoje a única org com 2+ canais conectados (Mateus Brito's) tem 5 members com WCM vazio. Aplicar a regra estrita sem backfill os deixa sem nenhum lead visível imediatamente. O backfill preserva o estado atual ("todo mundo vê tudo") apenas no momento do deploy — daí em diante, owner controla via WCM.

**SQL (uma migration nova)**:

```sql
-- Para cada (org, member não-owner) onde a org tem 1+ canal CONNECTED
-- e esse member tem ZERO rows em whatsapp_channel_members nessa org,
-- inserir uma row para cada canal CONNECTED da org.
-- PK = (whatsapp_instance_id, user_id); created_at default now().
-- Idempotente: ON CONFLICT casa com a PK.
INSERT INTO public.whatsapp_channel_members (organization_id, user_id, whatsapp_instance_id)
SELECT om.organization_id, om.user_id, wi.id
FROM public.organization_members om
JOIN public.whatsapp_instances wi
  ON wi.organization_id = om.organization_id
 AND wi.status = 'CONNECTED'
LEFT JOIN public.whatsapp_channel_members existing
  ON existing.organization_id = om.organization_id
 AND existing.user_id = om.user_id
WHERE om.role <> 'owner'              -- owner sempre tem hasFullAccess; não precisa de row
  AND existing.user_id IS NULL        -- member sem nenhuma row WCM nesta org
ON CONFLICT (whatsapp_instance_id, user_id) DO NOTHING;
```

**Por que NOT IN ('owner') só**: admin no projeto atual deixou de ser `hasFullAccess` (commit `ec05e88` — admin ≠ owner). Admin precisa de WCM igual member. Backfill cobre admins também.

**Custo**: O(N members × M canais por org). Pra base atual (1 org × 5 members × 2 canais = 10 rows), trivial.

### 2. Frontend: remover o fallback "Set vazio = legado, libera tudo"

Quatro arquivos. Comportamento muda só onde antes o `Set vazio` retornava "libera"; passa a retornar "nega". Owner (hasFullAccess) continua bypass total.

#### 2.1 `src/hooks/useAssignedChannels.ts` — função `isLeadVisibleByChannel`

```ts
export function isLeadVisibleByChannel(
  leadInstanceId: string | null | undefined,
  assignedChannelIds: Set<string> | null
): boolean {
  if (!leadInstanceId) return true;     // lead sem canal (Facebook/manual) — mantém
  if (assignedChannelIds === null) return true;  // owner/admin bypass — mantém
  // ANTES: if (assignedChannelIds.size === 0) return true;  (legacy fallback)
  // DEPOIS: removido. Set vazio = sem acesso.
  return assignedChannelIds.has(leadInstanceId);
}
```

#### 2.2 `src/hooks/useLeadMemberships.ts`

Atual: `if (assignedChannelIds.size === 0) instanceFilter = null` (filtro = null = SEM filtro = retorna TUDO).

Novo: `if (assignedChannelIds.size === 0) instanceFilter = []` (filtro vazio = `IN ()` = 0 rows).

Implementação: o `.in('whatsapp_instance_id', [])` do supabase-js retorna 0 rows. Se o supabase-js rejeitar array vazio, fazer early-return `setCards([]); setLoading(false); return;`.

#### 2.3 `src/components/ChannelSelector.tsx`

A linha `if (assignedChannelIds.size === 0) return channels;` (libera todos) vira `return [];`. Member sem WCM → 0 visibleChannels → dropdown escondido (que já é o comportamento de "≤1 visível"). Consistente.

#### 2.4 `src/hooks/useChatAccess.ts`

Bloco 4 do hook (`Set vazio → canAccessChat=true`) é **mantido como está**: o gate de entrar na tela /chat permanece permissivo. A diferença é que dentro da tela o member vai ver lista vazia. Razão pra manter: cargos customizados (`canViewChat=true`) podem precisar acessar a tela mesmo sem WCM, e bloquear aqui esconde a tela inteira do menu lateral (UX pior do que entrar e ver "Nenhum contato"). YAGNI sobre redesenhar a permissão.

#### 2.5 `src/contexts/ChatMessageNotificationContext.tsx`

A função `resolveLeadInfo` filtra notificações pela mesma regra: `if (ids && ids.size > 0 && !ids.has(leadInstanceId)) return null;`. Para Set vazio (size=0) o `&&` curto-circuita → libera. Mudar pra: `if (ids && !ids.has(leadInstanceId)) return null;` — Set vazio = bloqueia notificação. Lead sem canal continua passando porque o bloco já tem `if (leadInstanceId)` em torno.

### 3. Frontend: deep-link Pipeline → Chat seleciona a membership certa

Atual em `src/pages/Chat.tsx:401-439`:

```ts
useEffect(() => {
  const leadIdParam = searchParams.get("lead_id");
  if (!leadIdParam) return;

  const found = leads.find((l) => l.id === leadIdParam);
  if (found) {
    setSelectedLead(found);  // <-- NÃO seta selectedMembership
  } else {
    // ... fetch direto + toast de "sem acesso"
  }
  // ...
}, [searchParams.get("lead_id"), leads]);
```

Novo comportamento — após resolver o lead, escolher a membership compatível:

1. Buscar memberships do lead na org atual: `SELECT whatsapp_instance_id, last_message_at, source, transferred_*, ... FROM lead_channel_memberships WHERE lead_id = X AND organization_id = orgId`.
2. Filtrar pelo WCM do member:
   - Owner (`hasFullAccess`): aceita todas.
   - Member: intersectar com `assignedChannelIds`.
3. Decidir o pick:
   - 0 acessíveis: já tem o toast "Sem acesso a esta conversa" (mantém).
   - 1 acessível: seta automaticamente — `setSelectedLead(found); setSelectedMembership(card)`.
   - 2+ acessíveis: pegar a com **maior `last_message_at` NULLS LAST** (default razoável; usuário pode clicar em outra borda colorida na sidebar pra trocar de canal depois).

Implementação esperada: extrair função pura `pickPreferredMembership(leadId, memberships, assignedChannelIds, hasFullAccess) → LeadMembershipCard | null` e chamar do effect.

**Caso "lead sem nenhuma membership"** (lead muito antigo, pré-feature-de-transferência): o backfill original em `20260513120000_lead_channel_transfer.sql` criou membership pra cada lead com `whatsapp_instance_id IS NOT NULL`. Lead que tinha canal vai ter membership. Lead sem canal (Facebook/manual) não tem membership e não cai no Chat de qualquer jeito (regra existente). Edge case OK.

**Performance**: a query é por `lead_id` (PK composta inclui `lead_id`), retorna ≤5 rows (membros por canal, e canais por org ≤5). Custo desprezível.

## Permissões / RLS

Sem mudanças. Recap das policies relevantes (já em prod):

- `lead_channel_memberships`: SELECT por org-member; INSERT/UPDATE/DELETE bloqueado pra users (só service_role via Edge Function).
- `leads` / `mensagens_chat`: RLS org-scoped + helper RPCs (`user_can_access_lead`, `user_can_access_channel`) usados defensivamente nas Edge Functions de envio. Já strict no SQL — não precisa mexer.

O backfill de WCM é **uma migração de dados**, não mexe em policy.

## Migração / rollout

Ordem das tasks:

1. Migration SQL: backfill WCM defensivo. Idempotente — pode rodar várias vezes.
2. Frontend: 5 edits cirúrgicas (useAssignedChannels, useLeadMemberships, ChannelSelector, ChatMessageNotificationContext, Chat.tsx deep-link). Cada uma com typecheck/build.
3. Deploy frontend (Vercel preview na feature branch).
4. Smoke test:
   - Owner: vê tudo, dropdown com 2 canais aparece, deep-link funciona.
   - Member com WCM=1 (João batista): vê só canal Mateus, dropdown escondido, deep-link respeita Mateus.
   - Member com WCM=0 **antes do backfill**: vê tudo. **Após o backfill**: vê os 2 canais (já que recebeu WCM dos 2). Owner pode tirar 1 e o member passa a ver só 1.
5. Merge em `main` após OK.

## Componentes

| Componente | Mudança |
|---|---|
| Migration SQL (nova) | Backfill defensivo de WCM pra members sem atribuição |
| `isLeadVisibleByChannel` (helper) | Remove fallback Set vazio = libera |
| `useLeadMemberships` (hook) | Set vazio agora gera filtro vazio (0 rows) em vez de "sem filtro" |
| `ChannelSelector` (componente) | Set vazio mostra 0 canais (dropdown some, alinhado com sidebar vazia) |
| `ChatMessageNotificationContext` (provider) | Notificações filtradas estritamente por WCM |
| `Chat.tsx` deep-link effect | Após resolver o lead, escolhe membership compatível e seta `selectedMembership` |
| `useChatAccess` (hook) | **Sem mudança** — gate de entrada na tela /chat continua permissivo |
| `LeadCard.tsx` balão de chat | **Sem mudança** — Pipeline continua só passando `?lead_id=` |

## Edge cases (resolução documentada)

1. **Owner com WCM=0 navega via deep-link**: hasFullAccess → todas as memberships do lead são candidatas → pega a mais recente. OK.
2. **Member com WCM=2 navega pra um lead que está em 3 canais (transferido), 1 dos quais está no WCM dele**: filtra → 1 candidato → seta automaticamente esse. OK.
3. **Member com WCM=2 navega pra um lead que está em 2 canais, ambos no WCM dele**: 2 candidatos → pega a com `last_message_at` mais recente. Pode trocar via card colorido. OK.
4. **Lead não tem membership nenhuma** (caso teórico — backfill cobriu tudo): `selectedMembership=null`, conversa abre sem filtro de canal → fallback existente de `loadMessages` (sem `.or` na query) continua funcionando, msgs aparecem normal. Envio usa `selectedLead.whatsapp_instance_id` como fallback final no `sendMessage`. Continua funcional.
5. **Org nova criada após deploy, owner adiciona 3 canais e 2 members sem configurar WCM**: members veem 0 leads no Chat. Owner precisa atribuir explicitamente. Comportamento desejado (Opção A confirmada). UX: o admin/owner que adicionar um member tem que ir na tela de WhatsApp/Equipes atribuir o canal.
6. **Member é responsável por um lead mas não tem WCM no canal desse lead**: `user_can_access_lead` no SQL libera via `l.responsavel_user_id = auth.uid()`. Defesa em profundidade — backend libera, frontend filtra. No frontend, esse member não vai ver o lead na sidebar (porque `useLeadMemberships` filtra por WCM). Comportamento intencional — WCM é a regra mestre no frontend.

## Testes (esboço de plano)

- **Schema/SQL**: rodar o backfill em snapshot, comparar contagens de `whatsapp_channel_members` antes/depois, verificar idempotência.
- **Integration manual no preview Vercel** (multi-account):
  - Login como **owner Mateus**: vê 2 canais, dropdown OK, todos os leads.
  - Login como **João batista** (member, WCM=1 Mateus): vê só leads de Mateus, dropdown escondido, deep-link de lead do canal Mateus abre OK; deep-link de lead do canal Brito mostra toast "Sem acesso".
  - Login como **Ferbatista** (member, WCM=0 antes do backfill): rodar backfill → relogar → agora vê os 2 canais. Owner remove canal Brito do Ferbatista → ele passa a ver só Mateus.
- **TypeScript / build**: `tsc --noEmit` + `vite build` verdes em cada commit.

## Aberto / fora do v1

- Self-service "associar member a canal" via UI ergonômica em massa (hoje provavelmente é por canal, um por vez). Fora do v1 — mexe em outra tela.
- Indicador visual "esta org tem 5 canais mas você só tem acesso a 2" pro member entender por que o dropdown tem só 2 opções. Fora do v1 — pode parecer leak de info.
