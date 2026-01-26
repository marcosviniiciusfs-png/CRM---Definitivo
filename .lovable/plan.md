
# Plano: Correção de Bugs Críticos no Kanban

## Problemas Identificados

### 1. Bloqueio de Movimento Retroativo Falha (+ Move TODAS as tarefas)

**Causa Raiz:**
O `handleDragOver` está atualizando o state `setColumns()` ANTES da validação completa no `handleDragEnd`. O problema é:

1. Usuário arrasta card para etapa anterior
2. `handleDragOver` valida e retorna early se `block_backward_movement` (linha 719-727) - **MAS o dnd-kit já fez o "swap" visual**
3. Na segunda tentativa, o React está em estado inconsistente
4. O `handleDragOver` atualiza `setColumns()` na linha 729-739, **afetando TODAS as tarefas porque está sobrescrevendo todo o array de colunas**

O bug está aqui (linhas 729-739):
```typescript
const newColumns = columns.map(col => {
  if (col.id === sourceColumn.id) {
    return { ...col, cards: col.cards.filter(c => c.id !== activeCardId) };
  }
  if (col.id === targetColumn.id) {
    return { ...col, cards: [...col.cards, card] };
  }
  return col;
});
setColumns(newColumns); // PROBLEMÁTICO: atualiza state durante drag!
```

**Problema:** O `handleDragOver` está sendo chamado MÚLTIPLAS vezes durante o drag, e cada vez está manipulando o state. Quando o bloqueio falha, as atualizações anteriores já modificaram o estado de forma incorreta.

**Solução:**
1. **Remover a atualização de state do `handleDragOver`** - o dnd-kit já cuida do feedback visual
2. Mover TODA a lógica de atualização para o `handleDragEnd`
3. O `handleDragOver` deve apenas validar e mostrar toasts de bloqueio, sem modificar state

---

### 2. Cronômetro Não Ativa Imediatamente

**Causa Raiz:**
Quando o card é movido para a coluna de início do timer:

1. O banco de dados é atualizado com `timer_started_at` (linhas 851-857) ✅
2. O state local é atualizado (linhas 865-877)
3. **MAS** o card no state mantém o `timer_started_at` antigo porque a linha 872 só atualiza se `updateData.timer_started_at` existir

O problema está aqui:
```typescript
const updatedCard = { 
  ...card, 
  timer_started_at: updateData.timer_started_at || card.timer_started_at // ⚠️ card.timer_started_at ainda é undefined
};
```

Além disso, o `KanbanCard` usa `useCardTimer` que depende de:
- `isTimerActive` calculado como `card.estimated_time && !card.due_date`
- `timerStartedAt` que vem do card local

Se o card local não for atualizado, o timer não exibe.

**Solução:**
1. Garantir que `timer_started_at` é corretamente propagado no state local
2. Forçar re-render do card após atualização do timer
3. Considerar invalidar queries e recarregar dados para garantir sincronização

---

### 3. Auto-Delete de Tarefas Não Implementado

**Causa Raiz:**
A configuração `auto_delete_enabled` e `auto_delete_hours` existe no banco de dados e pode ser configurada via UI, mas **não existe nenhuma lógica que execute a exclusão automática**.

Não há:
- Nenhum cron job ou Edge Function para deletar cards antigos
- Nenhuma lógica client-side que verifique periodicamente
- Nenhum database trigger que monitore isso

**Solução:**
Implementar uma Edge Function (ou usar pg_cron no banco) que:
1. Roda periodicamente (a cada hora)
2. Busca colunas com `auto_delete_enabled = true`
3. Deleta cards nessas colunas onde `created_at + auto_delete_hours < now()`

---

## Soluções Detalhadas

### Correção 1: Refatorar handleDragOver e handleDragEnd

**Arquivo:** `src/components/KanbanBoard.tsx`

**Mudanças no `handleDragOver` (linhas 655-740):**
```typescript
const handleDragOver = async (event: DragOverEvent) => {
  const { active, over } = event;
  if (!over) return;

  const activeCardId = active.id as string;
  const overContainerId = over.id as string;

  const sourceColumn = columns.find(col => col.cards.some(card => card.id === activeCardId));
  if (!sourceColumn) return;

  let targetColumn = columns.find(col => col.id === overContainerId);
  if (!targetColumn) {
    targetColumn = columns.find(col => col.cards.some(card => card.id === overContainerId));
  }

  if (!targetColumn || sourceColumn.id === targetColumn.id) return;

  // APENAS validações - SEM modificar state
  // Validação de bloqueio reverso
  if (sourceColumn.block_backward_movement) {
    const sourcePos = columns.findIndex(c => c.id === sourceColumn.id);
    const targetPos = columns.findIndex(c => c.id === targetColumn.id);
    
    if (targetPos < sourcePos) {
      // Bloquear - NÃO mostrar toast aqui para evitar spam (mostrar só no handleDragEnd)
      return;
    }
  }

  // Validação de tarefa colaborativa - igual, apenas validar sem modificar state
  // (deixar handleDragEnd fazer as queries e mostrar toasts)
};
```

