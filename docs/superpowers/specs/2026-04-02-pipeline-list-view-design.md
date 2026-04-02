# Visão de Lista no Pipeline - Design Document

**Data:** 2026-04-02
**Status:** Aprovado
**Autor:** Claude

## Problema

O funil de vendas atual só permite visão Kanban. Usuários precisam:
1. Selecionar múltiplos leads de uma vez
2. Executar ações em lote (atribuir, mover, tags, exportar, excluir)
3. Ver leads em formato de tabela para comparação rápida

Além disso, o filtro "Todos os Status" é confuso pois se sobrepõe às etapas do funil.

## Solução

Adicionar toggle entre visão Funil (Kanban) e Lista (tabela) no Pipeline. Na visão lista, permitir seleção múltipla com checkboxes e barra de ações em lote. Remover filtro "Todos os Status".

## Especificações Técnicas

### 1. Novo Estado

```typescript
// Pipeline.tsx - Novo estado
type ViewMode = 'funnel' | 'list';

const [viewMode, setViewMode] = useState<ViewMode>('funnel');
const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
const [sortField, setSortField] = useState<string>('created_at');
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
```

### 2. Mudanças na UI - Filtros

**Remover:**
```tsx
// REMOVER este bloco
<Select value={statusFilter} onValueChange={setStatusFilter}>
  <SelectTrigger>
    <SelectValue placeholder="Status" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Todos os Status</SelectItem>
    ...
  </SelectContent>
</Select>
```

**Adicionar:**
```tsx
// Dropdown de ordenação
<Select value={`${sortField}-${sortDirection}`} onValueChange={handleSortChange}>
  <SelectTrigger className="h-9 w-[160px]">
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

// Toggle Funil/Lista
<div className="flex border rounded-md overflow-hidden">
  <Button
    variant={viewMode === 'list' ? 'default' : 'ghost'}
    size="sm"
    onClick={() => setViewMode('list')}
  >
    <List className="h-4 w-4 mr-1" /> Lista
  </Button>
  <Button
    variant={viewMode === 'funnel' ? 'default' : 'ghost'}
    size="sm"
    onClick={() => setViewMode('funnel')}
  >
    <LayoutGrid className="h-4 w-4 mr-1" /> Funil
  </Button>
</div>
```

### 3. Componente da Tabela

Quando `viewMode === 'list'`, renderizar tabela:

```tsx
// Colunas: Nome, Telefone, Tag, Etapa, Responsável, Valor, Ações
<div className="border rounded-lg overflow-hidden">
  {/* Header */}
  <div className="bg-muted/50 flex items-center p-3 text-xs font-medium">
    <Checkbox
      checked={isAllSelected}
      onCheckedChange={handleSelectAll}
    />
    <span className="w-40 ml-2">Nome</span>
    <span className="w-28">Telefone</span>
    <span className="w-24">Tag</span>
    <span className="w-28">Etapa</span>
    <span className="w-24">Resp.</span>
    <span className="w-20">Valor</span>
    <span className="w-16">Ações</span>
  </div>

  {/* Rows */}
  {sortedLeads.map(lead => (
    <LeadTableRow
      key={lead.id}
      lead={lead}
      isSelected={selectedLeadIds.has(lead.id)}
      onSelect={() => handleToggleSelect(lead.id)}
      onEdit={() => handleEditLead(lead)}
      onDelete={() => handleDeleteLead(lead)}
    />
  ))}
</div>
```

### 4. Barra de Ações em Lote

Aparece quando `selectedLeadIds.size > 0`:

```tsx
{selectedLeadIds.size > 0 && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
    <Checkbox checked />
    <span className="text-blue-700 font-medium text-sm">
      {selectedLeadIds.size} leads selecionados
    </span>
    <div className="ml-auto flex gap-2">
      <Button size="sm" onClick={handleBulkAssign}>Atribuir</Button>
      <Button size="sm" onClick={handleBulkMoveStage}>Mover Etapa</Button>
      <Button size="sm" onClick={handleBulkTags}>Tags</Button>
      <Button size="sm" onClick={handleBulkExport}>Exportar</Button>
      <Button size="sm" variant="destructive" onClick={handleBulkDelete}>Excluir</Button>
    </div>
    <Button size="sm" variant="ghost" onClick={clearSelection}>Cancelar</Button>
  </div>
)}
```

### 5. Funções de Ação em Lote

