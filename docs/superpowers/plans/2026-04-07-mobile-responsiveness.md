# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adaptar o CRM Kairoz para funcionar em todos os tamanhos de tela (320px a 1280px) usando Tailwind CSS responsivo.

**Architecture:** Usar classes responsivas do Tailwind (sm:, md:, lg:) diretamente nos componentes existentes. Para componentes complexos (Pipeline, Chat), usar o hook `useIsMobile()` para renderização condicional. Manter a lógica compartilhada e evitar duplicação de código.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/index.css` | Classes utilitárias customizadas para mobile |
| `src/components/DashboardLayout.tsx` | Layout principal com header/footer responsivo |
| `src/pages/Pipeline.tsx` | Kanban com stack mobile e FAB |
| `src/pages/Chat.tsx` | Alternância de views mobile |
| `src/pages/Dashboard.tsx` | Grid de métricas responsivo |
| `src/pages/Ranking.tsx` | Lista responsiva |
| `src/pages/Tasks.tsx` | Kanban mobile (mesmo padrão do Pipeline) |
| `src/pages/Settings.tsx` | Formulários responsivos |
| `src/pages/Integrations.tsx` | Cards responsivos |
| `src/pages/Colaboradores.tsx` | Tabela → cards mobile |
| `src/pages/Producao.tsx` | Layout responsivo |

---

## Phase 1: Core Layout & Utilities

### Task 1: Adicionar Classes Utilitárias Mobile

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Adicionar classes utilitárias customizadas ao final do arquivo**

```css
/* ============================================
   MOBILE RESPONSIVENESS UTILITIES
   ============================================ */

@layer utilities {
  /* Card mobile com largura mínima */
  .mobile-card {
    @apply min-w-[280px] max-w-full;
  }

  /* Input otimizado para touch (44px mínimo) */
  .mobile-input {
    @apply h-11 text-base sm:h-10 sm:text-sm;
  }

  /* Botão otimizado para touch */
  .mobile-button {
    @apply min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0;
  }

  /* Floating Action Button */
  .fab {
    @apply fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 flex items-center justify-center;
  }

  /* Container com scroll horizontal e snap */
  .scroll-snap-x {
    @apply overflow-x-auto snap-x snap-mandatory;
  }

  /* Item com snap para scroll horizontal */
  .snap-item {
    @apply snap-start flex-shrink-0;
  }

  /* Esconder em mobile */
  .hide-mobile {
    @apply hidden sm:block;
  }

  /* Esconder em desktop */
  .show-mobile-only {
    @apply block sm:hidden;
  }
}

/* Safe area para dispositivos com notch */
@supports (padding-top: env(safe-area-inset-top)) {
  .safe-area-top {
    padding-top: env(safe-area-inset-top);
  }
  .safe-area-bottom {
    padding-bottom: env(safe-area-inset-bottom);
  }
}
```

- [ ] **Step 2: Verificar que o arquivo não tem erros de sintaxe**

Run: `cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npm run build 2>&1 | head -20`
Expected: Build passes or shows unrelated errors

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add mobile responsiveness utility classes"
```

---

### Task 2: DashboardLayout Responsivo

**Files:**
- Modify: `src/components/DashboardLayout.tsx`

- [ ] **Step 1: Atualizar header para ser responsivo**

Localize a linha com `<header className="sticky top-0...` (aproximadamente linha 41) e substitua:

```tsx
<header className="sticky top-0 z-10 flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4 border-b bg-card px-3 sm:px-6 shrink-0">
```

- [ ] **Step 2: Atualizar padding do container de conteúdo**

Localize a linha com `<div className="flex-1 overflow-y-auto p-6">` (aproximadamente linha 96) e substitua:

```tsx
<div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
```

- [ ] **Step 3: Verificar alterações visualmente**

Run: `cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npm run dev`
Expected: Dev server starts successfully

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "feat: make DashboardLayout responsive for mobile devices"
```

---

## Phase 2: Páginas Principais

### Task 3: Pipeline - Layout Mobile com Stack

**Files:**
- Modify: `src/pages/Pipeline.tsx`

- [ ] **Step 1: Atualizar container do Kanban para stack em mobile**

Localize a `<div>` que contém as colunas do Kanban (aproximadamente linha 2046-2050). Procure por `className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide pipeline-content"` e substitua:

