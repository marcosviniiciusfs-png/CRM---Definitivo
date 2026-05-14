# Transferência de leads entre canais WhatsApp

**Status:** Design aprovado para desenvolvimento (rollout só em feature branch / Vercel preview até validação completa — sem merge em `main` antes do OK do usuário).

**Data:** 2026-05-13

## Problema

Hoje o sistema permite que cada lead esteja **em exatamente um canal WhatsApp** (`leads.whatsapp_instance_id`). Quando um lead chega no canal de "Atendimento" e precisa ser repassado pro canal de "Suporte" (ou qualquer outra equipe que opera por um número diferente), não há mecanismo: o suporte simplesmente não consegue mandar mensagem pra esse cliente, porque o lead "não pertence" ao canal deles e o filtro `whatsapp_channel_members` (WCM) esconde o lead.

A solução não pode ser "mover o lead pro canal B e tirar de A" porque atendimento perde o histórico e o cliente (que continua mandando msg pro número de A) fica sem ninguém vendo. Precisamos que **o mesmo lead exista em ambos os canais ao mesmo tempo**, com **conversas isoladas por canal**.

## Não-objetivos (v1)

- **Não** mover o lead de A pra B (atendimento mantém acesso pleno).
- **Não** reatribuir o `responsavel_user_id`. Lead mantém o mesmo responsável que tinha antes.
- **Não** mudar `funnel_id` / `funnel_stage_id` (funil é histórico do lead no comercial, ortogonal a canal).
- **Não** notificar o cliente automaticamente sobre a transferência (suporte que decide o que mandar e quando).
- **Não** disparar roleta no canal alvo (transferência é repasse manual, não distribuição).
- **Não** suportar "desfazer transferência" via UI (transferir de volta é a saída).

## Modelo de dados

### Nova tabela: `lead_channel_memberships`

Representa o par "lead X está presente no canal Y". Uma row por par.

| Coluna | Tipo | Comentário |
|---|---|---|
| `lead_id` | uuid NOT NULL | FK → `leads(id)` ON DELETE CASCADE |
| `whatsapp_instance_id` | uuid NOT NULL | FK → `whatsapp_instances(id)` ON DELETE CASCADE |
| `organization_id` | uuid NOT NULL | denormalizado pra RLS; FK → `organizations(id)` ON DELETE CASCADE |
| `source` | text NOT NULL CHECK (source IN ('inbound', 'transferred')) | como o lead chegou no canal |
| `transferred_from_instance_id` | uuid NULL | só quando `source='transferred'`; FK → `whatsapp_instances(id)` ON DELETE SET NULL |
| `transferred_at` | timestamptz NULL | só quando `source='transferred'`; marco temporal do "corte" do read-only |
| `transferred_by_user_id` | uuid NULL | só quando `source='transferred'`; FK → `auth.users(id)` ON DELETE SET NULL |
| `last_message_at` | timestamptz NULL | usado pra ordenar a sidebar |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**PK:** `(lead_id, whatsapp_instance_id)`

**Índices:**
- `idx_lcm_instance_lastmsg` em `(whatsapp_instance_id, last_message_at DESC NULLS LAST)` — query principal da sidebar.
- `idx_lcm_org` em `(organization_id)` — RLS lookups.

**Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE lead_channel_memberships`.

### Coluna nova em `mensagens_chat`

- `whatsapp_instance_id` uuid NULL, FK → `whatsapp_instances(id)` ON DELETE SET NULL.
- Cada mensagem agora carrega o canal pelo qual rolou (sai ou entra).
- Índice composto: `(id_lead, whatsapp_instance_id, data_hora DESC)`.

### O que NÃO muda

- `leads.whatsapp_instance_id` permanece. Representa o canal de origem (primeiro contato) — usado como fallback durante o rollout e como informação histórica. Não impede o lead de existir em outros canais via `lead_channel_memberships`.
- `leads.responsavel_user_id` não muda em nenhum momento da transferência.

## Fluxos

### A. Webhook (mensagem recebida)

Cliente manda mensagem pro número de um canal qualquer → webhook do Evolution dispara:

1. Resolve `instance_id` e `organization_id` (igual hoje).
2. Busca lead por `(telefone_lead, organization_id)` (igual hoje).
3. **NOVO**: `UPSERT lead_channel_memberships(lead_id, whatsapp_instance_id)`:
   - Se row já existe: `UPDATE SET last_message_at = now()`.
   - Se não existe: `INSERT (..., source='inbound', last_message_at=now())`. Lead passa a existir no canal automaticamente quando o cliente texta o número dele — sem ação manual.
4. INSERT `mensagens_chat` com `id_lead = X` e **`whatsapp_instance_id = canal_do_webhook`** (coluna nova).
5. Restante (mídia, foto de perfil, etc.) inalterado.

### B. Envio (mensagem enviada pelo CRM)

Atendente está vendo o card do lead **em um canal específico Y** (cada membership = seu próprio card na sidebar; ver UI abaixo):

1. Edge Function `send-whatsapp-message` (e parentes `send-whatsapp-media`) recebem `leadId` + `instance_name` (do canal que o usuário está vendo).
2. Envia pela instância Y do Evolution (igual hoje).
3. INSERT `mensagens_chat` com `id_lead = X` e **`whatsapp_instance_id = Y`** (sempre o canal de onde saiu).
4. `UPDATE lead_channel_memberships(X, Y) SET last_message_at = now()`.

### C. Transferência (a ação principal)

**Disparo (UI):**
- Desktop: clique direito no card do lead na sidebar → menu de contexto com opção **"Transferir para outro canal..."**.
- Mobile: long-press (300ms) no card → mesmo menu.

**Modal de confirmação:**
- Lista canais conectados da org (status `'CONNECTED'`), **exceto** canais que o lead já tem membership (esses ficam disabled com tooltip "Lead já está nesse canal").
- Texto explicativo: *"Transferir a conversa de @JoãoSilva para o canal Suporte? O suporte vai poder ver o histórico atual em modo leitura e iniciar uma nova conversa pelo número de Suporte. O atendimento continua com acesso normal a esse lead."*
- Botão: "Transferir".

**Backend (`transfer-lead-to-channel` Edge Function):**
1. Valida JWT → resolve user e org.
2. Valida permissão: owner/admin OR member com row em `whatsapp_channel_members(user_id, whatsapp_instance_id=canal_origem)`.
3. Valida que o canal alvo existe na mesma org e está conectado.
4. Valida que ainda não existe membership pro par alvo (idempotência).
5. `INSERT lead_channel_memberships (lead_id, whatsapp_instance_id=alvo, organization_id, source='transferred', transferred_from_instance_id=origem, transferred_at=now(), transferred_by_user_id=user, last_message_at=now())`.

**Sem row em `mensagens_chat`** pro marcador de transferência. O "system message" é **renderizado pelo frontend** a partir das colunas `transferred_*` da membership (item E abaixo).

### D. Sidebar (lista de leads)

**Modelo:**
- 1 row na sidebar = 1 membership (não mais 1 lead).
- Query base: `SELECT FROM lead_channel_memberships JOIN leads ... WHERE organization_id = orgId AND whatsapp_instance_id IN (canais que o user vê)`. Ordenação por `lead_channel_memberships.last_message_at DESC NULLS LAST`.
- Permanece o `.limit(300)` atual, mas sobre memberships (não leads). Pior caso: lead com 2-3 canais ocupa 2-3 slots.

**Implicações:**
- Member com WCM(A) só vê cards de leads que têm membership em A.
- Member com WCM(A) **e** WCM(B): se um lead tem membership em ambos, vê **dois cards** (um por canal). Diferenciados pela borda colorida do `channel_color` (já existe).
- Owner/admin: vê todos os cards de todas as memberships da org.

### E. Conversa (painel direito)

Quando o usuário clica num card, o estado passa a ter contexto duplo: `selectedLead` + **`selectedMembership` (lead_id + whatsapp_instance_id)**.

**Query de mensagens:** `WHERE id_lead = X AND whatsapp_instance_id = canal_da_membership`.

**Renderização para `membership.source = 'transferred'`:**
- **Topo (read-only)**: mensagens com `whatsapp_instance_id = transferred_from_instance_id` E `data_hora < transferred_at`. Background levemente cinza, sem botões de reagir/responder/deletar. Cabeçalho: *"📋 Histórico do canal **Atendimento** (somente leitura)"*.
- **Separador**: *"🔄 Conversa transferida por João Silva em 09/05/2026 10:32"* (derivado de `transferred_at` + `transferred_by_user_id` + nome via `responsiblesMap`).
- **Abaixo (interativo)**: mensagens com `whatsapp_instance_id = canal_atual` E `data_hora >= transferred_at`. Comportamento normal — pode enviar, reagir, deletar.

**Renderização para `membership.source = 'inbound'`:** thread normal sem read-only.

**Renderização no canal de origem (A) após uma transferência (opcional, nice-to-have):** A vê sua thread normal. Inserir uma "notinha" inline no instante `transferred_at`: *"🔄 Esta conversa também foi compartilhada com o canal **Suporte** por João Silva em 09/05/2026 10:32"*. Render derivado de qualquer membership em outros canais cujo `transferred_from_instance_id = A`. **Marcar como nice-to-have v1.1 se trouxer atraso** — design suporta, mas pode ficar pra um segundo pacote.

### F. Realtime

Mantém os 2 subscribes atuais do Chat (`leads` globais, `mensagens_chat` por lead).

**Novo subscribe** em `lead_channel_memberships`:
- Filtra por `whatsapp_instance_id IN (canais do usuário via WCM)` — owner/admin sem filtro.
- INSERT: adiciona card na sidebar (com toast: *"📥 Você recebeu o lead @JoãoSilva via transferência por Maria Souza"*).
- UPDATE: refresh do `last_message_at` (atualiza ordenação da sidebar).
- DELETE: remove card (canal foi deletado por admin).

**Substitui** o caminho atual onde `lead.whatsapp_instance_id` ditava visibilidade — agora membership é a fonte de verdade.

## Permissões / RLS

### `lead_channel_memberships`

- **SELECT**: members da org (espelha o padrão de `mensagens_chat`).
  ```sql
  CREATE POLICY lcm_org_select ON lead_channel_memberships FOR SELECT USING (
    organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid())
  );
  ```
- **INSERT/UPDATE/DELETE**: bloqueado pra users finais. Apenas service_role (via Edge Function `transfer-lead-to-channel` que valida permissão na lógica).

### `mensagens_chat` (coluna nova)

Sem mudanças em RLS. WCM filter continua sendo **frontend-only** (alinhado com o padrão atual: RLS = isolation de org; UI = isolation de canal). Importante manter assim — usuário de B precisa ler msgs de A no histórico read-only; se RLS bloqueasse, quebraria o feature.

### Edge Function `transfer-lead-to-channel`

Valida na lógica:
- User pertence à org.
- Lead pertence à mesma org.
- Canais origem e alvo pertencem à mesma org.
- User é owner/admin OR tem WCM no canal origem.
- Canal alvo está conectado (`status = 'CONNECTED'`).
- Membership ainda não existe pro par alvo.

Service role para o INSERT (RLS bloqueia user direto).

## Migração

Em ordem, segura para rollout:

### Step 1 — Schema migration

Arquivo: `supabase/migrations/YYYYMMDDHHMMSS_lead_channel_memberships.sql`

Conteúdo:
1. CREATE TABLE `lead_channel_memberships`.
2. ALTER TABLE `mensagens_chat` ADD COLUMN `whatsapp_instance_id uuid NULL` com FK.
3. CREATE INDEX nos dois lugares.
4. RLS policy SELECT em `lead_channel_memberships`.
5. ADD TABLE ao `supabase_realtime` publication.

### Step 2 — Backfill `lead_channel_memberships` (na mesma migration)

```sql
INSERT INTO lead_channel_memberships
  (lead_id, whatsapp_instance_id, organization_id, source, last_message_at, created_at)
