# Visão de Lista no Pipeline - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar toggle entre visão Funil e Lista no Pipeline, com seleção múltipla e ações em lote (atribuir, mover, tags, exportar, excluir).

**Architecture:** Toggle state dentro do Pipeline.tsx. Quando viewMode='list', renderiza tabela com checkboxes e barra de ações em lote. Modais de ação são componentes separados para manter o arquivo organizado.

**Tech Stack:** React, TypeScript, Supabase, TanStack Query, Radix UI (dialogs), xlsx (export)

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/pages/Pipeline.tsx` | Estado viewMode, tabela, ações em lote, remover filtro status |
| `src/components/PipelineListRow.tsx` | Linha da tabela de leads com checkbox |
| `src/components/BulkActionsBar.tsx` | Barra de ações em lote (aparece com seleção) |
| `src/components/BulkAssignDialog.tsx` | Dialog para atribuir responsável |
| `src/components/BulkMoveDialog.tsx` | Dialog para mover etapa |
| `src/components/BulkTagsDialog.tsx` | Dialog para gerenciar tags |
| `src/components/ExportDialog.tsx` | Dialog de exportação com opções |

---

## Task 1: Adicionar Estado de ViewMode e Seleção

**Files:**
- Modify: `src/pages/Pipeline.tsx` (área de estados, após linha 167)

- [ ] **Step 1: Adicionar novos estados**

Adicionar após a linha 167 (após `const [searchTerm, setSearchTerm] = useState("");`):

```typescript
  // Estado para alternar entre visão funil e lista
  const [viewMode, setViewMode] = useState<'funnel' | 'list'>('funnel');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: add viewMode and selection state for list view

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Remover Filtro "Todos os Status" e Adicionar Ordenação

**Files:**
- Modify: `src/pages/Pipeline.tsx` (linha 104, linha 1739-1750)

- [ ] **Step 1: Remover estado statusFilter**

Na linha 104, remover:
```typescript
const [statusFilter, setStatusFilter] = useState<string>("all");
```

- [ ] **Step 2: Remover filtro de status do filteredLeads**

Localizar o `useMemo` de `filteredLeads` (aproximadamente linha 1115) e remover o bloco:

```typescript
// REMOVER este bloco:
if (statusFilter !== "all") {
  result = result.filter(lead => (lead.stage || "NOVO") === statusFilter);
}
```

- [ ] **Step 3: Remover UI do filtro de status**

Localizar e remover o Select de statusFilter (aproximadamente linha 1739-1750):

```typescript
// REMOVER este bloco:
<Select value={statusFilter} onValueChange={setStatusFilter}>
  <SelectTrigger className="h-9 w-[145px] bg-background">
    <SelectValue placeholder="Status" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Todos os Status</SelectItem>
    <SelectItem value="NOVO">Novo</SelectItem>
    <SelectItem value="EM_ATENDIMENTO">Em Atendimento</SelectItem>
    <SelectItem value="FECHADO">Fechado</SelectItem>
    <SelectItem value="PERDIDO">Perdido</SelectItem>
  </SelectContent>
</Select>
```

- [ ] **Step 4: Adicionar handler de ordenação**

Adicionar após os estados (após a linha 170):

```typescript
  // Handler para mudança de ordenação
  const handleSortChange = useCallback((value: string) => {
    const [field, direction] = value.split('-');
    setSortField(field);
    setSortDirection(direction as 'asc' | 'desc');
  }, []);
```

- [ ] **Step 5: Adicionar import do List e LayoutGrid**

Na seção de imports (linha 14), modificar:

```typescript
import { Settings2, Search, Plus, Download, Upload, CalendarIcon, Users, Shield, List, LayoutGrid } from "lucide-react";
```

- [ ] **Step 6: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 7: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: remove status filter and add sort handler for list view

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Adicionar Ordenação e Toggle UI

**Files:**
- Modify: `src/pages/Pipeline.tsx` (linha 1728-1780, área de filtros)

