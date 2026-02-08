
# Sistema de Alerta Sonoro para Tarefas Atribuídas

## Visão Geral

O objetivo é criar um sistema robusto de notificações sonoras que alerta colaboradores quando uma tarefa é atribuída a eles. O som tocará a cada 5 segundos até que o colaborador acesse a página Tarefas e permaneça nela por pelo menos 5 segundos.

## Componentes do Sistema

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE NOTIFICAÇÃO                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Tarefa criada com assignees                                 │
│           ↓                                                     │
│  2. Notificação 'task_assigned' salva no banco                  │
│           ↓                                                     │
│  3. TaskAlertProvider detecta via realtime/polling              │
│           ↓                                                     │
│  4. Se permissão audio OK → Som a cada 5s                       │
│     Se permissão NEGADA → Ícone amarelo pulsante na sidebar     │
│           ↓                                                     │
│  5. Usuário acessa /tasks e permanece 5s                        │
│           ↓                                                     │
│  6. Notificações marcadas como vistas → Som para                │
└─────────────────────────────────────────────────────────────────┘
```

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `public/task-notification.mp3` | CRIAR | Copiar arquivo de áudio enviado pelo usuário |
| `src/contexts/TaskAlertContext.tsx` | CRIAR | Context global para gerenciar alertas de tarefas |
| `src/pages/Tasks.tsx` | MODIFICAR | Integrar lógica de "visualizado" e card de permissão |
| `src/components/AppSidebar.tsx` | MODIFICAR | Adicionar indicador amarelo pulsante no link "Tarefas" |
| `src/components/TaskPermissionAlert.tsx` | CRIAR | Card explicativo para ativar permissão de som |
| `src/App.tsx` | MODIFICAR | Envolver app com TaskAlertProvider |

## Implementação Detalhada

### 1. TaskAlertContext - Gerenciador Central

Este contexto será responsável por:
- Verificar se há tarefas pendentes não visualizadas para o usuário atual
- Gerenciar o estado de permissão de áudio do navegador
- Controlar o loop de som a cada 5 segundos
- Marcar tarefas como visualizadas quando o usuário permanece 5s em /tasks

```typescript
// src/contexts/TaskAlertContext.tsx
interface TaskAlertContextType {
  hasPendingTasks: boolean;          // Há tarefas não visualizadas?
  audioPermissionGranted: boolean;   // Navegador permite tocar som?
  needsAudioPermission: boolean;     // Usuário tem tarefa mas não deu permissão?
  markTasksAsViewed: () => void;     // Marca todas como visualizadas
  requestAudioPermission: () => void; // Solicita permissão do navegador
}
```

**Lógica principal:**
1. Buscar notificações do tipo `task_assigned` onde `read = false` e `card_id IS NOT NULL`
2. Configurar subscription realtime para detectar novas notificações
3. Iniciar/parar timer de 5 segundos para tocar som
4. Expor estado para sidebar e página de tarefas

### 2. Rastreamento de "Visualização" de Tarefas

Adicionar nova coluna na tabela `notifications`:

```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
```

**Diferença entre `read` e `viewed_at`:**
- `read`: Quando o usuário clica no sino de notificação e marca como lida
- `viewed_at`: Quando o usuário entra na página /tasks e permanece 5 segundos

O som para quando `viewed_at` é preenchido, não quando `read` é true.

### 3. Lógica de Permissão de Áudio

Navegadores modernos bloqueiam autoplay de áudio até o usuário interagir com a página. O sistema irá:

1. Tentar criar e tocar um `Audio` silencioso ao carregar
2. Se falhar → `needsAudioPermission = true`
3. Mostrar ícone pulsante amarelo na sidebar (item Tarefas)
4. Na página Tarefas, exibir card explicando como ativar

```typescript
// Verificar permissão
const checkAudioPermission = async () => {
  try {
    const audio = new Audio('/task-notification.mp3');
    audio.volume = 0.01; // Volume mínimo para teste
    await audio.play();
    audio.pause();
    return true;
  } catch {
    return false;
  }
};
```

### 4. Indicador Visual na Sidebar

Modificar `AppSidebar.tsx` para mostrar indicador amarelo pulsante quando:
- `hasPendingTasks = true` E `needsAudioPermission = true`

OU

- `hasPendingTasks = true` (qualquer caso - para chamar atenção)

```tsx
// No item "Tarefas" da sidebar
<NavLink to="/tasks" ...>
  <CheckSquare className="h-5 w-5" />
  <span>Tarefas</span>
  {hasPendingTasks && (
    <span className="absolute top-1 right-1 h-2 w-2 bg-amber-400 rounded-full animate-pulse" />
  )}
</NavLink>
```

### 5. Card de Permissão na Página Tarefas

Componente que aparece quando `needsAudioPermission = true`:

```tsx
// TaskPermissionAlert.tsx
<div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
  <div className="flex items-start gap-3">
    <Volume2 className="h-5 w-5 text-amber-500 mt-0.5" />
    <div className="flex-1">
      <h4 className="font-medium text-amber-800 dark:text-amber-200">
        Ative as notificações sonoras
      </h4>
      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
        Para receber alertas quando novas tarefas forem atribuídas a você, 
        clique no botão abaixo para ativar o som.
      </p>
      <Button 
        variant="outline" 
        size="sm" 
        className="mt-3 border-amber-500 text-amber-600"
        onClick={requestAudioPermission}
      >
        <Bell className="h-4 w-4 mr-2" />
        Ativar som de notificação
      </Button>
    </div>
  </div>
