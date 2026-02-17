
# Corrigir Card de Permissão de Áudio e Visual do Menu

## Problemas Identificados

### 1. Card some após 5 segundos (comportamento errado)
O card desaparece porque a lógica atual marca as tarefas como "visualizadas" após 5 segundos na página `/tasks`, o que define `hasPendingTasks = false`, e o card depende dessa variável.

**Lógica atual incorreta:**
```
Usuário entra em /tasks
    ↓
Timer de 5s inicia
    ↓
markTasksAsViewed() é chamado
    ↓
hasPendingTasks = false
    ↓
Card some (porque depende de hasPendingTasks)
```

**O correto deveria ser:**
- O card de permissão de áudio deve permanecer **até o usuário ativar o som** OU **clicar no X para dispensar**
- A lógica de marcar tarefas como visualizadas NÃO deve afetar a exibição do card de permissão

### 2. Card muito grande
O card atual ocupa muito espaço vertical com texto longo e padding excessivo.

### 3. Menu sem fundo amarelo
O item "Tarefas" mostra apenas um ícone amarelo, mas não tem o fundo destacado.

## Solução

### A) Separar lógica do card de permissão da lógica de tarefas pendentes

O card `TaskPermissionAlert` deve ter sua própria lógica de visibilidade:
- Mostrar se: `needsAudioPermission = true` E usuário NÃO dispensou manualmente
- Esconder se: usuário clicou no X OU ativou o som com sucesso

A condição `hasPendingTasks` deve ser removida da lógica de exibição do card, pois:
- Se o usuário precisa ativar o som, ele precisa ver o card
- O fato de ter ou não tarefas pendentes é secundário para essa instrução

### B) Redesenhar o card para ser mais minimalista

Layout compacto em uma única linha:
```
[🔔 ícone] Ative as notificações para receber alertas de tarefas. [Ativar] [X]
```

Características:
- Padding reduzido (`py-2 px-3`)
- Tudo em uma linha com flexbox
- Sem título separado
- Texto curto e direto
- Botão pequeno inline
- X de fechar no final

### C) Adicionar fundo amarelo ao item Tarefas no menu

Quando há tarefas pendentes e o usuário precisa ativar o som, o item inteiro terá:
- Fundo amarelo com opacidade baixa (`bg-amber-400/10`)
- Mantém o ícone de aviso

## Mudanças nos Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/components/TaskPermissionAlert.tsx` | Redesenhar para layout compacto e remover dependência de `hasPendingTasks` |
| `src/components/AppSidebar.tsx` | Adicionar classe de fundo amarelo ao item Tarefas quando necessário |

## Código Proposto

### TaskPermissionAlert.tsx (novo design)

```tsx
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskAlert } from "@/contexts/TaskAlertContext";
import { useState } from "react";

export function TaskPermissionAlert() {
  const { needsAudioPermission, requestAudioPermission } = useTaskAlert();
  const [dismissed, setDismissed] = useState(false);

  // Mostrar apenas se precisa de permissão e não foi dispensado
  // NÃO depende de hasPendingTasks
  if (!needsAudioPermission || dismissed) {
    return null;
  }

  const handleActivate = async () => {
    await requestAudioPermission();
  };

  return (
    <div className="mb-3 py-2 px-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md flex items-center gap-2">
      <Bell className="h-4 w-4 text-amber-500 flex-shrink-0" />
      <span className="text-sm text-amber-700 dark:text-amber-300 flex-1">
        Ative o som para receber alertas de tarefas
      </span>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-7 px-2 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-800/40"
        onClick={handleActivate}
      >
        Ativar
      </Button>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 p-1"
        aria-label="Fechar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

### AppSidebar.tsx (fundo amarelo no item)

No mapeamento de `bottomItems`, adicionar classe de fundo ao NavLink quando necessário:

```tsx
{bottomItems.map((item) => {
  const isTasksItem = item.url === '/tasks';
  const showTaskIndicator = isTasksItem && hasPendingTasks;
  const showWarningIndicator = isTasksItem && hasPendingTasks && needsAudioPermission;
  
  // Classe de fundo amarelo quando há aviso
  const warningBgClass = showWarningIndicator ? "bg-amber-400/10" : "";
  
  return (
    <SidebarMenuItem key={item.title} className="relative">
      <SidebarMenuButton asChild>
        <NavLink
          to={item.url}
          className={cn(
            hoverClass, 
            warningBgClass,
            "text-sidebar-foreground text-base px-3 py-2.5 relative"
          )}
          activeClassName={cn(activeClass, "text-sidebar-primary font-semibold")}
        >
          {/* ... resto do conteúdo */}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
})}
```

## Visual Antes vs Depois

### Card de Permissão

**ANTES:**
```
┌──────────────────────────────────────────────────────────────────┐
│ 🔊  Ative as notificações sonoras                           [X] │
│                                                                  │
│     Você tem 2 tarefas atribuídas a você. Clique no botão       │
│     abaixo para ativar o som de notificação.                    │
│                                                                  │
│     ┌─────────────────────────────────┐                         │
│     │  🔔 Ativar som de notificação   │                         │
│     └─────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────────┘
```

**DEPOIS:**
```
┌──────────────────────────────────────────────────────────────────┐
│ 🔔 Ative o som para receber alertas de tarefas    [Ativar] [X] │
└──────────────────────────────────────────────────────────────────┘
```

### Menu Tarefas (quando há aviso)

**ANTES:**
```
│ ✓ Tarefas                    ⚠️│
```

**DEPOIS:**
```
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  ← fundo amarelo/10
│ ✓ Tarefas                    ⚠️│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
```

## Comportamento Corrigido

| Cenário | Card de Permissão |
|---------|-------------------|
| Usuário precisa ativar som | Aparece |
| Usuário fica 5s em /tasks | Continua aparecendo (tarefas são marcadas como vistas, mas card permanece) |
| Usuário clica em "Ativar" | Some (som ativado) |
| Usuário clica no X | Some (dispensado manualmente) |
| Som já ativado anteriormente | Não aparece |

## Seção Técnica

### Por que o card sumia após 5 segundos?

A condição no `TaskPermissionAlert.tsx` era:
```tsx
if (!needsAudioPermission || dismissed || !hasPendingTasks) {
  return null;
}
```

E no `TaskAlertContext.tsx`:
```tsx
// Linha 224-227: Após 5s na página de tarefas
if (isOnTasksPage && hasPendingTasks) {
  viewTimerRef.current = setTimeout(() => {
    markTasksAsViewed(); // Define hasPendingTasks = false
  }, 5000);
}
```

Quando `hasPendingTasks` vira `false`, o card some por causa da condição `!hasPendingTasks`.

### Correção

Remover a dependência de `hasPendingTasks` da exibição do card:
```tsx
// ANTES
if (!needsAudioPermission || dismissed || !hasPendingTasks) { ... }

// DEPOIS
if (!needsAudioPermission || dismissed) { ... }
```

Assim o card só some quando:
1. `needsAudioPermission` vira `false` (som ativado)
2. `dismissed` vira `true` (usuário clicou no X)