- [ ] **Step 1: Adicionar Select de ordenação**

Após o Select de "Responsável" (aproximadamente linha 1775), adicionar:

```tsx
              {/* Ordenação */}
              <Select value={`${sortField}-${sortDirection}`} onValueChange={handleSortChange}>
                <SelectTrigger className="h-9 w-[160px] bg-background">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at-desc">Data criação (mais novos)</SelectItem>
                  <SelectItem value="created_at-asc">Data criação (mais antigos)</SelectItem>
                  <SelectItem value="valor-desc">Valor (maior)</SelectItem>
                  <SelectItem value="valor-asc">Valor (menor)</SelectItem>
                  <SelectItem value="nome_lead-asc">Nome (A-Z)</SelectItem>
                  <SelectItem value="nome_lead-desc">Nome (Z-A)</SelectItem>
                </SelectContent>
              </Select>

              {/* Toggle Funil/Lista */}
              <div className="flex border rounded-md overflow-hidden">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4 mr-1" /> Lista
                </Button>
                <Button
                  variant={viewMode === 'funnel' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-none border-l"
                  onClick={() => setViewMode('funnel')}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" /> Funil
                </Button>
              </div>
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: add sort dropdown and funnel/list toggle UI

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Adicionar sortedLeads useMemo e Funções de Seleção

**Files:**
- Modify: `src/pages/Pipeline.tsx` (após filteredLeads useMemo)

- [ ] **Step 1: Adicionar sortedLeads useMemo**

Após o `filteredLeads` useMemo (aproximadamente linha 1137), adicionar:

```typescript
  // Ordenação da lista
  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'valor':
          comparison = (a.valor || 0) - (b.valor || 0);
          break;
        case 'nome_lead':
          comparison = (a.nome_lead || '').localeCompare(b.nome_lead || '');
          break;
        default:
          comparison = 0;
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [filteredLeads, sortField, sortDirection]);
```

- [ ] **Step 2: Adicionar funções de seleção**

Após o `sortedLeads` useMemo, adicionar:

```typescript
  // Funções de seleção
  const handleToggleSelect = useCallback((leadId: string) => {
    setSelectedLeadIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(leadId)) {
        newSet.delete(leadId);
      } else {
        newSet.add(leadId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedLeadIds(new Set(sortedLeads.map(l => l.id)));
    } else {
      setSelectedLeadIds(new Set());
    }
  }, [sortedLeads]);

  const clearSelection = useCallback(() => {
    setSelectedLeadIds(new Set());
  }, []);

  const isAllSelected = sortedLeads.length > 0 && sortedLeads.every(l => selectedLeadIds.has(l.id));
  const isSomeSelected = selectedLeadIds.size > 0;
```

- [ ] **Step 3: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 4: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: add sortedLeads and selection functions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Criar Componente PipelineListRow

**Files:**
- Create: `src/components/PipelineListRow.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
import { Lead } from "@/types/chat";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { memo } from "react";

interface PipelineListRowProps {
  lead: Lead;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  stageName?: string;
  stageColor?: string;
  responsavelName?: string;
  tags: Array<{ id: string; name: string; color: string }>;
}