SELECT id, whatsapp_instance_id, organization_id, 'inbound', last_message_at, created_at
FROM leads
WHERE whatsapp_instance_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

Custo: O(N) com N = leads com canal. Aceitável dentro do timeout da migration.

### Step 3 — Backfill `mensagens_chat.whatsapp_instance_id` (separado da migration)

`UPDATE mensagens_chat SET whatsapp_instance_id = (SELECT whatsapp_instance_id FROM leads WHERE leads.id = mensagens_chat.id_lead)` é potencialmente lento em prod.

**Estratégia:** rodar em **batches via MCP Supabase** (ou Edge Function admin one-time), com chunks de 10k rows, fora da migration. Durante o intervalo, mensagens antigas têm `whatsapp_instance_id = NULL`.

**Frontend trata NULL como compatibilidade**: msg com `whatsapp_instance_id IS NULL` exibe em qualquer canal que o lead tem membership — comportamento safe durante a janela de backfill.

**Best-effort acknowledged**: o backfill assume que toda mensagem histórica de um lead veio através do canal atualmente registrado em `leads.whatsapp_instance_id`. Se um lead recebeu mensagens organicamente de múltiplos canais no passado (cliente texta dois números diferentes), todas as msgs antigas serão atribuídas ao canal "de origem" durante o backfill — perdemos a granularidade histórica. Não é catastrófico (esses casos são raros e o display fica em "qualquer canal do lead" se NULL), mas registramos a limitação. Mensagens NOVAS após o rollout terão o canal correto.

