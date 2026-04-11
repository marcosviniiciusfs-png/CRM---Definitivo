# Design: Responsividade Mobile do CRM Kairoz

**Data:** 2026-04-07
**Status:** Aprovado
**Abordagem:** Tailwind Responsivo Nativo

---

## 1. Visão Geral

### 1.1 Objetivo
Adaptar todo o CRM Kairoz para funcionar adequadamente em dispositivos móveis de todos os tamanhos, desde smartphones até tablets, mantendo a usabilidade e experiência do usuário.

### 1.2 Escopo
- **Páginas Principais:** Dashboard, Pipeline (Kanban), Chat, Ranking
- **Páginas Administrativas:** Colaboradores, Equipes, Atividades, Produção
- **Páginas de Configuração:** Settings, Integrações, Tarefas
- **Componentes Compartilhados:** Filtros, Modais, Tabelas, Botões

### 1.3 Breakpoints

| Nome | Largura | Dispositivo |
|------|---------|-------------|
| `sm` | 640px | Smartphones grandes |
| `md` | 768px | Tablets retrato |
| `lg` | 1024px | Tablets paisagem / notebooks pequenos |
| `xl` | 1280px | Desktop padrão |
| `2xl` | 1400px | Telas grandes (existente) |

---

## 2. DashboardLayout

### 2.1 Comportamento por Dispositivo

**Desktop (≥1024px):**
- Sidebar fixa com hover expand
- Header com altura 64px
- Padding de conteúdo 24px

**Tablet (768-1023px):**
- Sidebar colapsável (apenas ícones)
- Header condensado (56px)
- Padding de conteúdo 16px

**Mobile (<768px):**
- Sidebar como Sheet (slide-over)
- Header minimalista (52px)
- Padding de conteúdo 12px

### 2.2 Mudanças no Código

```tsx
// DashboardLayout.tsx
<header className="sticky top-0 z-10 flex h-14 sm:h-16 items-center justify-between gap-4 border-b bg-card px-4 sm:px-6 shrink-0">
  {/* ... */}
</header>

<div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
  {children}
</div>
```

---

## 3. Pipeline (Kanban)

### 3.1 Comportamento por Dispositivo

**Desktop (≥1024px):**
- Kanban horizontal com colunas lado a lado
- Scroll horizontal para navegar entre colunas
- Cards com largura fixa (~320px)

**Tablet (768-1023px):**
- Cards ligeiramente menores (~280px)
- Scroll otimizado
- Filtros condensados

**Mobile (<768px):**
- **Stack empilhado:** colunas empilhadas verticalmente com scroll horizontal
- Cards com largura mínima de 280px (min-w-[280px])
- Filtros em drawer lateral ou accordion colapsável
- Ações principais (Adicionar, Exportar) em FAB (Floating Action Button)

### 3.2 Mudanças no Código

```tsx
// Pipeline.tsx - Container do Kanban
<div className="flex flex-col sm:flex-row gap-3 overflow-x-auto pb-4 scrollbar-hide">
  {/* Colunas */}
</div>

// Pipeline.tsx - Coluna individual (mobile)
<div className="min-w-[280px] sm:min-w-[300px] md:min-w-[320px] flex-shrink-0 snap-start">
  <PipelineColumn {...props} />
</div>
```

### 3.3 Filtros Mobile

```tsx
// Drawer colapsável para filtros em mobile
<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline" size="sm" className="md:hidden">
      <Filter className="h-4 w-4" />
    </Button>
  </SheetTrigger>
  <SheetContent side="bottom" className="h-[80vh]">
    {/* Filtros */}
  </SheetContent>
</Sheet>
```

### 3.4 FAB (Floating Action Button)

```tsx
// FAB para ações principais em mobile
<div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 md:hidden">
  <Button size="lg" className="h-14 w-14 rounded-full shadow-lg">
    <Plus className="h-6 w-6" />
  </Button>
</div>
```