export const PipelineListRow = memo(({
  lead,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  stageName,
  stageColor,
  responsavelName,
  tags,
}: PipelineListRowProps) => {
  const isHexColor = (color: string) => color?.startsWith('#');

  const formatPhone = (phone: string | null) => {
    if (!phone) return '—';
    return phone;
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div
      className={cn(
        "flex items-center px-3 py-2 text-xs border-b border-border/50 hover:bg-muted/30 transition-colors",
        isSelected && "bg-blue-50/50"
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onSelect}
        className="mr-3"
      />

      {/* Nome */}
      <div className="w-40 min-w-0">
        <span className="font-medium truncate block">{lead.nome_lead || 'Sem nome'}</span>
      </div>

      {/* Telefone */}
      <div className="w-28 text-muted-foreground">
        {formatPhone(lead.telefone_lead)}
      </div>

      {/* Tags */}
      <div className="w-24 flex gap-1 flex-wrap">
        {tags.length > 0 ? (
          tags.slice(0, 2).map(tag => (
            <Badge
              key={tag.id}
              className={cn(
                "text-[9px] px-1 py-0 h-4",
                isHexColor(tag.color) ? "text-white" : ""
              )}
              style={isHexColor(tag.color) ? { backgroundColor: tag.color } : undefined}
            >
              {tag.name}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Etapa */}
      <div className="w-28">
        {stageName ? (
          <Badge
            className={cn(
              "text-[9px] px-1.5 py-0 h-4",
              isHexColor(stageColor || '') ? "text-white" : stageColor
            )}
            style={isHexColor(stageColor || '') ? { backgroundColor: stageColor } : undefined}
          >
            {stageName}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Responsável */}
      <div className="w-24 truncate text-muted-foreground">
        {responsavelName || '—'}
      </div>

      {/* Valor */}
      <div className="w-20 font-medium">
        {formatCurrency(lead.valor)}
      </div>

      {/* Ações */}
      <div className="w-16 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onEdit}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/components/PipelineListRow.tsx
git commit -m "feat: create PipelineListRow component for table view

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Criar Componente BulkActionsBar

**Files:**
- Create: `src/components/BulkActionsBar.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, FolderInput, Tags, Download, Trash2, X } from "lucide-react";

interface BulkActionsBarProps {
  selectedCount: number;
  onAssign: () => void;
  onMoveStage: () => void;
  onTags: () => void;
  onExport: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionsBar({
  selectedCount,
  onAssign,
  onMoveStage,
  onTags,
  onExport,
  onDelete,
  onClear,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3 mb-3">
      <Checkbox checked />
      <span className="text-blue-700 font-medium text-sm">
        {selectedCount} lead{selectedCount > 1 ? 's' : ''} selecionado{selectedCount > 1 ? 's' : ''}
      </span>

      <div className="ml-auto flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="bg-white"
          onClick={onAssign}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          Atribuir
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="bg-white"
          onClick={onMoveStage}
        >
          <FolderInput className="h-3.5 w-3.5 mr-1" />
          Mover Etapa
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="bg-white"
          onClick={onTags}
        >
          <Tags className="h-3.5 w-3.5 mr-1" />
          Tags
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="bg-white"
          onClick={onExport}
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          Exportar
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Excluir
        </Button>
      </div>

      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/components/BulkActionsBar.tsx
git commit -m "feat: create BulkActionsBar component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Criar Dialog de Atribuição em Lote

**Files:**
- Create: `src/components/BulkAssignDialog.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

interface Colaborador {
  user_id: string;
  full_name: string;
}

interface BulkAssignDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
  selectedCount: number;
  colaboradores: Colaborador[];
}

export function BulkAssignDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
  colaboradores,
}: BulkAssignDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (!selectedUserId) return;
    setIsLoading(true);
    try {
      await onConfirm(selectedUserId);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atribuir Responsável</DialogTitle>
          <DialogDescription>
            Selecione um responsável para os {selectedCount} leads selecionados.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um colaborador" />
          </SelectTrigger>
          <SelectContent>
            {colaboradores.map((c) => (
              <SelectItem key={c.user_id} value={c.user_id}>
                {c.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedUserId || isLoading}>
            {isLoading ? "Atribuindo..." : "Atribuir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/components/BulkAssignDialog.tsx
git commit -m "feat: create BulkAssignDialog component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Criar Dialog de Mover Etapa em Lote

**Files:**
- Create: `src/components/BulkMoveDialog.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Stage {
  id: string;
  title: string;
  color: string;
}

interface BulkMoveDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (stageId: string) => Promise<void>;
  selectedCount: number;
  stages: Stage[];
}

export function BulkMoveDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
  stages,
}: BulkMoveDialogProps) {
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const isHexColor = (color: string) => color?.startsWith('#');

  const handleConfirm = async () => {
    if (!selectedStageId) return;
    setIsLoading(true);
    try {
      await onConfirm(selectedStageId);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover para Etapa</DialogTitle>
          <DialogDescription>
            Selecione a etapa de destino para os {selectedCount} leads selecionados.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedStageId} onValueChange={setSelectedStageId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma etapa" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full",
                      !isHexColor(stage.color) && stage.color
                    )}
                    style={isHexColor(stage.color) ? { backgroundColor: stage.color } : undefined}
                  />
                  {stage.title}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedStageId || isLoading}>
            {isLoading ? "Movendo..." : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/components/BulkMoveDialog.tsx
git commit -m "feat: create BulkMoveDialog component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Criar Dialog de Tags em Lote

**Files:**
- Create: `src/components/BulkTagsDialog.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface BulkTagsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (tagIds: string[], mode: 'add' | 'remove') => Promise<void>;
  selectedCount: number;
  availableTags: Tag[];
}

export function BulkTagsDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
  availableTags,
}: BulkTagsDialogProps) {
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [isLoading, setIsLoading] = useState(false);

  const isHexColor = (color: string) => color?.startsWith('#');

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tagId)) {
        newSet.delete(tagId);
      } else {
        newSet.add(tagId);
      }
      return newSet;
    });
  };

  const handleConfirm = async () => {
    if (selectedTagIds.size === 0) return;
    setIsLoading(true);
    try {
      await onConfirm(Array.from(selectedTagIds), mode);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerenciar Tags</DialogTitle>
          <DialogDescription>
            Adicione ou remova tags dos {selectedCount} leads selecionados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === 'add' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('add')}
          >
            Adicionar
          </Button>
          <Button
            variant={mode === 'remove' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('remove')}
          >
            Remover
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          {availableTags.map((tag) => (
            <Badge
              key={tag.id}
              className={cn(
                "cursor-pointer transition-opacity",
                selectedTagIds.has(tag.id) ? "opacity-100" : "opacity-50",
                isHexColor(tag.color) ? "text-white" : ""
              )}
              style={isHexColor(tag.color) ? { backgroundColor: tag.color } : undefined}
              onClick={() => toggleTag(tag.id)}
            >
              {selectedTagIds.has(tag.id) && "✓ "} {tag.name}
            </Badge>
          ))}
        </div>

        {availableTags.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma tag disponível
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedTagIds.size === 0 || isLoading}
          >
            {isLoading ? "Salvando..." : mode === 'add' ? "Adicionar" : "Remover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/components/BulkTagsDialog.tsx
git commit -m "feat: create BulkTagsDialog component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Criar Dialog de Exportação

**Files:**
- Create: `src/components/ExportDialog.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (mode: 'selected' | 'filtered' | 'all') => Promise<void>;
  selectedCount: number;
  filteredCount: number;
  totalCount: number;
}

export function ExportDialog({
  open,
  onClose,
  onExport,
  selectedCount,
  filteredCount,
  totalCount,
}: ExportDialogProps) {
  const [exportMode, setExportMode] = useState<'selected' | 'filtered' | 'all'>(
    selectedCount > 0 ? 'selected' : 'filtered'
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    setIsLoading(true);
    try {
      await onExport(exportMode);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar Leads</DialogTitle>
          <DialogDescription>
            Escolha quais leads deseja exportar para Excel.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={exportMode}
          onValueChange={(v) => setExportMode(v as 'selected' | 'filtered' | 'all')}
          className="space-y-3"
        >
          {selectedCount > 0 && (
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="selected" id="selected" />
              <Label htmlFor="selected" className="cursor-pointer">
                <span className="font-medium">{selectedCount} selecionados</span>
                <span className="text-muted-foreground ml-2">leads marcados na lista</span>
              </Label>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <RadioGroupItem value="filtered" id="filtered" />
            <Label htmlFor="filtered" className="cursor-pointer">
              <span className="font-medium">{filteredCount} da filtragem atual</span>
              <span className="text-muted-foreground ml-2">leads visíveis</span>
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="all" />
            <Label htmlFor="all" className="cursor-pointer">
              <span className="font-medium">Todos do funil ({totalCount})</span>
              <span className="text-muted-foreground ml-2">todos os leads</span>
            </Label>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={isLoading}>
            {isLoading ? "Exportando..." : "Exportar Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/components/ExportDialog.tsx
git commit -m "feat: create ExportDialog component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Adicionar Funções de Ação em Lote no Pipeline

**Files:**
- Modify: `src/pages/Pipeline.tsx` (após as funções de seleção)

- [ ] **Step 1: Adicionar estados dos dialogs**

Após as funções de seleção (após `const isSomeSelected`), adicionar:

```typescript
  // Estados dos dialogs de ação em lote
  const [showBulkAssignDialog, setShowBulkAssignDialog] = useState(false);
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [showBulkTagsDialog, setShowBulkTagsDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Buscar tags disponíveis
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
```

- [ ] **Step 2: Adicionar useEffect para carregar tags**

```typescript
  // Carregar tags disponíveis
  useEffect(() => {
    if (!organizationId) return;

    const loadTags = async () => {
      const { data } = await supabase
        .from('lead_tags')
        .select('id, name, color')
        .eq('organization_id', organizationId);

      if (data) setAvailableTags(data);
    };

    loadTags();
  }, [organizationId]);
```

- [ ] **Step 3: Adicionar funções de ação em lote**

```typescript
  // Ações em lote
  const handleBulkAssign = useCallback(async (userId: string) => {
    const ids = Array.from(selectedLeadIds);
    const { error } = await supabase
      .from('leads')
      .update({ responsavel_user_id: userId })
      .in('id', ids);

    if (error) throw error;
    toast.success(`${ids.length} leads atribuídos`);
    clearSelection();
    loadLeads();
  }, [selectedLeadIds, clearSelection, loadLeads]);

  const handleBulkMoveStage = useCallback(async (stageId: string) => {
    const ids = Array.from(selectedLeadIds);
    const updateData = usingCustomFunnel
      ? { funnel_stage_id: stageId }
      : { stage: stageId };

    const { error } = await supabase
      .from('leads')
      .update(updateData)
      .in('id', ids);

    if (error) throw error;
    toast.success(`${ids.length} leads movidos`);
    clearSelection();
    loadLeads();
  }, [selectedLeadIds, usingCustomFunnel, clearSelection, loadLeads]);

  const handleBulkTags = useCallback(async (tagIds: string[], mode: 'add' | 'remove') => {
    const leadIds = Array.from(selectedLeadIds);

    if (mode === 'add') {
      const inserts = leadIds.flatMap(leadId =>
        tagIds.map(tagId => ({
          lead_id: leadId,
          tag_id: tagId,
          organization_id: organizationId,
        }))
      );
      await supabase.from('lead_tag_assignments').insert(inserts);
    } else {
      await supabase
        .from('lead_tag_assignments')
        .delete()
        .in('lead_id', leadIds)
        .in('tag_id', tagIds);
    }

    toast.success(`Tags atualizadas em ${leadIds.length} leads`);
    clearSelection();
    loadLeads();
  }, [selectedLeadIds, organizationId, clearSelection, loadLeads]);

  const handleBulkExport = useCallback(async (mode: 'selected' | 'filtered' | 'all') => {
    let leadsToExport: Lead[];

    if (mode === 'selected') {
      leadsToExport = leads.filter(l => selectedLeadIds.has(l.id));
    } else if (mode === 'filtered') {
      leadsToExport = sortedLeads;
    } else {
      // Buscar todos do funil
      let query = supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organizationId);

      if (usingCustomFunnel && activeFunnel) {
        query = query.eq('funnel_id', activeFunnel.id);
      } else {
        query = query.is('funnel_id', null);
      }

      const { data } = await query;
      leadsToExport = data || [];
    }

    // Gerar Excel
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(
      leadsToExport.map(l => ({
        Nome: l.nome_lead,
        Telefone: l.telefone_lead,
        Email: l.email,
        Valor: l.valor,
        Etapa: l.stage,
        Responsável: l.responsavel,
        Criado_em: new Date(l.created_at).toLocaleString('pt-BR'),
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
    XLSX.writeFile(workbook, `leads_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast.success(`${leadsToExport.length} leads exportados`);
  }, [selectedLeadIds, leads, sortedLeads, organizationId, usingCustomFunnel, activeFunnel]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedLeadIds);
    const { error } = await supabase
      .from('leads')
      .delete()
      .in('id', ids);

    if (error) throw error;
    toast.success(`${ids.length} leads excluídos`);
    clearSelection();
    loadLeads();
  }, [selectedLeadIds, clearSelection, loadLeads]);
```

- [ ] **Step 4: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -10`
Expected: Build success

- [ ] **Step 5: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: add bulk action functions to Pipeline

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Integrar Tabela e Ações no Render

**Files:**
- Modify: `src/pages/Pipeline.tsx` (área de render, após TabsContent)

- [ ] **Step 1: Adicionar imports dos novos componentes**

No topo do arquivo, adicionar:

```typescript
import { PipelineListRow } from "@/components/PipelineListRow";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { BulkAssignDialog } from "@/components/BulkAssignDialog";
import { BulkMoveDialog } from "@/components/BulkMoveDialog";
import { BulkTagsDialog } from "@/components/BulkTagsDialog";
import { ExportDialog } from "@/components/ExportDialog";
import { Checkbox } from "@/components/ui/checkbox";
```

- [ ] **Step 2: Adicionar renderização condicional**

Dentro do TabsContent, após o scroll container div, adicionar condição para lista:

Localizar `{stages.map((stage) => {` e envolver com condição:

```tsx
              {viewMode === 'funnel' ? (
                // Funil existente
                stages.map((stage) => {
                  const stageLeads = leadsByStage.get(stage.id) || [];
                  return (
                    <PipelineColumn
                      key={`${selectedFunnelId}-${stage.id}`}
                      // ... props existentes
                    />
                  );
                })
              ) : (
                // Visão Lista
                <div className="w-full">
                  <BulkActionsBar
                    selectedCount={selectedLeadIds.size}
                    onAssign={() => setShowBulkAssignDialog(true)}
                    onMoveStage={() => setShowBulkMoveDialog(true)}
                    onTags={() => setShowBulkTagsDialog(true)}
                    onExport={() => setShowExportDialog(true)}
                    onDelete={() => setShowBulkDeleteConfirm(true)}
                    onClear={clearSelection}
                  />

                  {/* Tabela */}
                  <div className="border rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="bg-muted/50 flex items-center px-3 py-2.5 text-xs font-medium text-muted-foreground border-b">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={handleSelectAll}
                        className="mr-3"
                      />
                      <span className="w-40">Nome</span>
                      <span className="w-28">Telefone</span>
                      <span className="w-24">Tag</span>
                      <span className="w-28">Etapa</span>
                      <span className="w-24">Resp.</span>
                      <span className="w-20">Valor</span>
                      <span className="w-16">Ações</span>
                    </div>

                    {/* Rows */}
                    {sortedLeads.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        Nenhum lead encontrado
                      </div>
                    ) : (
                      sortedLeads.map((lead) => {
                        const stage = stages.find(s =>
                          usingCustomFunnel ? s.id === lead.funnel_stage_id : s.id === (lead.stage || "NOVO")
                        );
                        return (
                          <PipelineListRow
                            key={lead.id}
                            lead={lead}
                            isSelected={selectedLeadIds.has(lead.id)}
                            onSelect={() => handleToggleSelect(lead.id)}
                            onEdit={() => setEditingLead(lead)}
                            onDelete={() => handleDeleteLead(lead)}
                            stageName={stage?.title}
                            stageColor={stage?.color}
                            responsavelName={lead.responsavel_user_id ? profilesMap[lead.responsavel_user_id]?.full_name : undefined}
                            tags={leadTagsMap[lead.id] || []}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              )}
```

- [ ] **Step 3: Adicionar dialogs no final do componente**

Após os dialogs existentes, adicionar:

```tsx
      {/* Dialogs de Ação em Lote */}
      <BulkAssignDialog
        open={showBulkAssignDialog}
        onClose={() => setShowBulkAssignDialog(false)}
        onConfirm={handleBulkAssign}
        selectedCount={selectedLeadIds.size}
        colaboradores={colaboradores}
      />

      <BulkMoveDialog
        open={showBulkMoveDialog}
        onClose={() => setShowBulkMoveDialog(false)}
        onConfirm={handleBulkMoveStage}
        selectedCount={selectedLeadIds.size}
        stages={stages}
      />

      <BulkTagsDialog
        open={showBulkTagsDialog}
        onClose={() => setShowBulkTagsDialog(false)}
        onConfirm={handleBulkTags}
        selectedCount={selectedLeadIds.size}
        availableTags={availableTags}
      />

      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onExport={handleBulkExport}
        selectedCount={selectedLeadIds.size}
        filteredCount={sortedLeads.length}
        totalCount={Object.values(stagePagination).reduce((sum, s) => sum + s.totalCount, 0)}
      />

      {/* Confirmação de Exclusão em Lote */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Leads</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedLeadIds.size} leads?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowBulkDeleteConfirm(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                handleBulkDelete();
                setShowBulkDeleteConfirm(false);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 4: Verificar que o código compila**

Run: `npm run build 2>&1 | tail -15`
Expected: Build success

- [ ] **Step 5: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: integrate list view and bulk actions in Pipeline

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 13: Testar Localmente

**Files:**
- Nenhum arquivo a modificar

- [ ] **Step 1: Iniciar servidor de desenvolvimento**

Run: `npm run dev`

- [ ] **Step 2: Abrir navegador e navegar para o pipeline**

Abrir: `http://localhost:8080/pipeline`

- [ ] **Step 3: Verificar funcionalidades**

1. Toggle Funil/Lista funciona
2. Tabela mostra leads com colunas corretas
3. Checkbox seleciona/desseleciona leads
4. Checkbox header seleciona todos
5. Barra de ações aparece com seleção
6. Dialog de Atribuir funciona
7. Dialog de Mover Etapa funciona
8. Dialog de Tags funciona
9. Dialog de Exportar funciona
10. Excluir funciona com confirmação
11. Ordenação por data/valor/nome funciona

---

## Summary

Este plano implementa visão de lista com seleção múltipla no Pipeline:

| Task | Descrição |
|------|-----------|
| 1 | Estados de viewMode e seleção |
| 2 | Remover filtro status, adicionar ordenação |
| 3 | UI do toggle e dropdown de ordenação |
| 4 | sortedLeads e funções de seleção |
| 5 | Componente PipelineListRow |
| 6 | Componente BulkActionsBar |
| 7 | Dialog de Atribuição |
| 8 | Dialog de Mover Etapa |
| 9 | Dialog de Tags |
| 10 | Dialog de Exportação |
| 11 | Funções de ação em lote |
| 12 | Integração no render |
| 13 | Teste local |

## Critérios de Aceitação

- [ ] Filtro "Todos os Status" removido
- [ ] Toggle Funil/Lista funciona
- [ ] Tabela mostra colunas: Nome, Telefone, Tag, Etapa, Resp., Valor
- [ ] Checkboxes para seleção individual
- [ ] Checkbox header seleciona todos
- [ ] Barra de ações aparece com seleção
- [ ] Ação "Atribuir" abre dialog com colaboradores
- [ ] Ação "Mover Etapa" abre dialog com etapas
- [ ] Ação "Tags" abre dialog para gerenciar tags
- [ ] Ação "Exportar" oferece opções
- [ ] Ação "Excluir" pede confirmação
- [ ] Ordenação funciona (data, valor, nome)