```tsx
<div
  ref={scrollContainerRef}
  onScroll={handleScrollContainerScroll}
  className={cn(
    "flex flex-col sm:flex-row gap-3 overflow-x-auto pb-4 scrollbar-hide pipeline-content",
    isTabTransitioning && "transitioning"
  )}
  data-dragging-active={isDraggingActive}
>
```

- [ ] **Step 2: Atualizar colunas individuais com snap e largura responsiva**

Procure por onde `<PipelineColumn` é renderizado dentro do map de stages. Adicione um wrapper div com classes responsivas:

```tsx
{stages.map((stage) => {
  const stageLeads = leadsByStage.get(stage.id) || [];
  return (
    <div key={`${selectedFunnelId}-${stage.id}`} className="min-w-0 sm:min-w-[300px] md:min-w-[320px] flex-shrink-0 snap-start">
      <PipelineColumn
        id={stage.id}
        title={stage.title}
        count={stageLeads.length}
        color={stage.color}
        leads={stageLeads}
        isEmpty={stageLeads.length === 0}
        onLeadUpdate={() => loadLeads(undefined, false)}
        onEdit={setEditingLead}
        onDelete={handleDeleteLead}
        leadItems={leadItems}
        leadTagsMap={leadTagsMap}
        isDraggingActive={isDraggingActive}
        profilesMap={profilesMap}
        duplicateLeadIds={duplicateLeadIds}
        agendamentosMap={agendamentosMap}
        redistributedMap={redistributedMap}
        pagination={stagePagination[stage.id]}
        onLoadMore={() => loadMoreForStage(stage.id)}
      />
    </div>
  );
})}
```

- [ ] **Step 3: Adicionar estado para filtro drawer mobile**

No topo do componente Pipeline, adicione após os outros estados:

```tsx
const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
```

- [ ] **Step 4: Importar Sheet components**

Verifique se já existe import de Sheet. Se não, adicione:

```tsx
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
```

- [ ] **Step 5: Criar seção de filtros mobile com Sheet**

Localize a `<div className="flex items-center gap-2 flex-wrap">` que contém os filtros (aproximadamente linha 1768-1851). Vamos envolver em uma estrutura que mostra inline em desktop e drawer em mobile. Substitua toda a linha de filtros:

```tsx
{/* Filtros - Desktop (inline) */}
<div className="hidden md:flex items-center gap-2 flex-wrap">
  <div className="relative flex-1 min-w-[180px] max-w-xs">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <Input
      placeholder="Buscar por nome, email, telefone..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="pl-9 h-9"
    />
  </div>
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
  <Select value={sourceFilter} onValueChange={setSourceFilter}>
    <SelectTrigger className="h-9 w-[145px] bg-background">
      <SelectValue placeholder="Origem" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Todas Origens</SelectItem>
      <SelectItem value="Facebook Leads">Facebook</SelectItem>
      <SelectItem value="WhatsApp">WhatsApp</SelectItem>
      <SelectItem value="Webhook">Webhook</SelectItem>
      <SelectItem value="Manual">Manual</SelectItem>
    </SelectContent>
  </Select>
  <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
    <SelectTrigger className="h-9 w-[155px] bg-background">
      <SelectValue placeholder="Responsável" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Todos Responsáveis</SelectItem>
      {colaboradores.map(c => (
        <SelectItem key={c.user_id} value={c.user_id}>
          {c.full_name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  <Popover>
    <PopoverTrigger asChild>
      <Button
        variant="outline"
        size="sm"
        className={cn("h-9 text-sm", (dateRange.from || dateRange.to) && "border-primary text-primary")}
      >
        <CalendarIcon className="h-4 w-4 mr-2" />
        {dateRange.from && dateRange.to
          ? `${format(dateRange.from, "dd/MM", { locale: ptBR })} - ${format(dateRange.to, "dd/MM", { locale: ptBR })}`
          : "Período"}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <div className="flex flex-col gap-1 p-2 border-b">
        <Button variant="ghost" size="sm" className="justify-start text-xs"
          onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}>
          Últimos 7 dias
        </Button>
        <Button variant="ghost" size="sm" className="justify-start text-xs"
          onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}>
          Últimos 30 dias
        </Button>
        <Button variant="ghost" size="sm" className="justify-start text-xs"
          onClick={() => setDateRange({ from: undefined, to: undefined })}>
          Limpar filtro
        </Button>
      </div>
      <Calendar
        mode="range"
        selected={{ from: dateRange.from, to: dateRange.to }}
        onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
        numberOfMonths={1}
        locale={ptBR}
      />
    </PopoverContent>
  </Popover>
</div>

{/* Filtros - Mobile (drawer) */}
<div className="md:hidden flex items-center gap-2">
  <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
    <SheetTrigger asChild>
      <Button variant="outline" size="sm" className="h-9">
        <Filter className="h-4 w-4 mr-2" />
        Filtros
        {(statusFilter !== "all" || sourceFilter !== "all" || responsibleFilter !== "all" || dateRange.from) && (
          <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
        )}
      </Button>
    </SheetTrigger>
    <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
      <div className="space-y-4 py-4">
        <h3 className="text-lg font-semibold">Filtros</h3>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Buscar</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nome, email, telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 bg-background">
              <SelectValue placeholder="Todos os Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="NOVO">Novo</SelectItem>
              <SelectItem value="EM_ATENDIMENTO">Em Atendimento</SelectItem>
              <SelectItem value="FECHADO">Fechado</SelectItem>
              <SelectItem value="PERDIDO">Perdido</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Origem</label>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-11 bg-background">
              <SelectValue placeholder="Todas Origens" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Origens</SelectItem>
              <SelectItem value="Facebook Leads">Facebook</SelectItem>
              <SelectItem value="WhatsApp">WhatsApp</SelectItem>
              <SelectItem value="Webhook">Webhook</SelectItem>
              <SelectItem value="Manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Responsável</label>
          <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
            <SelectTrigger className="h-11 bg-background">
              <SelectValue placeholder="Todos Responsáveis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Responsáveis</SelectItem>
              {colaboradores.map(c => (
                <SelectItem key={c.user_id} value={c.user_id}>
                  {c.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Período</label>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}>
              7 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}>
              30 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDateRange({ from: undefined, to: undefined })}>
              Limpar
            </Button>
          </div>
          {(dateRange.from || dateRange.to) && (
            <p className="text-sm text-muted-foreground">
              {dateRange.from && dateRange.to
                ? `${format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} - ${format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}`
                : "Selecione um período"}
            </p>
          )}
        </div>

        <Button className="w-full h-11" onClick={() => setFilterDrawerOpen(false)}>
          Aplicar Filtros
        </Button>
      </div>
    </SheetContent>
  </Sheet>
</div>
```

- [ ] **Step 6: Importar Filter icon se não existir**

Verifique se `Filter` está importado de lucide-react. Se não, adicione à lista de imports:

```tsx
import { Settings2, Search, Plus, Download, Upload, CalendarIcon, Users, Shield, LayoutGrid, List, Check, Lock, Unlock, Filter } from "lucide-react";
```

- [ ] **Step 7: Adicionar FAB (Floating Action Button) para mobile**

No final do return, antes dos modais, adicione o FAB:

```tsx
{/* FAB para adicionar lead em mobile */}
{permissions.canCreateLeads && (
  <div className="fixed bottom-6 right-6 z-50 md:hidden">
    <Button
      size="lg"
      className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
      onClick={() => setShowAddModal(true)}
    >
      <Plus className="h-6 w-6" />
    </Button>
  </div>
)}
```

- [ ] **Step 8: Verificar build**

Run: `cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npm run build 2>&1 | head -30`
Expected: Build passes without errors

- [ ] **Step 9: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: add mobile responsive layout to Pipeline with filters drawer and FAB"
```

---

### Task 4: Chat - Alternância de Views Mobile

**Files:**
- Modify: `src/pages/Chat.tsx`

- [ ] **Step 1: Adicionar estado para view ativa no mobile**

No topo do componente Chat, após os estados existentes, adicione:

```tsx
// Mobile view state
const [chatView, setChatView] = useState<'list' | 'conversation'>('list');
```

- [ ] **Step 2: Adicionar useEffect para sincronizar chatView com selectedLead**

Adicione após os outros useEffects:

```tsx
// Sync chatView with selectedLead changes on mobile
useEffect(() => {
  const checkMobile = () => window.innerWidth < 768;
  if (checkMobile() && selectedLead) {
    setChatView('conversation');
  }
}, [selectedLead?.id]);
```

- [ ] **Step 3: Atualizar container principal para renderização condicional**

Localize a `<div className="flex h-[calc(100vh-8rem)]...` que envolve as duas colunas do chat (aproximadamente linha 1155) e substitua toda a estrutura:

```tsx
return (
  <div className="flex h-[calc(100vh-8rem)] gap-4 min-w-0 overflow-hidden">
    {/* Desktop: duas colunas */}
    <Card className="hidden md:flex w-80 flex-shrink-0 flex-col overflow-hidden h-full">
      {/* Leads List */}
      <div className="p-4 border-b space-y-3">
        {/* ... conteúdo existente do header da lista ... */}
      </div>
      {/* ... resto da lista de conversas existente ... */}
    </Card>
    <Card className="hidden md:flex flex-1 flex-col overflow-hidden h-full min-w-0 max-w-full">
      {/* ... conteúdo existente da área de chat ... */}
    </Card>

    {/* Mobile: uma coluna por vez */}
    <Card className="flex md:hidden w-full flex-col overflow-hidden h-full">
      {chatView === 'list' ? (
        <>
          {/* Lista de conversas - Mobile */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Conversas</h2>
              <div className="flex gap-1">
                <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className={`relative ${activeFiltersCount > 0 ? "text-primary" : ""}`}>
                      <Filter className="h-4 w-4" />
                      {activeFiltersCount > 0 && (
                        <Badge variant="default" className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] rounded-full">
                          {activeFiltersCount}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  {/* ... PopoverContent existente ... */}
                </Popover>
                <Button variant="ghost" size="sm" onClick={() => setManageTagsOpen(true)} className="gap-2">
                  <Tag className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar contato..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <TabsList className="mx-4 mt-2 w-[calc(100%-2rem)] justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger value="all" className="text-sm rounded-none px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">Tudo</TabsTrigger>
              <TabsTrigger value="pinned" className="text-sm gap-1 rounded-none px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
                Fixados
                {pinnedFilteredLeads.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{pinnedFilteredLeads.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {loading ? (
              <LoadingAnimation text="Carregando leads..." />
            ) : (
              <>
                <TabsContent value="all" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                  <ScrollArea className="flex-1">
                    {unpinnedFilteredLeads.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">Nenhum contato encontrado</div>
                    ) : (
                      <div className="space-y-1 p-2">
                        {unpinnedFilteredLeads.map((lead) => (
                          <div key={lead.id} onClick={() => { setSelectedLead(lead); setLockedLeadId(lead.id); refreshPresenceForLead(lead); }}>
                            <ChatLeadItem
                              lead={lead}
                              isSelected={selectedLead?.id === lead.id}
                              isPinned={false}
                              isLocked={lead.id === lockedLeadId}
                              presenceStatus={presenceStatus.get(lead.id)}
                              tagVersion={(leadTagsMap.get(lead.id) || []).join(",")}
                              responsibleInfo={permissions.canViewAllLeads && lead.responsavel_user_id ? responsiblesMap.get(lead.responsavel_user_id) : undefined}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="pinned" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                  <ScrollArea className="flex-1">
                    {pinnedFilteredLeads.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">Nenhum contato fixado</div>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={pinnedFilteredLeads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1 p-2">
                            {pinnedFilteredLeads.map((lead) => <SortableLeadItem key={lead.id} lead={lead} />)}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </ScrollArea>
                </TabsContent>
              </>
            )}
          </Tabs>
        </>
      ) : (
        <>
          {/* Área de chat - Mobile */}
          {selectedLead ? (
            <>
              {/* Header com botão voltar */}
              <div className="p-3 border-b flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setChatView('list')} className="p-0 h-auto">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <ChatHeader
                  lead={selectedLead}
                  presenceStatus={presenceStatus.get(selectedLead.id)}
                  onRefreshPresence={() => refreshPresenceForLead(selectedLead)}
                  isLoadingPresence={isLoadingPresence}
                  messageSearchQuery={messageSearchQuery}
                  setMessageSearchQuery={setMessageSearchQuery}
                  messageSearchExpanded={messageSearchExpanded}
                  setMessageSearchExpanded={setMessageSearchExpanded}
                  totalSearchResults={searchResults.length}
                  currentSearchResultIndex={currentSearchResultIndex}
                  onNextResult={() => setCurrentSearchResultIndex((prev) => Math.min(prev + 1, searchResults.length - 1))}
                  onPreviousResult={() => setCurrentSearchResultIndex((prev) => Math.max(prev - 1, 0))}
                  onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
                  compact
                />
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                <PinnedMessagesBar
                  messages={messages}
                  pinnedMessageIds={pinnedMessages}
                  selectedLead={selectedLead}
                  showExpanded={showPinnedMessages}
                  onToggleExpanded={() => setShowPinnedMessages(!showPinnedMessages)}
                  onUnpinMessage={togglePinMessage}
                  onScrollToMessage={(id) => document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                />

                <div className="flex-1 relative overflow-hidden">
                  <div
                    className="absolute inset-0 pointer-events-none transition-opacity duration-300"
                    style={{ backgroundColor: theme === "dark" ? "#0C1317" : "#ECE5DD", backgroundImage: theme === "dark" ? "url(/chat-pattern-dark.png)" : "url(/chat-pattern.png)", backgroundRepeat: "repeat", backgroundSize: "200px", opacity: 0.3 }}
                  />
                  <ScrollArea className="h-full p-4 relative z-10">
                    {loading ? (
                      <LoadingAnimation text="Carregando mensagens..." />
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">Nenhuma mensagem ainda. Inicie a conversa!</div>
                    ) : (
                      <div className="space-y-4 max-w-full overflow-x-hidden">
                        {hasMoreMessages && (
                          <div className="flex justify-center py-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={loadMoreMessages}
                              disabled={loadingMoreMessages}
                              className="text-xs text-muted-foreground gap-1.5"
                            >
                              {loadingMoreMessages
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Carregando...</>
                                : "⬆ Carregar mensagens anteriores"}
                            </Button>
                          </div>
                        )}
                        {messages.map((message, index) => {
                          const isSearchMatch = messageSearchQuery.trim() && message.corpo_mensagem.toLowerCase().includes(messageSearchQuery.toLowerCase());
                          let searchResultIndex = -1;
                          if (isSearchMatch) {
                            searchResultIndex = messages.slice(0, index + 1).filter((m) => m.corpo_mensagem.toLowerCase().includes(messageSearchQuery.toLowerCase())).length - 1;
                          }

                          return (
                            <MessageBubble
                              key={message.id}
                              message={message}
                              lead={selectedLead}
                              isPinned={pinnedMessages.has(message.id)}
                              reactions={messageReactions.get(message.id) || []}
                              currentUserId={user?.id}
                              isSearchMatch={!!isSearchMatch}
                              isCurrentSearchResult={searchResultIndex === currentSearchResultIndex}
                              dropdownOpen={dropdownOpenStates.get(message.id) || false}
                              reactionPopoverOpen={reactionPopoverOpen === message.id}
                              onToggleDropdown={(open) => {
                                if (!open && reactionPopoverOpen === message.id) return;
                                const newStates = new Map(dropdownOpenStates);
                                if (open) newStates.set(message.id, true);
                                else newStates.delete(message.id);
                                setDropdownOpenStates(newStates);
                              }}
                              onToggleReactionPopover={() => setReactionPopoverOpen(reactionPopoverOpen === message.id ? null : message.id)}
                              onToggleReaction={(emoji) => toggleReaction(message.id, emoji)}
                              onTogglePin={() => togglePinMessage(message)}
                              onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
                              onReply={(msg) => {
                                setReplyingTo(msg);
                                messageInputRef.current?.focus();
                              }}
                              onScrollToMessage={(messageId) => {
                                const el = document.getElementById(`message-${messageId}`);
                                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                                el?.classList.add("ring-2", "ring-primary");
                                setTimeout(() => el?.classList.remove("ring-2", "ring-primary"), 2000);
                              }}
                              onDelete={() => setMessageToDelete(message)}
                              messageRef={(el) => {
                                if (isSearchMatch && searchResultIndex >= 0) {
                                  searchResultRefs.current.set(searchResultIndex, el);
                                }
                              }}
                            />
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>

              <ChatInput
                newMessage={newMessage}
                setNewMessage={setNewMessage}
                onSendMessage={(e) => { e.preventDefault(); sendMessage(newMessage); }}
                sending={sending}
                sendingFile={sendingFile}
                sendingAudio={sendingAudio}
                isRecording={opusRecorder.isRecording}
                recordingTime={opusRecorder.recordingTime}
                onStartRecording={opusRecorder.startRecording}
                onStopRecording={opusRecorder.stopRecording}
                onFileSelect={handleFileSelect}
                inputRef={messageInputRef}
                replyingTo={replyingTo}
                onCancelReply={() => setReplyingTo(null)}
                leadName={selectedLead?.nome_lead}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-lg">Selecione uma conversa</p>
                <p className="text-sm">Escolha um contato na lista para iniciar</p>
              </div>
            </div>
          )}
        </>
      )}
    </Card>

    {/* Modals */}
    {/* ... modais existentes ... */}
  </div>
);
```