---

## 4. Chat

### 4.1 Comportamento por Dispositivo

**Desktop (≥1024px):**
- Duas colunas: lista de conversas (w-80) + área de chat (flex-1)
- Ambas visíveis simultaneamente

**Mobile (<768px):**
- **Alternar Telas:** uma coluna visível por vez
- View 'list': mostra lista de conversas
- View 'conversation': mostra chat ativo
- Botão "voltar" para retornar à lista

### 4.2 Mudanças no Código

```tsx
// Chat.tsx - Estado para view ativa
const [chatView, setChatView] = useState<'list' | 'conversation'>('list');

// Chat.tsx - Renderização condicional
<div className="flex h-[calc(100vh-8rem)] gap-4 min-w-0 overflow-hidden">
  {/* Desktop: duas colunas */}
  <Card className="hidden md:flex w-80 flex-shrink-0 flex-col">
    <ConversationList />
  </Card>
  <Card className="hidden md:flex flex-1 flex-col">
    <ChatArea />
  </Card>

  {/* Mobile: uma coluna por vez */}
  {isMobile && chatView === 'list' && (
    <Card className="flex w-full flex-col">
      <ConversationList onSelect={() => setChatView('conversation')} />
    </Card>
  )}
  {isMobile && chatView === 'conversation' && (
    <Card className="flex w-full flex-col">
      <ChatArea onBack={() => setChatView('list')} />
    </Card>
  )}
</div>
```

---

## 5. Dashboard

### 5.1 Grid Responsivo

```tsx
// Dashboard.tsx - Grid de métricas
<div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
  {/* StatCards */}
</div>

// Dashboard.tsx - Grid de análise (3 colunas)
<div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
  {/* Taxas Chave, Distribuição, Top Vendedores */}
</div>
```

### 5.2 Cards Condensados

```tsx
// Dashboard.tsx - StatCard responsivo
<div className="rounded-[13px] border border-border/60 bg-muted/80 dark:bg-card p-4 sm:p-5 transition-all">
  {/* Conteúdo */}
</div>
```

---

## 6. Páginas Secundárias

### 6.1 Ranking

| Elemento | Desktop | Mobile |
|----------|---------|--------|
| Layout | Grid de cards | Lista vertical |
| Avatares | 48px | 40px |
| Informações | Completas | Condensadas |

### 6.2 Tasks (Kanban)

- Mesmo padrão do Pipeline
- Stack empilhado em mobile
- FAB para criar nova tarefa

### 6.3 Settings

| Elemento | Desktop | Mobile |
|----------|---------|--------|
| Tabs | Horizontais | Accordion vertical |
| Formulários | Múltiplas colunas | Coluna única |
| Botões | Grupo horizontal | Stack vertical |

### 6.4 Integrations

- Cards em coluna única (grid-cols-1)
- Ações em dropdown menu

### 6.5 Colaboradores

- Tabela → Lista de cards em mobile
- Avatar + nome + ações em linha

### 6.6 Produção

- Cards empilhados verticalmente
- Métricas em grid 2x2

---

## 7. Componentes Compartilhados

### 7.1 Filtros

```tsx
// Filtros em linha (desktop) vs drawer (mobile)
<div className="hidden md:flex items-center gap-2">
  {/* Filtros inline */}
</div>

<Button variant="outline" size="sm" className="md:hidden" onClick={() => setFilterDrawerOpen(true)}>
  <Filter className="h-4 w-4 mr-2" />
  Filtros
</Button>
```

### 7.2 Modais

```tsx
// Modal fullscreen em mobile
<DialogContent className="max-w-lg md:max-w-[425px] w-[95vw] md:w-auto max-h-[90vh] md:max-h-[85vh]">
  {/* Conteúdo */}
</DialogContent>
```

### 7.3 Tabelas

