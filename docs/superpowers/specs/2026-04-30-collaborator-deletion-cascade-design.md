# Spec — Exclusão em cascata de colaborador

**Data:** 2026-04-30
**Stakeholder:** Hurtz (owner)
**Tipo:** Bug fix de comportamento + nova edge function + RPC

## Problema

Quando o owner exclui um colaborador na seção **Colaboradores**, o código em [src/pages/Colaboradores.tsx:413-428](../../../src/pages/Colaboradores.tsx#L413-L428) faz **apenas** `DELETE FROM organization_members WHERE id = ?`. Isso deixa um conjunto de estados inconsistentes:

1. **Auth órfão:** O usuário continua existindo em `auth.users`. Ele pode tentar logar com o mesmo e-mail/senha — a sessão é criada, mas o app trava em estado de "sem organização" porque o vínculo foi apagado.
2. **Leads órfãos:** Os registros em `leads.responsavel_user_id` continuam apontando para o usuário deletado. Esses leads ficam "presos" — não aparecem na lista de leads sem dono e não entram na roleta.
3. **Equipes inconsistentes:** Se o colaborador era líder de alguma equipe (`teams.leader_id`), o ponteiro fica órfão. Se era membro (`team_members`), a linha persiste.
4. **Roletas inconsistentes:** Se o user_id estava em `lead_distribution_configs.eligible_agents` (array), continua lá — a roleta tenta distribuir leads para um usuário que não existe mais.

## Resultado esperado

Ao excluir um colaborador na seção Colaboradores:

- O acesso (e-mail/senha) deixa de existir — login retorna "credenciais inválidas".
- Todos os leads dele perdem a atribuição (`responsavel_user_id = NULL`).
- Leads ativos do pipeline voltam para a roleta automaticamente (via cron `auto-redistribute-leads` Phase 2 já existente).
- Leads fechados (won/lost) preservam o nome do colaborador no campo texto `responsavel` para histórico de relatórios e comissões.
- Vínculos com equipes (membro e líder) e com roletas são removidos.
- Antes da confirmação, o owner vê um **preview** numérico do impacto.

## Decisões tomadas durante o brainstorming

| Pergunta | Escolha |
|---|---|
| Hard delete do auth ou soft delete? | **Hard delete** (`auth.admin.deleteUser`) — irreversível, libera o e-mail. |
| Escopo dos leads desatribuídos? | **Todos** os leads do colaborador (ativos + fechados). |
| Atribuição original em relatórios? | **Preservar** o nome no campo texto `responsavel` para leads fechados (won/lost). Para leads ativos, ambos os campos são zerados. |
| UX do diálogo de confirmação? | **Preview com números** (leads, equipes, roletas) carregado via RPC antes do dialog abrir. |
| Onde a lógica vive? | **Nova edge function** `delete-organization-member` + **nova RPC** `preview_organization_member_deletion`. |

## Arquitetura

### 3 componentes novos/modificados

```
                  ┌─────────────────────────────┐
[Colaboradores.tsx]                              │
  click "excluir"  ─►  RPC preview_organization_member_deletion
                       (abre dialog com números)
                                                 │
  click "Excluir definitivamente"  ─►  Edge fn delete-organization-member
                                       (executa cascata)
                                                 │
                       Cron auto-redistribute-leads (existente, com patch)
                       distribui leads ativos NULL via roleta ativa
```

### Componente 1 — Edge Function `delete-organization-member`

**Caminho:** `supabase/functions/delete-organization-member/index.ts`

**Auth:** JWT do owner (header `Authorization: Bearer <jwt>`).

**Input:**
```json
{ "member_id": "uuid", "organization_id": "uuid" }
```

**Pré-condições (validadas em ordem):**

1. JWT válido → extrair `caller_user_id`.
2. `caller_user_id` é `owner` da `organization_id` (`SELECT role FROM organization_members WHERE user_id = caller AND organization_id = X`).
3. `member_id` existe na `organization_id`.
4. Membro alvo não tem `role = 'owner'`.
5. `member.user_id != caller_user_id`.

Falha em qualquer pré-condição retorna `403` com mensagem específica.

**Execução (ordem importa):**

| # | Operação | Tabela | SQL |
|---|---|---|---|
| 1 | Limpar liderança | `teams` | `UPDATE teams SET leader_id = NULL WHERE leader_id = $user_id AND organization_id = $org_id` |
| 2 | Sair de equipes | `team_members` | `DELETE FROM team_members WHERE user_id = $user_id AND team_id IN (SELECT id FROM teams WHERE organization_id = $org_id)` |
| 3 | Sair das roletas | `lead_distribution_configs` | `UPDATE lead_distribution_configs SET eligible_agents = array_remove(eligible_agents, $user_id::text) WHERE organization_id = $org_id AND $user_id = ANY(eligible_agents)` |
| 4a | Identificar estágios won/lost | `funnel_stages` | `SELECT id FROM funnel_stages WHERE stage_type IN ('won','lost')` (cache em memória) |
| 4b | Desatribuir leads ativos | `leads` | `UPDATE leads SET responsavel_user_id = NULL, responsavel = NULL WHERE responsavel_user_id = $user_id AND organization_id = $org_id AND (funnel_stage_id IS NULL OR funnel_stage_id NOT IN (won/lost ids))` |
| 4c | Desatribuir leads fechados (preservar texto) | `leads` | `UPDATE leads SET responsavel_user_id = NULL WHERE responsavel_user_id = $user_id AND organization_id = $org_id AND funnel_stage_id IN (won/lost ids)` *(campo `responsavel` texto não é alterado)* |
| 5 | Remover da org | `organization_members` | `DELETE FROM organization_members WHERE id = $member_id` |
| 6 | Apagar usuário do auth | `auth.users` | `adminClient.auth.admin.deleteUser($user_id)` — **só se `user_id IS NOT NULL`** |

**Resposta de sucesso (200):**
```json
{
  "success": true,
  "summary": {
    "active_leads_unassigned": 23,
    "closed_leads_preserved": 8,
    "teams_as_leader_cleared": 2,
    "roulettes_cleaned": 1,
    "auth_deleted": true
  }
}
```

**Tratamento de falhas:**

- Não há rollback transacional cross-API (banco + auth são sistemas separados). Operação é projetada para ser **idempotente**: repetir é seguro porque cada passo só age no estado atual (DELETE WHERE, array_remove, UPDATE WHERE).
- Falha em qualquer passo: log no console + retorna `500` com `step` que falhou e contadores parciais. Owner pode reexecutar.
- Caso degenerado: passo 5 (DELETE em organization_members) sucede mas passo 6 (auth.admin.deleteUser) falha → o vínculo já foi removido, mas o auth.users persiste. Próxima execução com mesmo member_id retorna 404 (membro já não existe). Mitigação: documentar fallback manual via admin panel (`admin_delete_user`).

### Componente 2 — RPC SQL `preview_organization_member_deletion`

**Caminho:** Nova migration em `supabase/migrations/YYYYMMDDHHMMSS_preview_member_deletion.sql`.

**Assinatura:**
```sql
preview_organization_member_deletion(
  p_member_id uuid,
  p_organization_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
```

**Comportamento:**

1. Verifica se `auth.uid()` é `owner` da `p_organization_id`. Se não, levanta exceção com `errcode = '42501'`.
2. Busca o membro alvo. Se não existir na org, levanta exceção `'P0002'`.
3. Se membro alvo é `owner`, levanta exceção `'42501'` ("não pode excluir owner").
4. Calcula:
   - `active_leads`: count de `leads` com `responsavel_user_id = member.user_id` AND `funnel_stage_id NOT IN (won/lost)`
   - `closed_leads`: count de `leads` com `responsavel_user_id = member.user_id` AND `funnel_stage_id IN (won/lost)`
   - `teams_as_leader`: count de `teams` com `leader_id = member.user_id` AND `organization_id = p_organization_id`
   - `roulettes_in`: count de `lead_distribution_configs` com `member.user_id = ANY(eligible_agents)` AND `organization_id = p_organization_id`
   - `member_name`: `display_name` ou `email` ou `full_name` do profile.
5. Retorna jsonb único.

**Por que SECURITY DEFINER:** o owner precisa ler counts em tabelas que normalmente o RLS restringe; a função executa com permissão do dono da função (postgres). A checagem de `auth.uid() = owner` garante que apenas owners chamam.

### Componente 3 — Frontend `Colaboradores.tsx`

**Estado novo:**
```ts
const [deletePreview, setDeletePreview] = useState<{
  active_leads: number;
  closed_leads: number;
  teams_as_leader: number;
  roulettes_in: number;
  member_name: string;
} | null>(null);
const [previewLoading, setPreviewLoading] = useState(false);
```

**Handler reescrito (`handleDeleteColaborador`):**

```ts
const handleDeleteColaborador = async (colaborador) => {
  // ... checagens existentes (role, self-delete) ...
  setColaboradorToDelete(colaborador);
  setPreviewLoading(true);
  setDeleteDialogOpen(true); // abre com loading

  const { data, error } = await supabase.rpc(
    'preview_organization_member_deletion',
    { p_member_id: colaborador.id, p_organization_id: organizationId }
  );

  setPreviewLoading(false);
  if (error) {
    toast({ title: "Erro ao calcular impacto", description: error.message, variant: "destructive" });
    setDeleteDialogOpen(false);
    return;
  }
  setDeletePreview(data);
};
```

**Handler de confirmação reescrito (`confirmDeleteColaborador`):**

```ts
const confirmDeleteColaborador = async () => {
  if (!colaboradorToDelete) return;
  setIsMutating(true);
  try {
    const { data, error } = await supabase.functions.invoke(
      'delete-organization-member',
      { body: { member_id: colaboradorToDelete.id, organization_id: organizationId } }
    );
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    const s = data.summary;
    toast({
      title: "Colaborador removido",
      description: `${colaboradorToDelete.full_name || colaboradorToDelete.email} excluído. ${s.active_leads_unassigned} leads voltaram para a roleta.`
    });
    invalidateData();
    setDeleteDialogOpen(false);
    setColaboradorToDelete(null);
    setDeletePreview(null);
  } catch (err: any) {
    toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
  } finally {
    setIsMutating(false);
  }
};
```

**Dialog reescrito (estrutura, não JSX completo):**

- Title: `Excluir {member_name} da organização`
- Body:
  - Se `previewLoading`: spinner.
  - Se `deletePreview`: lista com bullets:
    - `**{active_leads} leads ativos** voltarão para a roleta automaticamente`
    - `**{closed_leads} leads fechados** ficarão sem responsável atribuído, mas o nome é preservado nos relatórios`
    - `Removida da liderança de **{teams_as_leader} equipe(s)**`
    - `Removida de **{roulettes_in} roleta(s)**`
    - `Acesso (e-mail e senha) **excluído permanentemente**`
- Footer: `[Cancelar]` `[Excluir definitivamente]` (destructive)

### Componente 4 — Patch em `auto-redistribute-leads` (Phase 2)

Em `supabase/functions/auto-redistribute-leads/index.ts` linha ~159, modificar a query do Phase 2:

**Antes:**
```ts
const { data: unassignedLeads } = await supabase
  .from('leads')
  .select('id')
  .eq('organization_id', orgId)
  .is('responsavel_user_id', null)
  .limit(UNASSIGNED_LIMIT);
```

**Depois:**
```ts
// Buscar IDs de stages won/lost da org
const { data: closedStages } = await supabase
  .from('funnel_stages')
  .select('id')
  .in('stage_type', ['won', 'lost']);
const closedStageIds = (closedStages || []).map(s => s.id);

// Buscar leads sem dono que NÃO estejam em won/lost
let query = supabase
  .from('leads')
  .select('id')
  .eq('organization_id', orgId)
  .is('responsavel_user_id', null)
  .limit(UNASSIGNED_LIMIT);
if (closedStageIds.length > 0) {
  query = query.not('funnel_stage_id', 'in', `(${closedStageIds.join(',')})`);
}
const { data: unassignedLeads } = await query;
```

**Mesmo patch** em `supabase/functions/redistribute-unassigned-leads/index.ts` (chamada manual) na query equivalente.

## Casos de borda

| Caso | Comportamento |
|---|---|
| Membro com `user_id = NULL` (convite pendente) | Pula passo 6 (auth.admin.deleteUser). Demais passos rodam — não há leads/equipes/roletas vinculados, contadores retornam 0. |
| Owner tenta excluir a si mesmo | Bloqueado no front (já existe) e na edge function (pré-condição 5). |
| Tenta excluir outro `owner` | Bloqueado (pré-condição 4). |
| Caller não é owner | RPC e edge function retornam 403. |
| Lead com `funnel_stage_id IS NULL` | Tratado como ativo (passo 4b). |
| Edge function falha após passo 5 mas antes do 6 | Vínculo removido, auth órfão. Idempotente: chamar de novo é seguro mas retorna 404. Fallback documentado: admin panel `admin_delete_user`. |
| Cron `auto-redistribute-leads` rodar logo após exclusão | Phase 2 distribui os leads ativos NULL para os agentes da roleta da org. Comportamento desejado. |
| Patch de Phase 2 + leads em won/lost com NULL | Filtrados na query — não são distribuídos. Texto `responsavel` preserva atribuição em relatórios. |

## Arquivos afetados

- **Novo:** `supabase/functions/delete-organization-member/index.ts`
- **Nova migration:** `supabase/migrations/YYYYMMDDHHMMSS_preview_member_deletion.sql`
- **Editado:** `src/pages/Colaboradores.tsx` (handlers + AlertDialog)
- **Editado:** `supabase/functions/auto-redistribute-leads/index.ts` (Phase 2 query)
- **Editado:** `supabase/functions/redistribute-unassigned-leads/index.ts` (query equivalente)

## Testes manuais (golden path)

1. **Setup:** Owner cria colaborador "Teste Maria", atribui 5 leads ativos e 2 leads em estágio `won`. Adiciona Maria a uma equipe como líder. Adiciona Maria em uma roleta.
2. **Exclusão:** Owner clica em excluir → dialog mostra "5 leads ativos, 2 leads fechados, líder de 1 equipe, em 1 roleta".
3. **Confirma:** Toast "Maria excluída. 5 leads voltaram para a roleta."
4. **Verificar:**
   - `auth.users` não tem mais o user_id da Maria (login com e-mail/senha falha).
   - 5 leads ativos: `responsavel_user_id IS NULL`, `responsavel IS NULL`.
   - 2 leads won: `responsavel_user_id IS NULL`, `responsavel = "Maria"` (texto preservado).
   - Equipe: `leader_id IS NULL`.
   - Roleta: array `eligible_agents` não contém o user_id.
5. **Aguardar cron** (1 min): leads ativos foram distribuídos a outros agentes da roleta.
6. **Verificar leads won:** continuam com `responsavel_user_id IS NULL` (não foram redistribuídos pelo cron).

## Fora de escopo

- Migrar comissões pendentes da Maria para outro agente (continuam vinculadas a `user_id` órfão; relatórios usam JOIN que retorna NULL — assumido aceitável).
- Recuperar acesso após hard-delete (não há undo — alinhado com escolha A).
- Reaproveitamento do e-mail: livre após hard-delete; owner pode cadastrar novo membro com mesmo e-mail.
- Notificação ao colaborador excluído (e-mail/Slack) — não solicitado.