- [ ] **Step 4: Importar ArrowLeft icon**

Adicione `ArrowLeft` aos imports do lucide-react:

```tsx
import { Search, Tag, Filter, Check, Pin, PinOff, Loader2, ArrowLeft } from "lucide-react";
```

- [ ] **Step 5: Adicionar prop compact ao ChatHeader (opcional)**

Se o ChatHeader não tiver prop compact, podemos simplificar removendo essa prop do uso acima. Verifique o componente e ajuste conforme necessário.

- [ ] **Step 6: Verificar build**

Run: `cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npm run build 2>&1 | head -30`
Expected: Build passes without errors

- [ ] **Step 7: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat: add mobile view switching for Chat (list/conversation toggle)"
```

---

### Task 5: Dashboard - Grid Responsivo

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Atualizar grid de métricas principal**

Localize o primeiro grid de StatCards (aproximadamente linha 554) e atualize as classes:

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
```

- [ ] **Step 2: Atualizar segunda linha de métricas**

Localize o segundo grid (aproximadamente linha 586) e atualize:

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
```

- [ ] **Step 3: Atualizar terceira linha de métricas**

Localize o terceiro grid (aproximadamente linha 651) e atualize:

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
```

- [ ] **Step 4: Atualizar grid de análise (3 colunas)**

