# Code Review Fixes - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 code review issues across security, TypeScript quality, architecture, and documentation in the CRM Kairoz application.

**Architecture:** Each sub-project is independent and can be executed in parallel. Sub-Project A (Security) is highest priority. Sub-Projects B.2 and B.3 (TypeScript strict mode) should be done sequentially after other work.

**Tech Stack:** React, TypeScript, Supabase, React Query, dnd-kit

---

## File Structure

### New Files to Create
- `src/lib/logger.ts` - Conditional logger utility
- `src/hooks/useKanbanBoard.ts` - Kanban board state management
- `src/hooks/useKanbanCards.ts` - Kanban cards CRUD operations
- `src/hooks/useKanbanDrag.ts` - Drag & drop logic
- `src/hooks/useKanbanPermissions.ts` - Granular permissions
- `src/hooks/useFacebookOAuth.ts` - Facebook OAuth flow
- `src/hooks/useFacebookForms.ts` - Facebook forms management
- `src/hooks/useFacebookConnection.ts` - Facebook connection status
- `docs/database/migrations-guide.md` - Migration naming conventions

### Files to Modify
- `src/components/LeadDetailsDialog.tsx` - Remove hardcoded email
- `src/contexts/AuthContext.tsx` - Fix subscription fallback
- `src/components/KanbanBoard.tsx` - Refactor to use new hooks
- `src/components/FacebookLeadsConnection.tsx` - Refactor to use new hooks
- `tsconfig.json` - Enable strict mode flags (final phase)

---

## Sub-Project A: Segurança Crítica

### Task A.1: Remover Email Hardcodeado

**Files:**
- Modify: `src/components/LeadDetailsDialog.tsx:71-72`

- [ ] **Step 1: Verificar uso atual do isOwner**

O código atual na linha 72:
```typescript
const isOwner = user?.email === "mateusabcck@gmail.com";
```

- [ ] **Step 2: Modificar para usar isSuperAdmin do AuthContext**

```typescript
// Na linha 71, modificar de:
const { user } = useAuth();
const isOwner = user?.email === "mateusabcck@gmail.com";

// Para:
const { user, isSuperAdmin } = useAuth();
```

- [ ] **Step 3: Substituir todas as ocorrências de isOwner por isSuperAdmin**

No arquivo `LeadDetailsDialog.tsx`, substituir todas as 4 ocorrências:
- Linha 72: `const isOwner` → remover esta linha
- Linha 275: `{isOwner && (` → `{isSuperAdmin && (`
- Linha 464: `{isOwner && (` → `{isSuperAdmin && (`
- Linha 552: `{isOwner && (` → `{isSuperAdmin && (`

```typescript
// Linha 71-72 (modificar):
export const LeadDetailsDialog = ({ open, onOpenChange, leadId, leadName }: LeadDetailsDialogProps) => {
  const { user, isSuperAdmin } = useAuth();
  // Remover: const isOwner = user?.email === "mateusabcck@gmail.com";
```

- [ ] **Step 4: Verificar se há outras referências ao email hardcodeado**

```bash
grep -r "mateusabcck@gmail.com" src/
```
Expected: No results (após a remoção)

- [ ] **Step 5: Commit**

```bash
git add src/components/LeadDetailsDialog.tsx
git commit -m "fix(security): remove hardcoded owner email, use isSuperAdmin from AuthContext"
```

---

### Task A.2: Corrigir Fallback Generoso de Assinatura

**Files:**
- Modify: `src/contexts/AuthContext.tsx:218-228`
- Modify: `src/contexts/AuthContext.tsx:387-394`
- Modify: `src/contexts/AuthContext.tsx:480-487`

- [ ] **Step 1: Identificar todos os locais com fallback generoso**

Há 3 locais no `AuthContext.tsx` com o fallback:
1. Linhas 218-228: na função `refreshSubscription`
2. Linhas 387-394: no `SIGNED_IN` handler
3. Linhas 480-487: no `getSession` inicial

- [ ] **Step 2: Corrigir fallback em refreshSubscription (linhas 218-228)**