### Step 4 — Atualizar Edge Functions de envio e webhook

Sem mudança de comportamento visível. Apenas preencher a coluna nova em todos os INSERTs novos:
- `whatsapp-message-webhook/index.ts`: INSERT de `mensagens_chat` ganha `whatsapp_instance_id` (já tem `instanceId` em escopo). UPSERT em `lead_channel_memberships`.
- `send-whatsapp-message/index.ts`, `send-whatsapp-media/index.ts`, `send-whatsapp-audio/index.ts` (e parentes): INSERT de `mensagens_chat` ganha `whatsapp_instance_id`. UPDATE em `lead_channel_memberships.last_message_at`.

### Step 5 — Refatorar frontend Chat para consumir `lead_channel_memberships`

- `loadAllChatData`: query base muda de `leads` pra `lead_channel_memberships JOIN leads`.
- `selectedLead` → `selectedMembership` (lead + canal). Vários callbacks dependentes precisam ler o canal do estado, não de `selectedLead.whatsapp_instance_id`.
- Filtro de mensagens em `loadMessages` ganha `.eq('whatsapp_instance_id', selectedMembership.channel_id)` (com fallback se NULL).
- Realtime: novo subscribe em `lead_channel_memberships`; subscribe atual de `mensagens_chat` ganha filtro adicional `whatsapp_instance_id=eq.X`.

### Step 6 — Implementar UI de transferência

- Adicionar context menu (Radix UI `ContextMenu`, ou customizado) no `ChatLeadItem`.
- Detecção de long-press no mobile.
- Modal `TransferLeadDialog` com lista de canais elegíveis.
- Edge Function `transfer-lead-to-channel`.

### Step 7 — Renderização do read-only history + separador

- Componente `TransferDivider` (inline na lista de mensagens).
- Lógica de split: mensagens antes/depois de `transferred_at` no `VirtualizedMessageList`.
- Style do read-only: opacity reduzida, sem hover actions.

### Step 8 — Toast de notificação ao receber transferência

- `ChatMessageNotificationContext` ganha subscribe em `lead_channel_memberships` com `source='transferred'`.

---

**Restrição operacional (importante):** todos os 8 steps em **feature branch**. Preview Vercel para teste. **Sem merge em `main`** até validação completa pelo usuário.

## Edge cases (resolução documentada)

1. **Cadeia A→B→C**: cada membership aponta só pro `transferred_from_instance_id` direto. C abre → vê histórico só de B. Não acessa A. **Limitação aceitável v1**; se virar problema, futuro pode generalizar pra "ver toda a cadeia".

2. **Mobile sem botão direito**: long-press de 300ms no card abre o mesmo menu. Padrão WhatsApp/Telegram.

