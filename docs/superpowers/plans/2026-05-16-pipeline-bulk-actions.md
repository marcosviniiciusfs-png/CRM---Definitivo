# Ações em massa no Pipeline lista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 5 ações em massa na barra de seleção da visão Lista do Pipeline: selecionar por etapa, mover etapa, atribuir colaborador (sobrescreve), adicionar nota e excluir.

**Architecture:** 3 novos dialogs (`BulkMoveStageDialog`, `BulkAddNoteDialog`, `BulkDeleteDialog`) + reaproveita `BulkAssignDialog` existente. `src/pages/Pipeline.tsx` ganha 5 handlers, 4 states de dialog e atualiza o JSX da barra de seleção (desktop e mobile) para renderizar os botões gateados por permissão.

**Tech Stack:** React + TypeScript, shadcn/ui (Dialog, AlertDialog, DropdownMenu, Button, Textarea, Select), Supabase JS client, sonner (toast).

**Spec:** [docs/superpowers/specs/2026-05-16-pipeline-bulk-actions-design.md](../specs/2026-05-16-pipeline-bulk-actions-design.md)

**Note about testing:** Este projeto **não tem infra de testes unitários** (sem vitest/jest, nenhum `*.test.tsx`, sem script `test` em `package.json`). Verificações usam `npm run lint`, `npm run build` e teste manual no browser. Onde digo "verifique", o engenheiro deve rodar o comando e confirmar o output antes de marcar o passo concluído.

