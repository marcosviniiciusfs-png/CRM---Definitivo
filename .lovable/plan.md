
# Plano: Adicionar Gestão de Responsáveis na Edição de Tarefas do Kanban

## Problema Atual

Quando um administrador ou usuário com permissão edita uma tarefa existente no quadro Kanban (clicando no card e entrando no modo de edição), **não é possível adicionar ou remover colaboradores**. O formulário de edição atual só permite modificar:
- Título
- Descrição  
- Prazo Final
- Tempo estimado
- Cor

A funcionalidade de selecionar responsáveis existe apenas no modal de **criação** (`CreateTaskModal`), mas não foi implementada no modo de **edição** do `KanbanCard`.

---

## Solução Proposta

Adicionar um seletor de responsáveis no formulário de edição do `KanbanCard`, permitindo adicionar e remover membros atribuídos à tarefa. Isso requer alterações em:

1. **KanbanCard.tsx** - Adicionar o componente `MultiSelectUsers` no formulário de edição
2. **KanbanBoard.tsx** - Atualizar a função `updateCard` para sincronizar os assignees no banco de dados
3. **Lógica de sincronização** - Implementar a lógica para:
   - Inserir novos assignees (membros adicionados)
   - Remover assignees existentes (membros removidos)
   - Manter assignees que já confirmaram conclusão (para tarefas colaborativas)

---

## Detalhes Técnicos

### 1. Modificações no KanbanCard.tsx

**Adicionar:**
- Import do componente `MultiSelectUsers`
- Estado local para rastrear assignees durante edição: `const [editAssignees, setEditAssignees] = useState<string[]>([])`
- Carregamento inicial dos assignees atuais quando entrar no modo de edição
- Campo de seleção `MultiSelectUsers` no formulário de edição
- Passar os assignees atualizados no callback `onEdit`

**Interface atualizada:**
```typescript
interface KanbanCardProps {
  // ... existentes
  onEdit: (id: string, updates: Partial<Card> & { assignees?: string[] }, oldDescription?: string) => void;
  orgMembers?: UserOption[]; // Lista de membros disponíveis para atribuição
}
```

### 2. Modificações no KanbanBoard.tsx

**A) Passar `orgMembers` para cada KanbanCard:**
- Carregar os membros da organização uma vez
- Passar a lista para os componentes KanbanColumn e KanbanCard

**B) Atualizar a função `updateCard`:**
```typescript
const updateCard = async (
  columnId: string,
  cardId: string,
  updates: Partial<Card> & { assignees?: string[] },
  oldDescription?: string
) => {
  // ... lógica existente para atualizar campos do card

  // NOVA LÓGICA: Sincronizar assignees
  if (updates.assignees !== undefined) {
    const { data: currentAssignees } = await supabase
      .from("kanban_card_assignees")
      .select("id, user_id, is_completed")
      .eq("card_id", cardId);

    const currentIds = currentAssignees?.map(a => a.user_id) || [];
    const newIds = updates.assignees;

    // Identificar adições e remoções
    const toAdd = newIds.filter(id => !currentIds.includes(id));
    const toRemove = currentAssignees?.filter(a => 
      !newIds.includes(a.user_id) && !a.is_completed // Não remover quem já confirmou
    ) || [];

    // Inserir novos
    if (toAdd.length > 0) {
      await supabase.from("kanban_card_assignees").insert(
        toAdd.map(userId => ({
          card_id: cardId,
          user_id: userId,
          assigned_by: currentUserId,
        }))
      );
      // Criar notificações para novos atribuídos
    }

    // Remover os que foram desmarcados (exceto quem já confirmou)
    if (toRemove.length > 0) {
      await supabase.from("kanban_card_assignees")
        .delete()
        .in("id", toRemove.map(a => a.id));
    }
  }
};
```

### 3. Regras de Negócio para Tarefas Colaborativas

Para tarefas colaborativas (`is_collaborative = true`), aplicar regras especiais:
- **Não permitir remover** membros que já confirmaram conclusão (`is_completed = true`)
- **Exibir indicador visual** próximo ao nome do membro que já confirmou
- **Mínimo de 2 colaboradores** deve ser mantido para tarefas colaborativas

---

## Fluxo de Usuário Esperado (Após Implementação)

```
┌─────────────────────────────────────────────────────────────┐
│ Usuário clica no card "Verificar Saldo" para editar         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Formulário de edição expandido mostra:                      │
│ • Título                                                    │
│ • Descrição                                                 │
│ • Prazo Final | Tempo (min)                                 │
│ • Cor                                                       │
│ • ★ Responsáveis [MultiSelectUsers com membros atuais]     │
│   └── [Mateus ✓] [Marcos] [+ Adicionar]                     │
└─────────────────────────────────────────────────────────────┘
                            │
           Usuário adiciona "João" e remove "Marcos"
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Usuário clica "Salvar"                                      │
│ → updateCard() sincroniza assignees:                        │
│   • INSERT João em kanban_card_assignees                    │
│   • DELETE Marcos de kanban_card_assignees                  │
│   • Notificação enviada para João                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ RESULTADO:                                                  │
│ • Avatar group atualizado no card                           │
│ • João recebe notificação "Você foi atribuído..."           │
│ • Marcos deixa de ver a tarefa como sua                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/KanbanCard.tsx` | Adicionar `MultiSelectUsers` no formulário de edição; carregar assignees atuais; incluir assignees no callback `onEdit` |
| `src/components/KanbanColumn.tsx` | Repassar `orgMembers` para cada `KanbanCard` |
| `src/components/KanbanBoard.tsx` | Carregar `orgMembers` uma vez; atualizar `updateCard` para sincronizar assignees; invalidar cache |

---

## Considerações de UX

1. **Para tarefas normais:** O seletor funciona sem restrições - adicionar/remover livremente
2. **Para tarefas colaborativas:** 
   - Membros que já confirmaram aparecem com badge "Concluído" e não podem ser removidos
   - Mínimo de 2 membros precisa ser mantido
3. **Notificações:** 
   - Novos atribuídos recebem notificação "Você foi atribuído à tarefa..."
   - Removidos não recebem notificação (evitar spam)

---

## Validação

Após implementação:

1. **Tarefa Normal:**
   - [ ] Editar tarefa normal → campo de responsáveis aparece
   - [ ] Adicionar novo membro → salvar → avatar aparece no card
   - [ ] Remover membro → salvar → avatar desaparece

2. **Tarefa Colaborativa:**
   - [ ] Editar tarefa colaborativa → campo aparece com colaboradores atuais
   - [ ] Membros com "Concluído" não podem ser removidos
   - [ ] Não pode reduzir para menos de 2 colaboradores
   - [ ] Adicionar novo colaborador → ele entra como "Pendente"

3. **Notificações:**
   - [ ] Membro adicionado recebe notificação
   - [ ] Query `card-assignees` é invalidada após salvar