```typescript
// Atribuir responsável
const handleBulkAssign = async (userId: string) => {
  const ids = Array.from(selectedLeadIds);
  await supabase
    .from('leads')
    .update({ responsavel_user_id: userId })
    .in('id', ids);
  toast.success(`${ids.length} leads atribuídos`);
  clearSelection();
  loadLeads();
};

// Mover etapa
const handleBulkMoveStage = async (stageId: string) => {
  const ids = Array.from(selectedLeadIds);
  await supabase
    .from('leads')
    .update({ funnel_stage_id: stageId, stage: stageId })
    .in('id', ids);
  toast.success(`${ids.length} leads movidos`);
  clearSelection();
  loadLeads();
};

// Tags
const handleBulkTags = async (tagIds: string[], mode: 'add' | 'remove') => {
  const leadIds = Array.from(selectedLeadIds);
  // Insert/remove lead_tag_assignments
  toast.success(`Tags atualizadas em ${leadIds.length} leads`);
};

// Exportar
const handleBulkExport = async (mode: 'selected' | 'all' | 'filtered') => {
  let leadsToExport: Lead[];
  if (mode === 'selected') {
    leadsToExport = leads.filter(l => selectedLeadIds.has(l.id));
  } else if (mode === 'filtered') {
    leadsToExport = filteredLeads;
  } else {
    // Buscar todos do funil
  }
  // Gerar Excel
};

// Excluir
const handleBulkDelete = async () => {
  const ids = Array.from(selectedLeadIds);
  await supabase.from('leads').delete().in('id', ids);
  toast.success(`${ids.length} leads excluídos`);
  clearSelection();
  loadLeads();
};
```

### 6. Modal de Exportação

Ao clicar em "Exportar", mostrar dialog com opções:

```tsx
<Dialog open={showExportDialog}>
  <DialogContent>
    <DialogTitle>Exportar Leads</DialogTitle>
    <RadioGroup value={exportMode}>
      <RadioGroupItem value="selected" />
        {selectedLeadIds.size} selecionados
      <RadioGroupItem value="filtered" />
        {filteredLeads.length} da filtragem atual
      <RadioGroupItem value="all" />
        Todos do funil ({totalLeads})
    </RadioGroup>
    <div className="flex gap-2">
      <Popover>
        <PopoverTrigger>Filtrar por data</PopoverTrigger>
        <Calendar ... />
      </Popover>
    </div>
    <Button onClick={executeExport}>Exportar Excel</Button>
  </DialogContent>
</Dialog>
```

### 7. Ordenação

```typescript
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
    }
    return sortDirection === 'desc' ? -comparison : comparison;
  });
}, [filteredLeads, sortField, sortDirection]);
```

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Pipeline.tsx` | Estado viewMode, tabela, ações em lote, remover filtro status |
| `src/components/PipelineListRow.tsx` | Novo: linha da tabela de leads |
| `src/components/BulkActionsBar.tsx` | Novo: barra de ações em lote |
| `src/components/BulkAssignDialog.tsx` | Novo: dialog para atribuir responsável |
| `src/components/BulkMoveDialog.tsx` | Novo: dialog para mover etapa |
| `src/components/BulkTagsDialog.tsx` | Novo: dialog para gerenciar tags |
| `src/components/ExportDialog.tsx` | Novo: dialog de exportação com opções |

## Fluxo de Dados

```
1. Usuário clica em "Lista" → setViewMode('list')
2. Estado muda → re-render com tabela
3. Usuário clica checkboxes → setSelectedLeadIds()
4. selectedLeadIds.size > 0 → mostra BulkActionsBar
5. Usuário clica ação → abre dialog específico
6. Confirma ação → executa bulk update no Supabase
7. Sucesso → toast, clearSelection(), loadLeads()
```

## Critérios de Aceitação

- [ ] Filtro "Todos os Status" removido
- [ ] Toggle Funil/Lista funciona
- [ ] Tabela mostra colunas: Nome, Telefone, Tag, Etapa, Resp., Valor
- [ ] Checkboxes para seleção individual
- [ ] Checkbox no header para selecionar todos da página
- [ ] Barra de ações aparece quando há seleção
- [ ] Ação "Atribuir" abre dialog com lista de colaboradores
- [ ] Ação "Mover Etapa" abre dialog com etapas do funil
- [ ] Ação "Tags" abre dialog para adicionar/remover tags
- [ ] Ação "Exportar" oferece: selecionados, filtrados, todos + filtro data
- [ ] Ação "Excluir" pede confirmação
- [ ] Ordenação por: data, valor, nome (asc/desc)
- [ ] Visão lista mantém paginação (50 por página)