3. **Canal alvo já tem membership**: disabled no modal com tooltip explicativo.

4. **Canal deletado pós-transferência**: FK `ON DELETE CASCADE` em `lead_channel_memberships.whatsapp_instance_id` → membership some. Mensagens do canal deletado: FK `ON DELETE SET NULL` em `mensagens_chat.whatsapp_instance_id` → mensagens ficam órfãs (`instance_id NULL`), visíveis no modo legado.

5. **Notificação ao receber transferência**: sistema atual escuta INSERTs em `mensagens_chat` — como o marker não cria row, não toca som. Toast visual via subscribe em `lead_channel_memberships`.

6. **Member transfere para canal que ele próprio não tem WCM**: permitido. Após a transferência, continua vendo o card de A normalmente — não perde acesso ao que era dele.

7. **Owner/admin sem WCM em canal nenhum**: visibilidade total via `hasFullAccess` no `useAssignedChannels` (mantém o comportamento atual).

8. **Roleta no canal alvo**: não dispara. Transferência é repasse manual, não inbound distribution.

9. **Performance sidebar**: ~300 membership cards no pior caso (média ~300 leads × 1.5 memberships). Ordenação por índice composto, OK.

10. **Lead sem WhatsApp nenhum** (Facebook, manual, importado): `lead.whatsapp_instance_id = NULL` → nenhuma membership em `lead_channel_memberships` → não aparece no Chat. Comportamento idêntico ao atual.

## Componentes (do design para a implementação)

| Componente | Responsabilidade | Depende de |
|---|---|---|
| Migration SQL + backfill | Schema novo, RLS, realtime publication, backfill seguro | Nenhuma (primeiro passo) |
| `whatsapp-message-webhook` | UPSERT membership + INSERT msg com canal | Schema migration |
| `send-whatsapp-{message,media,audio}` | INSERT msg com canal + UPDATE membership.last_message_at | Schema migration |
| `transfer-lead-to-channel` (nova Edge Function) | Validar permissão + INSERT membership 'transferred' | Schema migration |
| `useLeadMemberships` (novo hook) | Query base do Chat (substitui o `leads` direto) | Schema migration + frontend refactor |
| `Chat.tsx` (refatorado) | Renderizar memberships como cards; selectedMembership state; filtro de msgs por canal | useLeadMemberships |
| `ChatLeadItem` (atualizado) | Context menu / long-press com "Transferir" | UI library + Chat.tsx |
| `TransferLeadDialog` (novo) | Modal de seleção do canal alvo | Lista de canais elegíveis |
| `TransferDivider` (novo) | Separador visual entre read-only e thread atual | VirtualizedMessageList |
| `ChatMessageNotificationContext` (atualizado) | Toast de transferência recebida | Realtime subscribe novo |

## Testes (esboço de plano)

- **Unit** (frontend): `useLeadMemberships` retorna lista correta; renderização do read-only split funciona com timestamps reais.
- **Integration** (Supabase): RLS policy de `lead_channel_memberships`; webhook upserta sem duplicar; transfer-lead-to-channel rejeita user sem permissão.
- **E2E (manual no preview)**:
  - Atendente em canal A clica direito no lead → transferir pra B → suporte vê card surgir → suporte vê histórico read-only + thread vazia → suporte envia msg → atendente NÃO vê → cliente responde no número de A → atendente vê, suporte NÃO vê.
  - Backfill: rodar a migration em snapshot de produção (clonar via Supabase branch), comparar contagens.
  - Multi-org: o user multi-org do fix anterior testa que o feature funciona na sua org primária.

## Aberto (não-decidido, intencionalmente fora do v1)

- Visibilidade da "notinha" inline no canal origem (item E acima, "nice-to-have"): incluir no v1 se baixo custo; deferir senão.
- Filtro/busca de leads transferidos no histórico (relatório de transferências por período): fora do v1.
- "Untransfer" / desfazer transferência: fora do v1 (transferir de volta é o caminho).
- Notificação push (web push, email) pra membros do canal alvo: fora do v1 (toast in-app já cobre).
