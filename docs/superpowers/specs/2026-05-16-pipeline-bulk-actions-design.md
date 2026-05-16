# Spec — Ações em massa na visão Lista do Pipeline

**Data:** 2026-05-16
**Stakeholder:** Hurtz (owner)
**Tipo:** Feature — bulk operations no list view

## Problema

A visão Lista do Pipeline ([src/pages/Pipeline.tsx:1971-2186](../../../src/pages/Pipeline.tsx#L1971-L2186)) já tem seleção múltipla com checkboxes (state `selectedLeadIds`), mas a barra de seleção só mostra "Limpar seleção" — nenhuma ação aplicável aos leads selecionados. Operações em massa (atribuir, mover, excluir, anotar) hoje exigem repetir a ação 1-a-1 em cada lead.

## Resultado esperado

Quando há leads selecionados na visão Lista, a barra de seleção ganha **5 ações**:

| Ação | Quem vê | Comportamento |
|---|---|---|
| **Selecionar por etapa** | Todos | Dropdown com etapas do funil atual; clicar marca todos os leads visíveis daquela etapa |
| **Mover etapa** | `canMoveLeadsPipeline` | Dialog com etapas do funil → UPDATE em massa de `funnel_stage_id` + `stage` |
| **Atribuir colaborador** | `canAssignLeads` | Dialog com colaboradores ativos → UPDATE em massa de `responsavel_user_id` (sobrescreve mesmo se já houver) |
| **Adicionar nota** | Todos com acesso ao lead | Dialog com textarea → INSERT 1 linha em `lead_activities` por lead (mesma `content`, `activity_type='note'`) |
| **Excluir** | `canDeleteLeads` | Confirm dialog "Excluir N leads?" → DELETE em massa |

Após qualquer ação bem-sucedida: toast com contagem, limpa seleção, atualiza estado local.

## Decisões tomadas durante o brainstorming

| Pergunta | Escolha |
|---|---|
| Escopo? | 5 ações (3 originais + filtro por etapa + nota em massa) |
| Permissões? | Espelhar permissões existentes (`canMoveLeadsPipeline`, `canAssignLeads`, `canDeleteLeads`); nota em massa fica aberta a quem vê o lead |
| Confirmação de exclusão? | Dialog simples "Excluir N leads?" (sem type-to-confirm) |
| Lista de colaboradores no Atribuir? | Apenas membros ativos (`is_active=true`) da organização |
| Atribuir sobrescreve responsável existente? | **Sim** — mesmo se o lead já tem responsável, é trocado pelo novo |
| Move para won/lost dispara confirmação? | Não — comportamento neutro como qualquer etapa (diferente do drag-and-drop) |
| Logar bulk em `lead_activities`? | Sim para "Adicionar nota" (é o próprio uso). Não para mover/atribuir/excluir (consistente com a versão 1-a-1) |
| Cap de leads por operação? | Sem cap rígido — Postgres aguenta milhares em uma só request |

## Arquitetura

### Componentes

| Arquivo | Estado | Responsabilidade |
|---|---|---|
| `src/components/BulkAssignDialog.tsx` | **Existe** (reaproveitar) | Dropdown de colaboradores, confirm |
| `src/components/BulkMoveStageDialog.tsx` | **Novo** | Dropdown de etapas do funil atual, confirm |
| `src/components/BulkAddNoteDialog.tsx` | **Novo** | Textarea com nota, confirm |
| `src/components/BulkDeleteDialog.tsx` | **Novo** | Confirm simples |
| `src/pages/Pipeline.tsx` | **Editar** | 5 handlers, 4 states de dialog, importar/renderizar dialogs, adicionar botões na barra |

**Por que dialogs separados:** Pipeline.tsx já tem 2642 linhas. Cada dialog em seu componente mantém Pipeline focado em orquestração e os dialogs testáveis isoladamente.

### Layout da barra de seleção (Desktop)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 4 leads selecionados  [Selecionar etapa ▾] [Mover etapa] [Atribuir] [Nota] [Excluir] [Limpar] │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Selecionar etapa** (DropdownMenu): lista as etapas do funil atual; clicar adiciona à seleção todos os leads visíveis daquela etapa.
- **Mover etapa**: `variant="outline"`, ícone `ArrowRight`.
- **Atribuir**: `variant="outline"`, ícone `UserCog`.
- **Nota**: `variant="outline"`, ícone `MessageSquarePlus`.
- **Excluir**: `variant="destructive"`, ícone `Trash2`.
- **Limpar seleção**: `variant="ghost"`, sempre presente à direita.

Cada botão de ação só renderiza se a permissão correspondente for `true`. "Selecionar etapa", "Nota" e "Limpar" sempre aparecem.

### Layout mobile

Mesma estrutura, ícone-only (sem texto) para caber em telas estreitas. Ordem mantida. `size="sm"`.

### Handlers em Pipeline.tsx

Todos seguem o padrão atual do `confirmDeleteLead` (linha 1428): try/catch, toast, optimistic update, clear selection.

```ts
// 1. Selecionar por etapa (síncrono, só altera state)
const handleSelectByStage = (stageId: string) => {
  const ids = filteredLeads
    .filter(l => (l.funnel_stage_id || l.stage) === stageId)
    .map(l => l.id);
  setSelectedLeadIds(prev => new Set([...prev, ...ids]));
};

// 2. Mover etapa
const handleBulkMoveStage = async (stageId: string) => {
  const ids = Array.from(selectedLeadIds);
  const { error } = await supabase.from('leads')
    .update({ funnel_stage_id: stageId, stage: stageId }).in('id', ids);
  if (error) { toast.error('Erro ao mover leads'); return; }
  setLeads(prev => prev.map(l => selectedLeadIds.has(l.id)
    ? { ...l, funnel_stage_id: stageId, stage: stageId } : l));
  toast.success(`${ids.length} lead(s) movido(s)`);
  setSelectedLeadIds(new Set());
};

// 3. Atribuir (sobrescreve)
const handleBulkAssign = async (userId: string) => {
  const ids = Array.from(selectedLeadIds);
  const { error } = await supabase.from('leads')
    .update({ responsavel_user_id: userId, responsavel: null }).in('id', ids);
  // trigger sync_responsavel_user_id preenche o campo texto a partir do user_id
  if (error) { toast.error('Erro ao atribuir leads'); return; }
  toast.success(`${ids.length} lead(s) atribuído(s)`);
  setSelectedLeadIds(new Set());
  invalidateData();
};

// 4. Adicionar nota
const handleBulkAddNote = async (content: string) => {
  const ids = Array.from(selectedLeadIds);
  const rows = ids.map(lead_id => ({
    lead_id, user_id: currentUserId, activity_type: 'note', content
  }));
  const { error } = await supabase.from('lead_activities').insert(rows);
  if (error) { toast.error('Erro ao adicionar nota'); return; }
  toast.success(`Nota adicionada em ${ids.length} lead(s)`);
  setSelectedLeadIds(new Set());
};

// 5. Excluir
const handleBulkDelete = async () => {
  const ids = Array.from(selectedLeadIds);
  const { error } = await supabase.from('leads').delete().in('id', ids);
  if (error) { toast.error('Erro ao excluir leads'); return; }
  setLeads(prev => prev.filter(l => !selectedLeadIds.has(l.id)));
  toast.success(`${ids.length} lead(s) excluído(s)`);
  setSelectedLeadIds(new Set());
};
```

### Notas técnicas

- **Realtime:** já assinado em `leads` (linha ~426) — outros usuários veem o update naturalmente.
- **Activity log para mover/atribuir/excluir:** não logamos (consistente com a versão 1-a-1).
- **Atomicidade:** Postgres roda cada request como transação implícita — ou tudo passa ou nada.
- **`responsavel` (texto) no Atribuir:** zerado no UPDATE; o trigger `sync_responsavel_user_id` o repopula a partir do `responsavel_user_id` (já existe em produção).

## Casos de borda

| Caso | Comportamento |
|---|---|
| Usuário seleciona 0 leads | Barra não aparece. |
| "Selecionar por etapa" com a etapa sem leads visíveis | Seleção não muda; toast informativo opcional. |
| "Selecionar por etapa" adiciona à seleção atual (não substitui) | Sim — permite combinar múltiplas etapas. |
| Mover para a mesma etapa atual | UPDATE roda mesmo assim (no-op no banco). Sem tratamento especial. |
| Atribuir lead que já tem o mesmo responsável | UPDATE roda mesmo assim (no-op). |
| Mover para won/lost | Trata como qualquer etapa — não dispara o dialog de confirmação de venda. |
| Lead deletado em outra aba enquanto está selecionado | `.in('id', ids)` ignora IDs inexistentes — não falha. |
| Nota vazia | Botão "Salvar" desabilitado se `content.trim() === ''`. |
| Permissão removida mid-session | Botão some no próximo render; dialog aberto fica órfão (fecha sem submit no F5). Aceitável. |
| Usuário sem nenhuma das permissões de write | Vê só "Selecionar etapa" + "Nota" + "Limpar". |
| Mover etapa em leads de funis diferentes (não acontece hoje porque filteredLeads é por funil) | Bloqueado implicitamente — só etapas do funil atual aparecem no dialog. |

## Arquivos afetados

- **Novo:** `src/components/BulkMoveStageDialog.tsx`
- **Novo:** `src/components/BulkAddNoteDialog.tsx`
- **Novo:** `src/components/BulkDeleteDialog.tsx`
- **Editado:** `src/components/BulkAssignDialog.tsx` (mínimo, se necessário — interface atual já serve)
- **Editado:** `src/pages/Pipeline.tsx` (5 handlers + 4 states + import + JSX da barra + render dos 4 dialogs)

## Testes manuais (golden path)

1. **Setup:** owner com ≥10 leads no funil padrão, distribuídos em ≥3 etapas, ≥2 colaboradores ativos na org.
2. **Selecionar por etapa:** abre dropdown, escolhe "Qualificado" → todos os leads visíveis dessa etapa ficam marcados.
3. **Mover etapa:** com seleção ativa, clica "Mover etapa" → escolhe outra etapa → toast "N movidos" + leads aparecem na nova etapa ao trocar pra visão funil.
4. **Atribuir:** seleciona outros leads, "Atribuir" → escolhe colaborador → toast + coluna "Responsável" atualiza.
5. **Adicionar nota:** seleciona leads, "Nota" → digita "Follow-up amanhã" → confirma → toast + abrir 1 dos leads mostra a nota nova com seu nome.
6. **Excluir:** seleciona 3 leads de teste, "Excluir" → confirm → toast "3 excluídos" + leads somem da lista.

## Fora de escopo

- Tags em massa (já estava fora do escopo original).
- Exportar selecionados (idem).
- Mover entre **funis** diferentes (apenas entre etapas do funil atual).
- Anexos em massa (nota sem `attachment_url`).
- Undo da exclusão em massa — destrutivo, sem soft-delete.
- Confirmação de venda (won) ao mover em massa — feature do drag-and-drop não se aplica aqui.