Localize o grid com lg:grid-cols-3 (aproximadamente linha 709) e atualize:

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
```

- [ ] **Step 5: Atualizar StatCard para padding responsivo**

Dentro do componente StatCard (aproximadamente linha 71), atualize o padding:

```tsx
<div className="rounded-[13px] border border-border/60 bg-muted/80 dark:bg-card p-4 sm:p-5 transition-all duration-200 hover:shadow-md hover:border-border cursor-default">
```

- [ ] **Step 6: Verificar build**

Run: `cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npm run build 2>&1 | head -20`
Expected: Build passes

- [ ] **Step 7: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: make Dashboard grid responsive for all screen sizes"
```

---

## Phase 3: Páginas Secundárias

### Task 6: Ranking Responsivo

**Files:**
- Modify: `src/pages/Ranking.tsx`

- [ ] **Step 1: Ler o arquivo para entender a estrutura atual**

Run: `head -100 "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo/src/pages/Ranking.tsx"`
Expected: Ver estrutura do componente

- [ ] **Step 2: Atualizar container principal para responsivo**

Localize o container principal e ajuste para mobile. Se houver um grid, atualize para responsivo:

```tsx
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
```

- [ ] **Step 3: Ajustar avatares e informações para mobile**

Procure por Avatar com tamanho fixo e torne responsivo:

```tsx
<Avatar className="h-10 w-10 sm:h-12 sm:w-12">
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Ranking.tsx
git commit -m "feat: make Ranking page responsive for mobile"
```

---

### Task 7: Tasks (Kanban) Responsivo

**Files:**
- Modify: `src/pages/Tasks.tsx`

- [ ] **Step 1: Ler o arquivo para entender a estrutura**

Run: `head -100 "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo/src/pages/Tasks.tsx"`
Expected: Ver estrutura do Kanban de tarefas

- [ ] **Step 2: Aplicar mesmo padrão do Pipeline**

