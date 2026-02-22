
# Correcoes: Despesas, Sons de Notificacao e Erro de Consulta

## Problema 1: Botao "+" de despesas nao funciona

**Causa raiz**: A funcao `handleAddExpense` faz validacao silenciosa na linha 130:
```typescript
if (!newExpense.description || !newExpense.amount || !organizationId) return;
```
Quando o usuario nao preenche a descricao (campo vazio, mostrando apenas o placeholder), a funcao retorna sem feedback. O usuario nao sabe por que nada acontece.

### Correcao em `src/components/ProductionBlockDetailModal.tsx`:
- Substituir o `return` silencioso por toasts informativos:
```typescript
const handleAddExpense = async () => {
  if (!newExpense.description) {
    toast({ title: "Preencha a descricao", variant: "destructive" });
    return;
  }
  if (!newExpense.amount || parseFloat(newExpense.amount) <= 0) {
    toast({ title: "Informe um valor valido", variant: "destructive" });
    return;
  }
  if (!organizationId) return;
  // ... resto da logica
};
```

---

## Problema 2: Sons de notificacao ignoram configuracao do usuario

Existem 3 fontes de som no sistema que precisam respeitar as configuracoes:

### 2a. Button click sound (`src/components/ui/button.tsx`)
**Status**: Funciona corretamente via `localStorage.getItem('buttonClickSoundEnabled')`. Quando o usuario desativa em Configuracoes, o localStorage e atualizado e todos os botoes param de emitir som.

### 2b. Task alert sound (`src/contexts/TaskAlertContext.tsx`)
**Problema**: O loop de som a cada 5 segundos (linhas 168-200) NAO consulta o `notification_sound_enabled` do perfil do usuario. Ele tem seu proprio sistema de permissao de audio independente. Mesmo que o usuario desative o som de notificacao nas Configuracoes, o alerta de tarefa continua tocando.

**Correcao**: Adicionar consulta ao perfil do usuario no TaskAlertContext e respeitar `notification_sound_enabled`:
- Ao carregar, buscar `notification_sound_enabled` do perfil
- Na condicao do useEffect do som (linha 178), adicionar `&& notificationSoundEnabled`
- Escutar mudancas em realtime na tabela profiles para atualizar dinamicamente

### 2c. Chat notification sound (`src/pages/Chat.tsx`)
**Status**: Funciona corretamente - ja consulta `notification_sound_enabled` do perfil (linhas 475-501).

### Arquivo: `src/contexts/TaskAlertContext.tsx`
- Adicionar state `notificationSoundEnabled` 
- No useEffect inicial, buscar perfil do usuario e ler `notification_sound_enabled`
- Condicionar o loop de som (linha 178) a `notificationSoundEnabled`

---

## Problema 3 (bonus): Erro no console - useMemberTasks

O console mostra erro PGRST201: ambiguidade entre `kanban_cards` e `kanban_columns` (duas FK: `column_id` e `timer_start_column_id`).

### Correcao em `src/hooks/useMemberTasks.ts`:
Linha 53: Trocar `kanban_columns (` por `kanban_columns!kanban_cards_column_id_fkey (` para desambiguar a relacao.

---

## Resumo

| Problema | Arquivo | Correcao |
|----------|---------|---------|
| Despesa nao adiciona | ProductionBlockDetailModal.tsx | Toast de validacao |
| Task alert ignora config | TaskAlertContext.tsx | Consultar notification_sound_enabled |
| useMemberTasks erro | useMemberTasks.ts | Desambiguar FK |