**Mudanças no `handleDragEnd`:**
- Manter a lógica de validação com queries ao banco
- Sempre recarregar colunas após bloqueio para garantir state consistente
- Atualizar corretamente o `timer_started_at` no state local

---

### Correção 2: Timer Atualizar Imediatamente

**Arquivo:** `src/components/KanbanBoard.tsx`

Corrigir a atualização do state local após mover o card:

```typescript
// Atualizar no banco se mudou de coluna
if (sourceColumn.id !== targetColumn.id) {
  const updateData: any = { column_id: targetColumn.id };
  
  // Verificar se deve iniciar o timer ao entrar nesta coluna
  if (card.timer_start_column_id === targetColumn.id && !card.timer_started_at && card.estimated_time && !card.due_date) {
    updateData.timer_started_at = new Date().toISOString();
    toast({
      title: "⏱️ Cronômetro Iniciado",
      description: `Timer da tarefa "${card.content}" começou a contar!`,
    });
  }
  
  await supabase
    .from("kanban_cards")
    .update(updateData)
    .eq("id", activeCardId);
  
  // CORRIGIDO: Atualizar state com timer_started_at correto
  setColumns(prevColumns => prevColumns.map(col => {
    if (col.id === sourceColumn.id) {
      return { ...col, cards: col.cards.filter(c => c.id !== activeCardId) };
    }
    if (col.id === targetColumn.id) {
      const updatedCard: Card = { 
        ...card, 
        column_id: targetColumn.id,
        timer_started_at: updateData.timer_started_at ?? card.timer_started_at,
      };
      return { ...col, cards: [...col.cards, updatedCard] };
    }
    return col;
  }));
}
```

---

### Correção 3: Implementar Auto-Delete

**Nova Edge Function:** `supabase/functions/cleanup-kanban-cards/index.ts`

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Buscar colunas com auto-delete habilitado
    const { data: columns, error: colError } = await supabaseAdmin
      .from('kanban_columns')
      .select('id, auto_delete_hours')
      .eq('auto_delete_enabled', true)
      .not('auto_delete_hours', 'is', null)

    if (colError) throw colError

    let totalDeleted = 0

    for (const column of columns || []) {
      // Calcular threshold time
      const hoursAgo = new Date()
      hoursAgo.setHours(hoursAgo.getHours() - (column.auto_delete_hours || 72))

      // Deletar cards antigos
      const { data: deleted, error: delError } = await supabaseAdmin
        .from('kanban_cards')
        .delete()
        .eq('column_id', column.id)
        .lt('created_at', hoursAgo.toISOString())
        .select('id')

      if (!delError && deleted) {
        totalDeleted += deleted.length
      }
    }

    return new Response(
      JSON.stringify({ success: true, deleted: totalDeleted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

Esta Edge Function pode ser chamada manualmente ou configurada como cron job via Supabase Dashboard.

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/KanbanBoard.tsx` | Refatorar `handleDragOver` para não modificar state; Corrigir `handleDragEnd` para atualizar timer corretamente e bloquear movimento consistentemente |
| `supabase/functions/cleanup-kanban-cards/index.ts` | **Nova Edge Function** para exclusão automática de cards |

---

## Resumo das Correções

1. **Bloqueio Retroativo:**
   - Remover `setColumns()` do `handleDragOver` 
   - Manter apenas validação no `handleDragEnd`
   - Sempre recarregar colunas via `loadColumns()` após qualquer bloqueio

2. **Timer Imediato:**
   - Usar spread operator corretamente ao atualizar card
   - Garantir que `timer_started_at` seja propagado para o state local
   - Considerar também condição `!card.due_date` na verificação

3. **Auto-Delete:**
   - Criar Edge Function `cleanup-kanban-cards`
   - Configurar para rodar periodicamente

---

## Checklist de Validação

Após implementação:

1. **Bloqueio Retroativo:**
   - [ ] Arrastar card de "Fazendo" para "A Fazer" é bloqueado
   - [ ] Toast aparece uma vez com mensagem clara
   - [ ] Apenas o card arrastado é afetado, não todos
   - [ ] Após várias tentativas, o bloqueio continua funcionando

2. **Timer:**
   - [ ] Mover card para etapa de início do timer ativa imediatamente
   - [ ] Timer exibe "Xh Ym restante" em tempo real
   - [ ] Toast "Cronômetro Iniciado" aparece

3. **Auto-Delete:**
   - [ ] Edge Function deleta cards corretamente
   - [ ] Apenas cards mais antigos que `auto_delete_hours` são deletados
   - [ ] Cards em colunas sem `auto_delete_enabled` não são afetados