Siga o mesmo padrão do Task 3:
- Container com `flex-col sm:flex-row`
- Colunas com `min-w-0 sm:min-w-[280px]`
- FAB para adicionar tarefa em mobile

- [ ] **Step 3: Commit**

```bash
git add src/pages/Tasks.tsx
git commit -m "feat: make Tasks page responsive with mobile Kanban layout"
```

---

### Task 8: Settings Responsivo

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Ler o arquivo para entender a estrutura**

Run: `head -100 "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo/src/pages/Settings.tsx"`
Expected: Ver estrutura de tabs e formulários

- [ ] **Step 2: Atualizar container de formulários para coluna única em mobile**

Procure por grids de formulários e atualize:

```tsx
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
```

- [ ] **Step 3: Ajustar grupos de botões para stack em mobile**

Procure por `flex gap-2` com botões e adicione responsividade:

```tsx
<div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: make Settings page responsive for mobile"
```

---

### Task 9: Colaboradores Responsivo (Tabela → Cards)

**Files:**
- Modify: `src/pages/Colaboradores.tsx`

- [ ] **Step 1: Ler o arquivo para entender a estrutura**

Run: `head -150 "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo/src/pages/Colaboradores.tsx"`
Expected: Ver estrutura da tabela

- [ ] **Step 2: Adicionar versão mobile com cards**

Envolva a tabela existente em um `hidden md:block` e crie uma versão de cards para mobile:

```tsx
{/* Desktop: Tabela */}
<div className="hidden md:block rounded-md border">
  <Table>
    {/* tabela existente */}
  </Table>
</div>

{/* Mobile: Lista de cards */}
<div className="md:hidden space-y-3">
  {colaboradores.map((colab) => (
    <Card key={colab.user_id} className="p-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={colab.avatar_url} />
          <AvatarFallback>{colab.full_name?.[0]}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{colab.full_name}</p>
          <p className="text-sm text-muted-foreground truncate">{colab.email}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {/* ações */}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  ))}
</div>
```

- [ ] **Step 3: Importar MoreVertical se necessário**

```tsx
import { MoreVertical } from "lucide-react";
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Colaboradores.tsx
git commit -m "feat: add mobile card layout to Colaboradores page"
```

---

### Task 10: Integrations Responsivo

**Files:**
- Modify: `src/pages/Integrations.tsx`

- [ ] **Step 1: Atualizar grid de cards para responsivo**

Procure por grids e atualize:

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Integrations.tsx
git commit -m "feat: make Integrations page responsive for mobile"
```

---

### Task 11: Producao Responsivo

**Files:**
- Modify: `src/pages/Producao.tsx`

- [ ] **Step 1: Ler o arquivo para entender a estrutura**

Run: `head -100 "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo/src/pages/Producao.tsx"`
Expected: Ver estrutura

- [ ] **Step 2: Atualizar grids para responsivo**

Procure por grids e atualize:

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Producao.tsx
git commit -m "feat: make Producao page responsive for mobile"
```

---

## Finalização

### Task 12: Teste Final e Documentação

- [ ] **Step 1: Executar build completo**

Run: `cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npm run build`
Expected: Build passes without errors

- [ ] **Step 2: Iniciar dev server e testar manualmente**

Run: `cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npm run dev`

Testar em Chrome DevTools com os seguintes tamanhos:
- 320px (iPhone SE)
- 375px (iPhone standard)
- 390px (iPhone 12/13)
- 768px (Tablet)
- 1024px (Tablet landscape)

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat: complete mobile responsiveness implementation for all CRM pages"
```

---

## Spec Coverage Checklist

| Requisito do Spec | Task |
|-------------------|------|
| Breakpoints (640/768/1024/1280px) | Task 1 |
| DashboardLayout responsivo | Task 2 |
| Pipeline stack mobile + FAB | Task 3 |
| Chat alternância de views | Task 4 |
| Dashboard grid responsivo | Task 5 |
| Ranking responsivo | Task 6 |
| Tasks Kanban mobile | Task 7 |
| Settings responsivo | Task 8 |
| Colaboradores tabela → cards | Task 9 |
| Integrations responsivo | Task 10 |
| Producao responsivo | Task 11 |
| Classes utilitárias mobile | Task 1 |
| Touch targets 44px min | Task 1 (mobile-button) |