**Pre-conditions assumidas:**
- Pipeline.tsx já tem `colaboradores: any[]` populado via React Query ([Pipeline.tsx:107](../../../src/pages/Pipeline.tsx#L107)) — array de `{ user_id, full_name, ... }`.
- `selectedLeadIds: Set<string>` já existe ([Pipeline.tsx:175](../../../src/pages/Pipeline.tsx#L175)).
- `filteredLeads` é o array de leads visíveis filtrado por funil + filtros do usuário.
- `stages` é o array de etapas do funil atual.
- `permissions` vem do `usePermissions()` hook com booleans `canMoveLeadsPipeline`, `canAssignLeads`, `canDeleteLeads`.
- `user` é o usuário logado (com `user.id`).
- Trigger `sync_responsavel_user_id` existe em produção (BEFORE INSERT/UPDATE em `leads`): repopula `responsavel` (texto) a partir de `responsavel_user_id` quando o texto é NULL.

---

## File Map

**Novos:**
- `src/components/BulkMoveStageDialog.tsx` — dialog com dropdown das etapas do funil atual + confirm
- `src/components/BulkAddNoteDialog.tsx` — dialog com textarea + confirm
- `src/components/BulkDeleteDialog.tsx` — confirm dialog simples "Excluir N leads?"

**Modificados:**
- `src/pages/Pipeline.tsx` — 5 handlers + 4 states de dialog + 5 botões na barra desktop (linha ~2079-2089) + 5 botões na barra mobile (linha ~1975-1986) + 4 dialogs renderizados após o `</DndContext>`

**Não tocar:**
- `src/components/BulkAssignDialog.tsx` — interface atual já serve (props: `open`, `onClose`, `onConfirm(userId)`, `selectedCount`, `colaboradores`).

---

## Task 1: Componente `BulkMoveStageDialog`

**Files:**
- Create: `src/components/BulkMoveStageDialog.tsx`

- [ ] **Step 1.1: Criar o arquivo**

```bash
touch src/components/BulkMoveStageDialog.tsx
```

- [ ] **Step 1.2: Escrever o componente**

Conteúdo de `src/components/BulkMoveStageDialog.tsx`:

```tsx
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
import { Loader2 } from "lucide-react";

interface Stage {
  id: string;
  title: string;
}

interface BulkMoveStageDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (stageId: string) => Promise<void>;
  selectedCount: number;
  stages: Stage[];
}

export function BulkMoveStageDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
  stages,
}: BulkMoveStageDialogProps) {
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (!selectedStageId) return;
    setIsLoading(true);
    try {
      await onConfirm(selectedStageId);
      setSelectedStageId("");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover etapa</DialogTitle>
          <DialogDescription>
            Selecione a etapa de destino para os {selectedCount} leads selecionados.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedStageId} onValueChange={setSelectedStageId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma etapa" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedStageId || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 1.3: Verificar build do componente isolado**

Run:
```bash
npm run lint -- src/components/BulkMoveStageDialog.tsx
```

Expected: 0 erros, 0 warnings novos sobre este arquivo.

- [ ] **Step 1.4: Commit**

```bash
git add src/components/BulkMoveStageDialog.tsx
git commit -m "feat(pipeline-bulk): BulkMoveStageDialog component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Componente `BulkAddNoteDialog`

**Files:**
- Create: `src/components/BulkAddNoteDialog.tsx`

- [ ] **Step 2.1: Criar o arquivo**

```bash
touch src/components/BulkAddNoteDialog.tsx
```

- [ ] **Step 2.2: Escrever o componente**

Conteúdo de `src/components/BulkAddNoteDialog.tsx`:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface BulkAddNoteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (content: string) => Promise<void>;
  selectedCount: number;
}

export function BulkAddNoteDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
}: BulkAddNoteDialogProps) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setIsLoading(true);
    try {
      await onConfirm(trimmed);
      setContent("");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar nota</DialogTitle>
          <DialogDescription>
            A nota será salva no histórico de cada um dos {selectedCount} leads selecionados.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Digite a nota..."
          rows={5}
          autoFocus
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!content.trim() || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar nota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2.3: Verificar build do componente isolado**

```bash
npm run lint -- src/components/BulkAddNoteDialog.tsx
```

Expected: 0 erros novos.

Caso `Textarea` não exista em `src/components/ui/`, criar via shadcn ou substituir por `<textarea className="...">` standard com classes equivalentes a `Input`. Verificar antes de prosseguir: `ls src/components/ui/textarea.tsx`. Se não existir, rodar `npx shadcn-ui@latest add textarea` (ou copiar o componente de `Input` adaptando para `<textarea>`).

- [ ] **Step 2.4: Commit**

```bash
git add src/components/BulkAddNoteDialog.tsx
git commit -m "feat(pipeline-bulk): BulkAddNoteDialog component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Componente `BulkDeleteDialog`

**Files:**
- Create: `src/components/BulkDeleteDialog.tsx`

- [ ] **Step 3.1: Criar o arquivo**

```bash
touch src/components/BulkDeleteDialog.tsx
```

- [ ] **Step 3.2: Escrever o componente**

Conteúdo de `src/components/BulkDeleteDialog.tsx`:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface BulkDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  selectedCount: number;
}

export function BulkDeleteDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
}: BulkDeleteDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {selectedCount} lead(s)?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. Os leads selecionados serão excluídos permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm(); }}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Excluir definitivamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 3.3: Verificar build do componente isolado**

```bash
npm run lint -- src/components/BulkDeleteDialog.tsx
```

Expected: 0 erros novos.

- [ ] **Step 3.4: Commit**

```bash
git add src/components/BulkDeleteDialog.tsx
git commit -m "feat(pipeline-bulk): BulkDeleteDialog component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Pipeline.tsx — imports, states e handlers

**Files:**
- Modify: `src/pages/Pipeline.tsx`

- [ ] **Step 4.1: Adicionar imports dos 3 novos dialogs**

Em `src/pages/Pipeline.tsx`, localizar a seção de imports (linhas 1-46). Adicionar logo abaixo do import do `ImportLeadsModal` (linha 38):

```tsx
import { BulkAssignDialog } from "@/components/BulkAssignDialog";
import { BulkMoveStageDialog } from "@/components/BulkMoveStageDialog";
import { BulkAddNoteDialog } from "@/components/BulkAddNoteDialog";
import { BulkDeleteDialog } from "@/components/BulkDeleteDialog";
```

E adicionar os ícones que vão aparecer nos botões. Localizar o import do lucide-react (linha 16) e adicionar `ArrowRight, UserCog, MessageSquarePlus, Trash2, Filter` à lista de ícones já importados:

```tsx
import { Settings2, Search, Plus, Download, Upload, CalendarIcon, Users, Shield, LayoutGrid, List, Check, Lock, Unlock, Pencil, MoreVertical, SlidersHorizontal, X, ArrowRight, UserCog, MessageSquarePlus, Trash2, Filter } from "lucide-react";
```

- [ ] **Step 4.2: Adicionar states dos 4 dialogs**

Localizar a declaração de `selectedLeadIds` (linha ~175) e adicionar logo abaixo, antes de qualquer `useEffect`:

```tsx
  // Bulk action dialogs
  const [bulkMoveStageOpen, setBulkMoveStageOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAddNoteOpen, setBulkAddNoteOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
```

- [ ] **Step 4.3: Adicionar os 5 handlers**

Localizar `confirmDeleteLead` (linha ~1428). Adicionar **logo após** o fim dessa função (depois do `};` de fechamento), antes de `handleWonConfirmation`:

```tsx
  // ========== BULK ACTIONS (Lista) ==========

  const handleSelectByStage = useCallback((stageId: string) => {
    const ids = filteredLeads
      .filter(l => (l.funnel_stage_id || l.stage) === stageId)
      .map(l => l.id);
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
    toast.success(`${ids.length} lead(s) adicionado(s) à seleção`);
  }, [filteredLeads]);

  const handleBulkMoveStage = useCallback(async (stageId: string) => {
    const ids = Array.from(selectedLeadIds);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase
        .from('leads')
        .update({ funnel_stage_id: stageId, stage: stageId })
        .in('id', ids);
      if (error) {
        toast.error('Erro ao mover leads: ' + error.message);
        return;
      }
      setLeads(prev => prev.map(l =>
        selectedLeadIds.has(l.id) ? { ...l, funnel_stage_id: stageId, stage: stageId } : l
      ));
      toast.success(`${ids.length} lead(s) movido(s)`);
      setSelectedLeadIds(new Set());
    } catch (err: any) {
      toast.error('Erro inesperado ao mover leads');
    }
  }, [selectedLeadIds]);

  const handleBulkAssign = useCallback(async (userId: string) => {
    const ids = Array.from(selectedLeadIds);
    if (ids.length === 0) return;
    try {
      // Zerar responsavel (texto) para o trigger sync_responsavel_user_id repopular
      const { error } = await supabase
        .from('leads')
        .update({ responsavel_user_id: userId, responsavel: null })
        .in('id', ids);
      if (error) {
        toast.error('Erro ao atribuir leads: ' + error.message);
        return;
      }
      toast.success(`${ids.length} lead(s) atribuído(s)`);
      setSelectedLeadIds(new Set());
      // Forçar refetch para ver o nome novo do responsável (trigger atualizou no banco)
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
    } catch (err: any) {
      toast.error('Erro inesperado ao atribuir leads');
    }
  }, [selectedLeadIds, queryClient]);

  const handleBulkAddNote = useCallback(async (content: string) => {
    const ids = Array.from(selectedLeadIds);
    if (ids.length === 0 || !user?.id) return;
    try {
      const rows = ids.map(lead_id => ({
        lead_id,
        user_id: user.id,
        activity_type: 'note',
        content,
      }));
      const { error } = await supabase.from('lead_activities').insert(rows);
      if (error) {
        toast.error('Erro ao adicionar nota: ' + error.message);
        return;
      }
      toast.success(`Nota adicionada em ${ids.length} lead(s)`);
      setSelectedLeadIds(new Set());
    } catch (err: any) {
      toast.error('Erro inesperado ao adicionar nota');
    }
  }, [selectedLeadIds, user?.id]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedLeadIds);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase.from('leads').delete().in('id', ids);
      if (error) {
        toast.error('Erro ao excluir leads: ' + error.message);
        return;
      }
      setLeads(prev => prev.filter(l => !selectedLeadIds.has(l.id)));
      toast.success(`${ids.length} lead(s) excluído(s)`);
      setSelectedLeadIds(new Set());
    } catch (err: any) {
      toast.error('Erro inesperado ao excluir leads');
    }
  }, [selectedLeadIds]);
```

**Importante:** verifique que `queryClient` já está disponível no escopo do componente. Se não, adicionar no topo do componente:

```tsx
const queryClient = useQueryClient();
```

(Já está importado de `@tanstack/react-query` na linha 7. Pode já existir uma instância — buscar `useQueryClient()` no arquivo antes de adicionar duplicado.)

- [ ] **Step 4.4: Verificar lint**

```bash
npm run lint
```

Expected: 0 erros novos em `src/pages/Pipeline.tsx`.

- [ ] **Step 4.5: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat(pipeline-bulk): adicionar states e handlers das 5 acoes em massa

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Pipeline.tsx — barra de seleção desktop

**Files:**
- Modify: `src/pages/Pipeline.tsx:2079-2089` (bloco `Desktop List View` da barra de seleção)

- [ ] **Step 5.1: Substituir o bloco da barra desktop**

Localizar o bloco que começa em ~linha 2079:

```tsx
            {selectedLeadIds.size > 0 && (
              <div className="bg-primary/10 dark:bg-primary/20 border-b border-primary/20 dark:border-primary/30 p-3 flex items-center gap-3">
                <span className="text-sm font-medium text-primary">
                  {selectedLeadIds.size} lead{selectedLeadIds.size > 1 ? 's' : ''} selecionado{selectedLeadIds.size > 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="outline" size="sm" onClick={() => setSelectedLeadIds(new Set())}>
                    Limpar seleção
                  </Button>
                </div>
              </div>
            )}
```

E **substituir** por:

```tsx
            {selectedLeadIds.size > 0 && (
              <div className="bg-primary/10 dark:bg-primary/20 border-b border-primary/20 dark:border-primary/30 p-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-primary">
                  {selectedLeadIds.size} lead{selectedLeadIds.size > 1 ? 's' : ''} selecionado{selectedLeadIds.size > 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {/* Selecionar por etapa */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Filter className="h-4 w-4 mr-1" />
                        Selecionar etapa
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                      {stages.map(s => (
                        <DropdownMenuItem key={s.id} onClick={() => handleSelectByStage(s.id)}>
                          {s.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Mover etapa */}
                  {permissions.canMoveLeadsPipeline && (
                    <Button variant="outline" size="sm" onClick={() => setBulkMoveStageOpen(true)}>
                      <ArrowRight className="h-4 w-4 mr-1" />
                      Mover etapa
                    </Button>
                  )}

                  {/* Atribuir */}
                  {permissions.canAssignLeads && (
                    <Button variant="outline" size="sm" onClick={() => setBulkAssignOpen(true)}>
                      <UserCog className="h-4 w-4 mr-1" />
                      Atribuir
                    </Button>
                  )}

                  {/* Adicionar nota */}
                  <Button variant="outline" size="sm" onClick={() => setBulkAddNoteOpen(true)}>
                    <MessageSquarePlus className="h-4 w-4 mr-1" />
                    Nota
                  </Button>

                  {/* Excluir */}
                  {permissions.canDeleteLeads && (
                    <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Excluir
                    </Button>
                  )}

                  {/* Limpar seleção */}
                  <Button variant="ghost" size="sm" onClick={() => setSelectedLeadIds(new Set())}>
                    Limpar seleção
                  </Button>
                </div>
              </div>
            )}
```

- [ ] **Step 5.2: Lint**

```bash
npm run lint
```

Expected: 0 erros novos.

- [ ] **Step 5.3: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat(pipeline-bulk): barra de selecao desktop com 5 botoes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Pipeline.tsx — barra de seleção mobile

**Files:**
- Modify: `src/pages/Pipeline.tsx:1975-1986` (bloco `Mobile List View` da barra de seleção)

- [ ] **Step 6.1: Substituir o bloco da barra mobile**

Localizar o bloco que começa em ~linha 1975:

```tsx
              {selectedLeadIds.size > 0 && (
                <div className="bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30 rounded-lg p-3 flex items-center gap-3">
                  <span className="text-sm font-medium text-primary">
                    {selectedLeadIds.size} lead{selectedLeadIds.size > 1 ? 's' : ''} selecionado{selectedLeadIds.size > 1 ? 's' : ''}
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <Button variant="outline" size="sm" onClick={() => setSelectedLeadIds(new Set())}>
                      Limpar
                    </Button>
                  </div>
                </div>
              )}
```

E **substituir** por:

```tsx
              {selectedLeadIds.size > 0 && (
                <div className="bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30 rounded-lg p-2.5 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-primary">
                    {selectedLeadIds.size} selecionado{selectedLeadIds.size > 1 ? 's' : ''}
                  </span>
                  <div className="flex items-center gap-1 ml-auto flex-wrap">
                    {/* Selecionar por etapa */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Selecionar por etapa">
                          <Filter className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                        {stages.map(s => (
                          <DropdownMenuItem key={s.id} onClick={() => handleSelectByStage(s.id)}>
                            {s.title}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {permissions.canMoveLeadsPipeline && (
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Mover etapa"
                        onClick={() => setBulkMoveStageOpen(true)}>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {permissions.canAssignLeads && (
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Atribuir"
                        onClick={() => setBulkAssignOpen(true)}>
                        <UserCog className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Adicionar nota"
                      onClick={() => setBulkAddNoteOpen(true)}>
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                    </Button>

                    {permissions.canDeleteLeads && (
                      <Button variant="destructive" size="sm" className="h-8 w-8 p-0" title="Excluir"
                        onClick={() => setBulkDeleteOpen(true)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs"
                      onClick={() => setSelectedLeadIds(new Set())}>
                      Limpar
                    </Button>
                  </div>
                </div>
              )}
```

- [ ] **Step 6.2: Lint**

```bash
npm run lint
```

Expected: 0 erros novos.

- [ ] **Step 6.3: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat(pipeline-bulk): barra de selecao mobile com 5 botoes icon-only

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Pipeline.tsx — renderizar os 4 dialogs

**Files:**
- Modify: `src/pages/Pipeline.tsx` (perto do final do JSX retornado pelo componente, ANTES do último `</div>` do retorno principal)

- [ ] **Step 7.1: Localizar onde renderizar**

Buscar pelo padrão `<EditLeadModal` ou `<LeadDetailsDialog` no JSX (componentes de modal já renderizados pelo Pipeline). Os 4 novos dialogs devem ficar **junto** desses modals — geralmente próximo ao final do return, antes do último fechamento de `</div>` e do fim da função.

Se houver dificuldade em localizar, basta colar **imediatamente antes** do `<ImportLeadsModal ... />` que já é renderizado no Pipeline.

- [ ] **Step 7.2: Adicionar o bloco dos 4 dialogs**

Conteúdo a colar:

```tsx
      {/* Bulk action dialogs */}
      <BulkMoveStageDialog
        open={bulkMoveStageOpen}
        onClose={() => setBulkMoveStageOpen(false)}
        onConfirm={handleBulkMoveStage}
        selectedCount={selectedLeadIds.size}
        stages={stages.map(s => ({ id: s.id, title: s.title }))}
      />

      <BulkAssignDialog
        open={bulkAssignOpen}
        onClose={() => setBulkAssignOpen(false)}
        onConfirm={handleBulkAssign}
        selectedCount={selectedLeadIds.size}
        colaboradores={(colaboradores || [])
          .filter((c: any) => c.is_active !== false && c.user_id)
          .map((c: any) => ({ user_id: c.user_id, full_name: c.full_name || c.email || 'Colaborador' }))
        }
      />

      <BulkAddNoteDialog
        open={bulkAddNoteOpen}
        onClose={() => setBulkAddNoteOpen(false)}
        onConfirm={handleBulkAddNote}
        selectedCount={selectedLeadIds.size}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        selectedCount={selectedLeadIds.size}
      />
```

**Atenção ao tipo de `stages`:** o array `stages` no Pipeline tem mais campos que só `id` e `title` (cor, etc). O `.map` acima extrai só os 2 campos que `BulkMoveStageDialog` precisa. Se o TypeScript reclamar do shape do `stages` (por exemplo, se um stage não tem `title` mas tem `name`), ajustar o `.map` para `s.title || s.name || 'Etapa'`.

- [ ] **Step 7.3: Verificar lint**

```bash
npm run lint
```

Expected: 0 erros novos.

- [ ] **Step 7.4: Build local**

```bash
npm run build
```

Expected: build completa sem erro de TypeScript. Caso tenha erro, ajustar conforme mensagem (provavelmente tipagem do `colaboradores` ou `stages`).

- [ ] **Step 7.5: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat(pipeline-bulk): renderizar os 4 dialogs de acoes em massa

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Verificação manual end-to-end (golden path)

**Files:** nenhum — só execução e verificação.

- [ ] **Step 8.1: Subir dev server**

```bash
npm run dev
```

Esperar até "ready" e abrir `http://localhost:5173/pipeline` (ou porta configurada).

- [ ] **Step 8.2: Preparar dados de teste**

Logado como owner de uma org de teste:
1. Garantir ≥10 leads no funil padrão, distribuídos em ≥3 etapas distintas.
2. Garantir ≥2 colaboradores ativos na org.
3. Ir em **Pipeline → Lista**.

- [ ] **Step 8.3: Testar "Selecionar etapa"**

- Marcar 1 lead manualmente. Barra azul aparece com 1 selecionado.
- Clicar em **"Selecionar etapa"** → escolher uma etapa que tem 5 leads.
- Verificar: barra mostra "6 leads selecionados", os 5 leads daquela etapa ficam highlighted.

- [ ] **Step 8.4: Testar "Mover etapa"**

- Com seleção ativa, clicar em **"Mover etapa"** → escolher outra etapa → "Mover".
- Verificar: toast "N lead(s) movido(s)", seleção limpa, ao trocar pra Funil, os leads aparecem na etapa nova.

- [ ] **Step 8.5: Testar "Atribuir"**

- Selecionar 3 leads (qualquer), clicar **"Atribuir"** → escolher um colaborador → "Atribuir".
- Verificar: toast, coluna "Responsável" atualiza após o refetch.
- Repetir com OUTRO colaborador nos mesmos 3 leads — confirma que sobrescreve (não acumula).

- [ ] **Step 8.6: Testar "Adicionar nota"**

- Selecionar 2 leads, clicar **"Nota"** → digitar "Teste follow-up" → "Salvar nota".
- Verificar: toast.
- Abrir cada um dos 2 leads em detalhes → ver a nota "Teste follow-up" no histórico com nome do usuário logado.

- [ ] **Step 8.7: Testar "Excluir"**

- Selecionar 2 leads de teste (criar leads dummy primeiro se necessário) → clicar **"Excluir"**.
- Confirm dialog aparece: "Excluir 2 lead(s)?"
- "Cancelar" → dialog fecha sem efeito (leads continuam).
- Repetir: "Excluir definitivamente" → toast, leads somem da lista.

- [ ] **Step 8.8: Testar permissões**

- Logar como um **member** sem permissão de mover/atribuir/excluir.
- Selecionar leads na visão Lista.
- Verificar: barra mostra apenas "Selecionar etapa", "Nota" e "Limpar" — botões de mover/atribuir/excluir **não aparecem**.

- [ ] **Step 8.9: Testar mobile**

- Abrir DevTools → simular viewport mobile (375px ou similar).
- Repetir Steps 8.3-8.7 em mobile.
- Verificar: barra fica com ícones apenas, sem texto. Tooltips funcionam ao hover.

- [ ] **Step 8.10: Commit (se houve ajustes finais durante teste)**

Se durante a verificação manual ajustes foram feitos:

```bash
git add src/pages/Pipeline.tsx src/components/Bulk*Dialog.tsx
git commit -m "fix(pipeline-bulk): ajustes finais pos verificacao manual

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Resumo dos commits esperados

1. `feat(pipeline-bulk): BulkMoveStageDialog component`
2. `feat(pipeline-bulk): BulkAddNoteDialog component`
3. `feat(pipeline-bulk): BulkDeleteDialog component`
4. `feat(pipeline-bulk): adicionar states e handlers das 5 acoes em massa`
5. `feat(pipeline-bulk): barra de selecao desktop com 5 botoes`
6. `feat(pipeline-bulk): barra de selecao mobile com 5 botoes icon-only`
7. `feat(pipeline-bulk): renderizar os 4 dialogs de acoes em massa`
8. *(opcional)* `fix(pipeline-bulk): ajustes finais pos verificacao manual`

Total: 7-8 commits, todos no `main` (ou em uma feature branch — escolha do executor). Sem testes unitários (projeto não tem infra).