</div>
```

### 6. Lógica de Parada do Som

Quando o usuário entra em `/tasks`:
1. Iniciar timer de 5 segundos
2. Se usuário sair antes de 5s → resetar timer
3. Se completar 5s → chamar `markTasksAsViewed()`
4. Atualizar no banco: `UPDATE notifications SET viewed_at = NOW() WHERE user_id = ? AND type = 'task_assigned' AND viewed_at IS NULL`

```typescript
// Em Tasks.tsx
useEffect(() => {
  const timer = setTimeout(() => {
    markTasksAsViewed();
  }, 5000);
  
  return () => clearTimeout(timer);
}, []);
```

### 7. Som a Cada 5 Segundos

```typescript
// Em TaskAlertContext
useEffect(() => {
  if (!hasPendingTasks || !audioPermissionGranted) return;
  
  const audio = new Audio('/task-notification.mp3');
  audio.volume = 0.7;
  
  // Tocar imediatamente
  audio.play().catch(() => {});
  
  // E depois a cada 5 segundos
  const interval = setInterval(() => {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, 5000);
  
  return () => {
    clearInterval(interval);
    audio.pause();
  };
}, [hasPendingTasks, audioPermissionGranted]);
```

## Migração de Banco de Dados

```sql
-- Adicionar coluna para rastrear quando o usuário viu a tarefa
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

-- Índice para queries eficientes
CREATE INDEX IF NOT EXISTS idx_notifications_pending_tasks 
ON notifications (user_id, type, viewed_at) 
WHERE type = 'task_assigned' AND viewed_at IS NULL;
```

## Considerações de Performance

1. **Polling vs Realtime**: Usar Supabase Realtime para detectar novas notificações em tempo real
2. **Cache local**: Armazenar estado de permissão no localStorage
3. **Debounce**: Evitar múltiplas queries ao banco durante transições de página

## Fluxo Completo do Usuário

```text
1. Admin cria tarefa e atribui colaborador João
2. Sistema salva notificação task_assigned para João
3. João está em /dashboard:
   - TaskAlertContext detecta notificação pendente
   - Se permissão OK: som toca a cada 5s
   - Se permissão negada: sidebar mostra ícone amarelo pulsante em "Tarefas"
4. João clica em "Tarefas":
   - Se precisa permissão: vê card explicativo no topo
   - Timer de 5s inicia
5. João permanece 5s na página:
   - Sistema marca notificação com viewed_at = NOW()
   - Som para de tocar
   - Ícone amarelo some da sidebar
6. João pode continuar trabalhando normalmente
```

## Tratamento de Casos Especiais

| Cenário | Comportamento |
|---------|---------------|
| Usuário em /tasks quando tarefa é atribuída | Não toca som, espera 5s para marcar como vista |
| Múltiplas tarefas pendentes | Um único som, marca todas como vistas de uma vez |
| Navegador em segundo plano | Som pode não tocar (limitação do browser), mas ícone visual persiste |
| Usuário dono da org | Também recebe alertas se for atribuído a tarefas |
| Usuário deslogado | Alertas param, retomam ao relogar |

## Hierarquia de Arquivos Final

```text
src/
├── contexts/
│   ├── AuthContext.tsx
│   ├── OrganizationContext.tsx
│   └── TaskAlertContext.tsx       ← NOVO
├── components/
│   ├── AppSidebar.tsx             ← MODIFICAR
│   ├── TaskPermissionAlert.tsx    ← NOVO
│   └── ...
├── pages/
│   └── Tasks.tsx                  ← MODIFICAR
└── App.tsx                        ← MODIFICAR

public/
└── task-notification.mp3          ← NOVO (arquivo do usuário)
```

## Seção Técnica

### Por que usar Context ao invés de Hook?

Um Context permite:
1. Estado compartilhado entre AppSidebar e Tasks sem prop drilling
2. Listener realtime único em vez de múltiplos
3. Controle centralizado do audio para evitar sobreposição de sons

### Permissões de Áudio em Navegadores

Browsers modernos (Chrome, Firefox, Safari) têm políticas de autoplay:
- Áudio só pode tocar após interação do usuário (clique, toque)
- Uma vez que o usuário interage, a permissão persiste para a sessão
- O botão "Ativar som" serve como essa interação inicial

### Query de Tarefas Pendentes

```sql
SELECT COUNT(*) FROM notifications
WHERE user_id = $1
  AND type = 'task_assigned'
  AND viewed_at IS NULL
  AND card_id IS NOT NULL;
```

Esta query é eficiente porque:
- Usa índice em (user_id, type, viewed_at)
- Filtra apenas notificações relevantes
- COUNT é rápido mesmo com muitas notificações