```tsx
// Tabela → Lista de cards em mobile
<div className="hidden md:block">
  <Table>{/* Tabela completa */}</Table>
</div>

<div className="md:hidden space-y-3">
  {data.map(item => (
    <Card key={item.id} className="p-4">
      {/* Card com informações essenciais */}
    </Card>
  ))}
</div>
```

### 7.4 Botões

```tsx
// Botões com touch target adequado
<Button className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0">
  {/* Conteúdo */}
</Button>

// Botões texto → ícone em mobile
<Button>
  <span className="hidden sm:inline">Adicionar</span>
  <Plus className="h-4 w-4 sm:hidden" />
</Button>
```

---

## 8. Classes Utilitárias Customizadas

Adicionar ao `tailwind.config.ts` ou `src/index.css`:

```css
@layer utilities {
  /* Card mobile com largura mínima */
  .mobile-card {
    @apply min-w-[280px] max-w-full;
  }

  /* Input otimizado para touch */
  .mobile-input {
    @apply h-11 text-base sm:h-10 sm:text-sm;
  }

  /* Botão otimizado para touch */
  .mobile-button {
    @apply min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0;
  }

  /* Floating Action Button */
  .fab {
    @apply fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50;
  }

  /* Container com scroll horizontal suave */
  .scroll-snap-x {
    @apply overflow-x-auto snap-x snap-mandatory;
  }

  /* Item com snap */
  .snap-item {
    @apply snap-start flex-shrink-0;
  }
}
```

---

## 9. Arquivos a Modificar

### 9.1 Prioridade Alta (Core Layout)

| Arquivo | Mudanças Principais |
|---------|---------------------|
| `src/components/DashboardLayout.tsx` | Header responsivo, padding, SidebarTrigger visibility |
| `src/pages/Pipeline.tsx` | Stack mobile, filtros em drawer, FAB |
| `src/pages/Chat.tsx` | Alternância de views mobile |

### 9.2 Prioridade Média (Dashboard)

| Arquivo | Mudanças Principais |
|---------|---------------------|
| `src/pages/Dashboard.tsx` | Grid responsivo, cards condensados |
| `src/components/AppSidebar.tsx` | Ajustes finos (já tem Sheet) |

### 9.3 Prioridade Baixa (Páginas Secundárias)

| Arquivo | Mudanças Principais |
|---------|---------------------|
| `src/pages/Ranking.tsx` | Lista responsiva |
| `src/pages/Tasks.tsx` | Kanban mobile |
| `src/pages/Settings.tsx` | Layout responsivo |
| `src/pages/Integrations.tsx` | Cards responsivos |
| `src/pages/Colaboradores.tsx` | Tabela → cards |
| `src/pages/Producao.tsx` | Layout responsivo |

---

## 10. Ordem de Implementação

1. **Fase 1 - Core Layout:**
   - DashboardLayout (header, padding)
   - Tailwind config (breakpoints, utilities)

2. **Fase 2 - Páginas Principais:**
   - Pipeline (stack mobile, filtros, FAB)
   - Chat (alternância de views)
   - Dashboard (grid responsivo)

3. **Fase 3 - Páginas Secundárias:**
   - Ranking
   - Tasks
   - Settings
   - Demais páginas

---

## 11. Critérios de Aceitação

- [ ] Todas as páginas funcionam em dispositivos de 320px a 1280px
- [ ] Touch targets têm no mínimo 44x44px
- [ ] Não há scroll horizontal indesejado
- [ ] Filtros e ações são acessíveis em mobile
- [ ] Navegação é intuitiva com uma mão
- [ ] Performance não é degradada
- [ ] Dark mode funciona corretamente em mobile

---

## 12. Notas de Implementação

- Usar `useIsMobile()` hook existente para lógica condicional
- Priorizar CSS puro (classes Tailwind) sobre JavaScript
- Testar em dispositivos reais ou Chrome DevTools
- Manter consistência visual entre temas claro e escuro
- Considerar safe-area-inset para dispositivos com notch