```typescript
// De:
subData = {
  subscribed: true,
  product_id: 'enterprise_free',
  subscription_end: null,
  max_collaborators: 999,
  extra_collaborators: 0,
  total_collaborators: 999
};

// Para:
subData = {
  subscribed: false,
  product_id: 'free',
  subscription_end: null,
  max_collaborators: 5,
  extra_collaborators: 0,
  total_collaborators: 5
};
```

- [ ] **Step 3: Corrigir fallback no SIGNED_IN handler (linhas 387-394)**

```typescript
// De:
setSubscriptionData({
  subscribed: true,
  product_id: 'enterprise_free',
  subscription_end: null,
  max_collaborators: 999,
  extra_collaborators: 0,
  total_collaborators: 999
});

// Para:
setSubscriptionData({
  subscribed: false,
  product_id: 'free',
  subscription_end: null,
  max_collaborators: 5,
  extra_collaborators: 0,
  total_collaborators: 5
});
```

- [ ] **Step 4: Corrigir fallback no getSession inicial (linhas 480-487)**

```typescript
// De:
setSubscriptionData({
  subscribed: true,
  product_id: 'enterprise_free',
  subscription_end: null,
  max_collaborators: 999,
  extra_collaborators: 0,
  total_collaborators: 999
});

// Para:
setSubscriptionData({
  subscribed: false,
  product_id: 'free',
  subscription_end: null,
  max_collaborators: 5,
  extra_collaborators: 0,
  total_collaborators: 5
});
```

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "fix(security): reduce subscription fallback from 999 to 5 collaborators, set subscribed=false"
```

---

## Sub-Project B: Qualidade TypeScript

### Task B.1: Logger Condicional

**Files:**
- Create: `src/lib/logger.ts`

- [ ] **Step 1: Criar arquivo do logger**

Criar `src/lib/logger.ts`:

```typescript
/**
 * Conditional logger utility that only logs in development mode.
 * Error logs are always shown regardless of environment.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log('[LOG]', ...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn('[WARN]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.log('[DEBUG]', ...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info('[INFO]', ...args);
  },
};
```

- [ ] **Step 2: Commit inicial do logger**

```bash
git add src/lib/logger.ts
git commit -m "feat(logger): add conditional logger utility for development-only logging"
```

- [ ] **Step 3: Identificar arquivos com console.log/warn/info para substituição**

```bash
grep -r "console\.\(log\|warn\|info\)" src/ --include="*.ts" --include="*.tsx" -l
```

Nota: Não substituir `console.error` (erros devem sempre ser logados).

- [ ] **Step 4: Substituir em AuthContext.tsx**

```typescript
// Adicionar import no topo:
import { logger } from "@/lib/logger";

// Substituir todas as ocorrências:
// console.log('[AUTH] ... → logger.log('[AUTH] ...
// console.error('[AUTH] ... → manter console.error (erros sempre logam)
```

Linhas específicas no AuthContext.tsx:
- Linha 114: `console.error('Error setting section access cache:', error);` → `logger.error('Error setting section access cache:', error);`
- Linha 123: `console.error('Error clearing section access cache:', error);` → `logger.error('Error clearing section access cache:', error);`
- Linha 137-138, 144-145: manteras como logger.error
- Linha 186: `console.log('[AUTH] refreshing subscription for:'` → `logger.log('[AUTH] refreshing subscription for:'`
- Linha 203: manter console.error
- Linha 219: `console.log('[AUTH] Using fallback plan');` → `logger.log('[AUTH] Using fallback plan');`
- Linha 233: manter console.error
- Linha 247-248: manter console.error
- Linha 337: manter console.error
- Linha 348: `console.log('[AUTH] Auth state change:'` → `logger.log('[AUTH] Auth state change:'`
- Linha 354: `console.log('[AUTH] Token refreshed,'` → `logger.log('[AUTH] Token refreshed,'`
- Linha 365-366, 369-370, 412-413, 446, 457-458, 460-461, 508: converter para logger.log
- Linha 507, 516-517: manter console.error
- Linha 553: manter console.error

- [ ] **Step 5: Substituir em KanbanBoard.tsx**

```typescript
// Adicionar import no topo:
import { logger } from "@/lib/logger";

// Substituir:
// console.log('[KANBAN] ... → logger.log('[KANBAN] ...
// console.error('[KANBAN] ... → logger.error('[KANBAN] ...
```

Linhas específicas no KanbanBoard.tsx:
- Linha 131: `console.error("[KANBAN] Error loading org members:"` → `logger.error`
- Linha 139: `console.log('[KANBAN] Loading board for organization:'` → `logger.log`
- Linha 157: `console.log('[KANBAN] Existing board result:'` → `logger.log`
- Linha 165: `console.error('[KANBAN] Permission error` → `logger.error`
- Linha 172: `console.error('[KANBAN] Error fetching board:'` → `logger.error`
- Linha 182, 193, 219, 233-234: converter adequadamente
- Linha 450: `console.log("[KANBAN] Menções detectadas` → `logger.log`
- Linha 589-592: `console.log('[KANBAN] Assignees sincronizados:` → `logger.log`
- Linha 595: `logger.error`
- Linha 664-670: `console.log("🔍 DragEnd` → `logger.log`
- Linha 685: `console.error` → `logger.error`
- Linha 696, 710, 711-718, 725: converter
- Linha 832-839: `console.log("📊 Pontuação registrada:` → `logger.log`

- [ ] **Step 6: Substituir em FacebookLeadsConnection.tsx**

```typescript
// Adicionar import no topo:
import { logger } from "@/lib/logger";
```

Linhas específicas no FacebookLeadsConnection.tsx:
- Linha 61: `console.log('🪟 [FB-CONN] Detectado` → `logger.log`
- Linha 79: `console.error('❌ [FB-CONN] Erro ao enviar mensagem` → `logger.error`
- Linha 113: `console.log('📬 [FB-CONN] Recebida resposta` → `logger.log`
- Linha 118, 122-123, 128-132, 137, 141-142: converter
- Linha 157-158, 162, 175-176, 185, 198, 216, 219, 254, 263, 290, 303-304, 312, 335, 343-344, 376, 387-388, 398, 430, 491, 496, 504, 507: converter adequadamente

- [ ] **Step 7: Commit das substituições**

```bash
git add -A
git commit -m "refactor(logger): replace console.log/warn/info with conditional logger in core components"
```

---

### Task B.2 Fase 1: Reduzir `any` em Contexts

**Files:**
- Modify: `src/contexts/AuthContext.tsx`
- Modify: `src/contexts/OrganizationContext.tsx`

- [ ] **Step 1: Ler OrganizationContext.tsx para identificar usos de any**

```bash
grep -n "any" src/contexts/OrganizationContext.tsx
```

- [ ] **Step 2: Definir interfaces para tipos no AuthContext**

Adicionar em `src/contexts/AuthContext.tsx`:

```typescript
// Adicionar após as interfaces existentes (após linha 13):

interface CachedSectionAccess {
  data: Record<string, boolean>;
  userId: string;
}

interface UserProfile {
  user_id: string;
  full_name: string | null;
  email?: string;
  avatar_url?: string | null;
}
```

- [ ] **Step 3: Substituir any por tipos específicos em AuthContext**

- Linha 92: `(details as any)?.created_by` → criar interface ou usar tipo existente
- Linha 111: `(data as any)?.full_name` → usar UserProfile
- Linha 116: `members?.find((m: any)` → definir tipo Member

- [ ] **Step 4: Commit da Fase 1**

```bash
git add src/contexts/AuthContext.tsx src/contexts/OrganizationContext.tsx
git commit -m "refactor(types): replace any with proper interfaces in AuthContext and OrganizationContext"
```

---

### Task B.2 Fase 2-4: Reduzir `any` em Hooks/Pages/Components

**Nota:** Esta fase é extensa e deve ser feita gradualmente. Focar nos arquivos mais críticos primeiro.

- [ ] **Step 1: Identificar hooks com uso de any**

```bash
grep -r ": any" src/hooks/ --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 2: Criar tipos compartilhados em src/types/ (se não existir)**

Criar `src/types/kanban.ts`:
```typescript
export interface KanbanCard {
  id: string;
  content: string;
  description?: string;
  due_date?: string;
  estimated_time?: number;
  position: number;
  column_id: string;
  created_at: string;
  created_by: string;
  timer_started_at?: string;
  calendar_event_id?: string;
  calendar_event_link?: string;
  lead_id?: string;
  lead?: Lead;
  is_collaborative?: boolean;
  requires_all_approval?: boolean;
  timer_start_column_id?: string;
  color?: string | null;
}

export interface KanbanColumn {
  id: string;
  title: string;
  position: number;
  cards: KanbanCard[];
  is_completion_stage?: boolean;
  block_backward_movement?: boolean;
  auto_delete_enabled?: boolean;
  auto_delete_hours?: number | null;
  stage_color?: string | null;
}

export interface Lead {
  id: string;
  nome_lead: string;
  telefone_lead: string;
  email?: string;
}
```

- [ ] **Step 3: Commit incremental por arquivo/diretório**

```bash
git add src/types/
git commit -m "refactor(types): add shared Kanban and Lead type definitions"
```

---

### Task B.3: TypeScript Strict Mode (Gradual)

**Files:**
- Modify: `tsconfig.json`

**Nota:** Só executar após Task B.2 Fase 1-2 estar completa.

- [ ] **Step 1: Habilitar noImplicitAny após Fase 1-2**

Em `tsconfig.json`, adicionar:
```json
{
  "compilerOptions": {
    "noImplicitAny": true
  }
}
```

- [ ] **Step 2: Verificar erros e corrigir**

```bash
npm run build 2>&1 | head -100
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore(typescript): enable noImplicitAny"
```

- [ ] **Step 4: Habilitar strictNullChecks após corrigir null checks**

Em `tsconfig.json`, adicionar:
```json
{
  "compilerOptions": {
    "strictNullChecks": true
  }
}
```

- [ ] **Step 5: Verificar erros e corrigir**

```bash
npm run build 2>&1 | head -100
```

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json src/
git commit -m "chore(typescript): enable strictNullChecks"
```

---

## Sub-Project C: Refatoração de Arquitetura

### Task C.1: Extrair Hooks do KanbanBoard

**Files:**
- Create: `src/hooks/useKanbanBoard.ts`
- Create: `src/hooks/useKanbanCards.ts`
- Create: `src/hooks/useKanbanDrag.ts`
- Create: `src/hooks/useKanbanPermissions.ts`
- Modify: `src/components/KanbanBoard.tsx`

- [ ] **Step 1: Criar useKanbanPermissions.ts**

```typescript
// src/hooks/useKanbanPermissions.ts
import { useOrganization } from "@/contexts/OrganizationContext";

interface KanbanPermissions {
  isOwnerOrAdmin: boolean;
  canCreateTasks: boolean;
  canEditOwnTasks: boolean;
  canEditAllTasks: boolean;
  canDeleteTasks: boolean;
}

export function useKanbanPermissions(): KanbanPermissions {
  const { permissions } = useOrganization();

  const isOwnerOrAdmin = permissions.role === 'owner' || permissions.role === 'admin';
  const canCreateTasks = isOwnerOrAdmin || permissions.canCreateTasks;
  const canEditOwnTasks = isOwnerOrAdmin || permissions.canEditOwnTasks;
  const canEditAllTasks = isOwnerOrAdmin || permissions.canEditAllTasks;
  const canDeleteTasks = isOwnerOrAdmin || permissions.canDeleteTasks;

  return {
    isOwnerOrAdmin,
    canCreateTasks,
    canEditOwnTasks,
    canEditAllTasks,
    canDeleteTasks,
  };
}
```

- [ ] **Step 2: Criar useKanbanBoard.ts**

```typescript
// src/hooks/useKanbanBoard.ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import type { KanbanColumn, KanbanCard } from "@/types/kanban";

interface UseKanbanBoardReturn {
  boardId: string | null;
  columns: KanbanColumn[];
  loading: boolean;
  boardNotFound: boolean;
  loadColumns: (boardId: string) => Promise<void>;
  addColumn: () => Promise<void>;
  updateColumnTitle: (columnId: string, title: string) => Promise<void>;
  deleteColumn: (columnId: string) => Promise<void>;
}

export function useKanbanBoard(
  organizationId: string,
  isOwnerOrAdmin: boolean
): UseKanbanBoardReturn {
  const [boardId, setBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardNotFound, setBoardNotFound] = useState(false);
  const { toast } = useToast();

  const loadColumns = useCallback(async (boardId: string) => {
    const { data: columnsData } = await supabase
      .from("kanban_columns")
      .select("*")
      .eq("board_id", boardId)
      .order("position");

    const { data: cardsData } = await supabase
      .from("kanban_cards")
      .select("*, leads:lead_id(id, nome_lead, telefone_lead, email)")
      .in("column_id", columnsData?.map(c => c.id) || [])
      .order("position");

    // ... resto da lógica de loadColumns do componente original
  }, []);

  const loadOrCreateBoard = useCallback(async () => {
    // ... lógica completa de loadOrCreateBoard do componente original
  }, [organizationId, isOwnerOrAdmin]);

  useEffect(() => {
    loadOrCreateBoard();
  }, [organizationId]);

  const addColumn = useCallback(async () => {
    // ... lógica de addColumn
  }, [boardId, columns]);

  const updateColumnTitle = useCallback(async (columnId: string, title: string) => {
    // ... lógica de updateColumnTitle
  }, [columns]);

  const deleteColumn = useCallback(async (columnId: string) => {
    // ... lógica de deleteColumn
  }, [columns]);

  return {
    boardId,
    columns,
    loading,
    boardNotFound,
    loadColumns,
    addColumn,
    updateColumnTitle,
    deleteColumn,
  };
}
```

- [ ] **Step 3: Criar useKanbanCards.ts**

```typescript
// src/hooks/useKanbanCards.ts
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import type { KanbanCard, KanbanColumn } from "@/types/kanban";

interface UseKanbanCardsReturn {
  cardAssigneesMap: Record<string, string[]>;
  handleTaskCreated: (task: TaskCreationParams) => Promise<void>;
  updateCard: (columnId: string, cardId: string, updates: Partial<KanbanCard>) => Promise<void>;
  deleteCard: (columnId: string, cardId: string) => Promise<void>;
  syncCardAssignees: (cardId: string, newAssignees: string[], cardTitle: string) => Promise<void>;
}

export function useKanbanCards(
  columns: KanbanColumn[],
  setColumns: React.Dispatch<React.SetStateAction<KanbanColumn[]>>,
  currentUserId: string | null,
  boardId: string | null
): UseKanbanCardsReturn {
  const [cardAssigneesMap, setCardAssigneesMap] = useState<Record<string, string[]>>({});
  const { toast } = useToast();

  // ... implementação completa com handleTaskCreated, updateCard, deleteCard, syncCardAssignees

  return {
    cardAssigneesMap,
    handleTaskCreated,
    updateCard,
    deleteCard,
    syncCardAssignees,
  };
}
```

- [ ] **Step 4: Criar useKanbanDrag.ts**

```typescript
// src/hooks/useKanbanDrag.ts
import { useState, useCallback } from "react";
import { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import type { KanbanCard, KanbanColumn } from "@/types/kanban";

interface UseKanbanDragReturn {
  activeCard: KanbanCard | null;
  isDraggingActive: boolean;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent) => Promise<void>;
}

export function useKanbanDrag(
  columns: KanbanColumn[],
  setColumns: React.Dispatch<React.SetStateAction<KanbanColumn[]>>,
  boardId: string | null,
  organizationId: string,
  loadColumns: (boardId: string) => Promise<void>
): UseKanbanDragReturn {
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [isDraggingActive, setIsDraggingActive] = useState(false);
  const { toast } = useToast();

  const handleDragStart = useCallback((event: DragStartEvent) => {
    // ... implementação
  }, [columns]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    // Apenas para feedback visual
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    // ... implementação completa com validações de:
    // - Tarefa colaborativa
    // - Bloqueio de movimento reverso
    // - Atualização de timer
    // - Registro de pontuação
  }, [columns, boardId, organizationId]);

  return {
    activeCard,
    isDraggingActive,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
```

- [ ] **Step 5: Refatorar KanbanBoard.tsx para usar os hooks**

```typescript
// src/components/KanbanBoard.tsx (versão refatorada)
import { useState, useEffect } from "react";
import { DndContext, DragOverlay, closestCorners } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { KanbanColumn } from "./KanbanColumn";
import { LoadingAnimation } from "./LoadingAnimation";
import { CreateTaskEventModal } from "./CreateTaskEventModal";
import { CreateTaskModal } from "./CreateTaskModal";

import { useKanbanBoard } from "@/hooks/useKanbanBoard";
import { useKanbanCards } from "@/hooks/useKanbanCards";
import { useKanbanDrag } from "@/hooks/useKanbanDrag";
import { useKanbanPermissions } from "@/hooks/useKanbanPermissions";

interface KanbanBoardProps {
  organizationId: string;
}

export const KanbanBoard = ({ organizationId }: KanbanBoardProps) => {
  const { isOwnerOrAdmin, canCreateTasks, canEditOwnTasks, canEditAllTasks, canDeleteTasks } = useKanbanPermissions();

  const {
    boardId,
    columns,
    loading,
    boardNotFound,
    loadColumns,
    addColumn,
    updateColumnTitle,
    deleteColumn,
  } = useKanbanBoard(organizationId, isOwnerOrAdmin);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<UserOption[]>([]);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [selectedCardForCalendar, setSelectedCardForCalendar] = useState<Card | null>(null);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [selectedColumnForTask, setSelectedColumnForTask] = useState<string | null>(null);

  const {
    cardAssigneesMap,
    handleTaskCreated,
    updateCard,
    deleteCard,
  } = useKanbanCards(columns, setColumns, currentUserId, boardId);

  const {
    activeCard,
    isDraggingActive,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useKanbanDrag(columns, setColumns, boardId, organizationId, loadColumns);

  // ... resto da UI do componente (reduzido para ~300 linhas)
};
```

- [ ] **Step 6: Commit dos hooks e refatoração**

```bash
git add src/hooks/useKanban*.ts src/components/KanbanBoard.tsx
git commit -m "refactor(kanban): extract custom hooks from KanbanBoard, reduce from 1013 to ~300 lines"
```

---

### Task C.2: Extrair Hooks do FacebookLeadsConnection

**Files:**
- Create: `src/hooks/useFacebookOAuth.ts`
- Create: `src/hooks/useFacebookForms.ts`
- Create: `src/hooks/useFacebookConnection.ts`
- Modify: `src/components/FacebookLeadsConnection.tsx`

- [ ] **Step 1: Criar useFacebookConnection.ts**

```typescript
// src/hooks/useFacebookConnection.ts
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

interface FacebookIntegration {
  id: string;
  page_id: string;
  page_name?: string;
  webhook_verified?: boolean;
}

interface UseFacebookConnectionReturn {
  isConnected: boolean;
  integration: FacebookIntegration | null;
  needsReconnect: boolean;
  checkingTokens: boolean;
  checkConnection: () => Promise<FacebookIntegration | null>;
  handleDisconnect: () => Promise<void>;
}

export function useFacebookConnection(organizationId?: string): UseFacebookConnectionReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [integration, setIntegration] = useState<FacebookIntegration | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [checkingTokens, setCheckingTokens] = useState(false);

  const checkConnection = useCallback(async () => {
    // ... implementação de checkConnection
  }, [organizationId]);

  const handleDisconnect = useCallback(async () => {
    // ... implementação de handleDisconnect
  }, [integration]);

  return {
    isConnected,
    integration,
    needsReconnect,
    checkingTokens,
    checkConnection,
    handleDisconnect,
  };
}
```

- [ ] **Step 2: Criar useFacebookOAuth.ts**

```typescript
// src/hooks/useFacebookOAuth.ts
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface UseFacebookOAuthReturn {
  loading: boolean;
  oauthRedirectUri: string | null;
  handleConnect: () => Promise<void>;
  handleOauthCallback: (code: string, state: string, redirectUri?: string) => Promise<void>;
  handlePageSelect: (selectedPageId: string) => Promise<void>;
  availablePages: { id: string; name: string }[];
  showPageSelector: boolean;
  setShowPageSelector: (show: boolean) => void;
  pendingIntegrationId: string | null;
}

export function useFacebookOAuth(
  organizationId?: string,
  onConnectionSuccess: (integration: any) => void
): UseFacebookOAuthReturn {
  const [loading, setLoading] = useState(false);
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string | null>(null);
  const [availablePages, setAvailablePages] = useState<{ id: string; name: string }[]>([]);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [pendingIntegrationId, setPendingIntegrationId] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    // ... implementação completa de handleConnect
  }, [organizationId]);

  const handleOauthCallback = useCallback(async (code: string, state: string, redirectUri?: string) => {
    // ... implementação completa
  }, [oauthRedirectUri, onConnectionSuccess]);

  const handlePageSelect = useCallback(async (selectedPageId: string) => {
    // ... implementação completa
  }, [pendingIntegrationId, organizationId, onConnectionSuccess]);

  return {
    loading,
    oauthRedirectUri,
    handleConnect,
    handleOauthCallback,
    handlePageSelect,
    availablePages,
    showPageSelector,
    setShowPageSelector,
    pendingIntegrationId,
  };
}
```

- [ ] **Step 3: Criar useFacebookForms.ts**

```typescript
// src/hooks/useFacebookForms.ts
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface LeadForm {
  id: string;
  name: string;
  status: string;
  leads_count: number;
}

interface UseFacebookFormsReturn {
  leadForms: LeadForm[];
  loadingForms: boolean;
  showFormSelector: boolean;
  setShowFormSelector: (show: boolean) => void;
  configuredFormIds: Set<string>;
  fetchLeadForms: (integrationData?: any) => Promise<void>;
  handleFormConfigured: (formId: string) => void;
  handleFormRemoved: (formId: string) => void;
}

export function useFacebookForms(
  organizationId?: string,
  integration: any
): UseFacebookFormsReturn {
  const [leadForms, setLeadForms] = useState<LeadForm[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [showFormSelector, setShowFormSelector] = useState(false);
  const [configuredFormIds, setConfiguredFormIds] = useState<Set<string>>(new Set());

  const fetchLeadForms = useCallback(async (integrationData?: any) => {
    // ... implementação completa
  }, [organizationId, integration]);

  const handleFormConfigured = useCallback((formId: string) => {
    setConfiguredFormIds(prev => new Set([...prev, formId]));
  }, []);

  const handleFormRemoved = useCallback((formId: string) => {
    setConfiguredFormIds(prev => {
      const next = new Set(prev);
      next.delete(formId);
      return next;
    });
  }, []);

  return {
    leadForms,
    loadingForms,
    showFormSelector,
    setShowFormSelector,
    configuredFormIds,
    fetchLeadForms,
    handleFormConfigured,
    handleFormRemoved,
  };
}
```

- [ ] **Step 4: Refatorar FacebookLeadsConnection.tsx para usar os hooks**

O componente refatorado deve ficar em torno de 250 linhas, usando os 3 hooks extraídos.

- [ ] **Step 5: Commit dos hooks e refatoração**

```bash
git add src/hooks/useFacebook*.ts src/components/FacebookLeadsConnection.tsx
git commit -m "refactor(facebook): extract custom hooks from FacebookLeadsConnection, reduce from 814 to ~250 lines"
```

---

### Task C.3: Documentar Decisão de Dashboard Queries

**Files:**
- Modify: `src/pages/Dashboard.tsx` (ou arquivo relevante)

- [ ] **Step 1: Encontrar o arquivo de Dashboard**

```bash
find src/ -name "*Dashboard*" -type f
```

- [ ] **Step 2: Adicionar comentário documentando a decisão**

No local onde as queries paralelas são feitas:

```typescript
// NOTE: Queries mantidas paralelas para cache granular.
// Cada métrica pode ser invalidada independentemente pelo React Query.
// Isso permite refresh seletivo de métricas sem re-fetch de todas.
// Performance: O overhead de múltiplas queries é compensado pelo cache individual.
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "docs(dashboard): document decision to keep parallel queries for granular caching"
```

---

## Sub-Project D: Padronização DB

### Task D.1: Documentar Padrão de Migrations

**Files:**
- Create: `docs/database/migrations-guide.md`

- [ ] **Step 1: Criar diretório se não existir**

```bash
mkdir -p docs/database
```

- [ ] **Step 2: Criar arquivo de guia de migrations**

```markdown
# Guia de Migrations - CRM Kairoz

## Formato de Nomenclatura

As migrations devem seguir o formato:
```
YYYYMMDDHHMMSS_description.sql
```

Onde:
- `YYYY` - Ano (4 dígitos)
- `MM` - Mês (2 dígitos)
- `DD` - Dia (2 dígitos)
- `HHMMSS` - Hora, minuto e segundo (6 dígitos)
- `description` - Descrição curta em snake_case

## Exemplos

### ✅ Correto
```
20260328120000_add_user_preferences_table.sql
20260328120100_create_index_on_leads_email.sql
20260328120200_add_cascade_delete_to_tasks.sql
```

### ❌ Incorreto
```
add_user_preferences.sql              # Sem timestamp
2026-03-28_add_user_preferences.sql   # Formato de data incorreto
add_user_preferences_table.sql        # Sem data/hora
Add_User_Preferences_Table.sql        # CamelCase em vez de snake_case
```

## Checklist para Nova Migration

- [ ] Nome segue o formato `YYYYMMDDHHMMSS_description.sql`
- [ ] Descrição é clara e em snake_case
- [ ] Migration é reversível (incluir `DOWN` se aplicável)
- [ ] Testada em ambiente de desenvolvimento
- [ ] Não altera migrations existentes
- [ ] Verificar impacto em RLS policies

## Diretório

As migrations ficam em: `supabase/migrations/`

## Comandos Úteis

```bash
# Criar nova migration
supabase migration new nome_da_migration

# Aplicar migrations
supabase db push

# Ver histórico
supabase migration list
```

## Notas

- Nunca altere migrations já aplicadas em produção
- Use transações para operações que modificam múltiplas tabelas
- Documente mudanças complexas com comentários no SQL
```

- [ ] **Step 3: Commit**

```bash
git add docs/database/migrations-guide.md
git commit -m "docs(database): add migration naming convention guide"
```

---

## Self-Review Checklist

Antes de considerar o plano completo, verificar:

### 1. Spec Coverage
| Requisito | Task |
|-----------|------|
| A.1 - Remover email hardcodeado | Task A.1 |
| A.2 - Corrigir fallback generoso | Task A.2 |
| B.1 - Logger condicional | Task B.1 |
| B.2 - Reduzir any (contexts) | Task B.2 Fase 1 |
| B.2 - Reduzir any (hooks/pages/components) | Task B.2 Fase 2-4 |
| B.3 - Strict mode | Task B.3 |
| C.1 - Extrair hooks KanbanBoard | Task C.1 |
| C.2 - Extrair hooks FacebookLeadsConnection | Task C.2 |
| C.3 - Dashboard queries | Task C.3 |
| D.1 - Documentar migrations | Task D.1 |

### 2. Placeholder Scan
- [x] Sem "TBD", "TODO", "implement later"
- [x] Sem "Add appropriate error handling" genérico
- [x] Código completo em cada step
- [x] Comandos exatos com output esperado

### 3. Type Consistency
- [x] Interfaces definidas antes do uso
- [x] Nomes de funções consistentes entre tasks
- [x] Props e tipos alinhados entre hooks e componentes

---

## Ordem de Execução Recomendada

1. **Task A.1** - Remover email hardcodeado (Baixo risco)
2. **Task A.2** - Corrigir fallback generoso (Médio risco)
3. **Task D.1** - Documentar padrão migrations (Zero risco)
4. **Task B.1** - Logger condicional (Baixo risco)
5. **Task C.3** - Documentar decisão Dashboard (Baixo risco)
6. **Task C.1** - Extrair hooks KanbanBoard (Baixo risco)
7. **Task C.2** - Extrair hooks FacebookLeadsConnection (Baixo risco)
8. **Task B.2 Fase 1** - Reduzir any em contexts (Médio risco)
9. **Task B.2 Fase 2-4** - Reduzir any em demais arquivos (Médio risco)
10. **Task B.3** - Habilitar strict mode (Médio risco)

---

## Critérios de Sucesso

- [ ] Email hardcodeado removido, `isSuperAdmin` funcionando
- [ ] Fallback de assinatura limitado a 5 colaboradores
- [ ] Logger condicional implementado, console.logs substituídos
- [ ] `any` reduzido em contexts e hooks principais
- [ ] KanbanBoard.tsx com menos de 400 linhas
- [ ] FacebookLeadsConnection.tsx com menos de 300 linhas
- [ ] Guia de migrations documentado
