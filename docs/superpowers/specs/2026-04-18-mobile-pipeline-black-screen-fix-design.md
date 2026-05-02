# Fix: Tela Preta no Funil de Vendas (Mobile)

**Data:** 2026-04-18
**Status:** Aprovado
**Abordagem:** CSS Custom Property com `dvh`

---

## Problema

Usuarios relatam tela preta / conteudo nao carrega ao acessar `/pipeline` em dispositivos mobile (< 1024px). Desktop funciona normalmente.

## Causas Raiz

### Causa 1 — `useLayoutEffect` instavel

`MobilePipelineView.tsx` usa `getBoundingClientRect()` dentro de `useLayoutEffect` para medir altura disponivel. O `rect.top` e instavel no primeiro render dentro de um container scrollavel (`DashboardLayout` com `overflow-y-auto`). O fallback `Math.max(available, 200)` pode resultar em um container de 200px — com `overflow: hidden`, todo conteudo abaixo fica invisivel.

### Causa 2 — Conflito de scroll duplo

`DashboardLayout` aplica `overflow-y-auto` no wrapper do conteudo. `MobilePipelineView` tenta criar seu proprio scroll interno com `overflow: hidden` na raiz + `overflow-y-auto` na lista de leads. O scroll duplo causa layout instavel.

### Causa 3 — Sem altura garantida no wrapper

`Pipeline.tsx` renderiza `MobilePipelineView` dentro de `<div className="space-y-4">` sem `flex-1` ou `min-h-0`. O componente nao tem como calcular sua altura real.

### Causa 4 — Race condition do `activeStageId`

`stages[0]?.id` pode ser `undefined` durante loading, deixando `activeStageId = ''`. O `useEffect` de reset so atualiza se o ID nao existe nos stages, mas `''` passa despercebido.

---

## Design da Correcao

### Mudanca 1 — `src/components/MobilePipelineView.tsx`

**Remover completamente:**
- Import de `useLayoutEffect`
- `const containerRef = useRef<HTMLDivElement>(null)`
- `const [containerHeight, setContainerHeight] = useState<number>(400)`
- Todo o bloco `useLayoutEffect` (medicao com `getBoundingClientRect`, listeners de `resize`/`visualViewport`, `setTimeout` de re-medicao)

**Substituir** o div raiz:

```tsx
// ANTES:
<div
  ref={containerRef}
  className="flex flex-col"
  style={{ height: containerHeight, overflow: 'hidden' }}
>

// DEPOIS:
<div
  className="flex flex-col overflow-hidden"
  style={{
    height: 'calc(100dvh - var(--pipeline-offset, 120px) - env(safe-area-inset-bottom, 0px))',
    minHeight: '280px',
  }}
>
```

**Corrigir** race condition do `activeStageId`:

```tsx
// ANTES:
useEffect(() => {
  if (stages.length > 0 && !stages.find(s => s.id === activeStageId)) {
    setActiveStageId(stages[0].id);
  }
}, [stages]);

// DEPOIS:
useEffect(() => {
  if (stages.length > 0 && (!activeStageId || !stages.find(s => s.id === activeStageId))) {
    setActiveStageId(stages[0].id);
  }
}, [stages, activeStageId]);
```

### Mudanca 2 — `src/components/DashboardLayout.tsx`

Adicionar deteccao da rota pipeline para desativar `overflow-y-auto` e padding:

```tsx
const isPipelinePage = location.pathname === '/pipeline';
```

**Substituir** o div wrapper do conteudo (linha 130):

```tsx
// ANTES:
<div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6">
  <div className="min-w-0 w-full max-w-full">
    {children}
  </div>
</div>

// DEPOIS:
<div
  className={cn(
    "flex-1 overflow-x-hidden",
    isPipelinePage
      ? "overflow-hidden p-0"
      : "overflow-y-auto p-3 sm:p-4 md:p-6"
  )}
>
  <div className={cn("min-w-0 w-full max-w-full", isPipelinePage && "h-full")}>
    {children}
  </div>
</div>
```

### Mudanca 3 — `src/pages/Pipeline.tsx`

Envolver `MobilePipelineView` com wrapper que garante altura flex (a CSS variable `--pipeline-offset` ja esta definida globalmente em `App.css` — nao duplicar via inline style):

```tsx
// ANTES:
) : isMobile ? (
  <MobilePipelineView ... />
) : (

// DEPOIS:
) : isMobile ? (
  <div className="flex flex-col flex-1 min-h-0">
    <MobilePipelineView ... />
  </div>
) : (
```

Garantir que o container pai que envolve o bloco de viewMode tenha `flex flex-col flex-1 min-h-0` na cadeia ate o topo.

Adicionar padding proprio no header/filtros do Pipeline, ja que DashboardLayout remove o padding na rota `/pipeline`. O container `<div className="space-y-4 md:space-y-6">` do Pipeline ja deve ter `p-3 sm:p-4 md:p-6` ou equivalente.

### Mudanca 4 — `src/App.css`

Adicionar CSS custom property responsiva:

```css
:root {
  --pipeline-offset: 110px; /* mobile: 56px header + ~54px title/filters/gaps */
}

@media (min-width: 640px) {
  :root {
    --pipeline-offset: 124px; /* sm+: 64px header + ~60px title/filters/gaps */
  }
}
```

---

## Cobertura de Dispositivos

| Dispositivo | Resolucao | Por que funciona |
|-------------|-----------|-----------------|
| iPhone SE | 375x667 | `minHeight: 280px` garante conteudo visivel |
| iPhone 12/13/14 | 390x844 | `100dvh` + offset 110px = ~734px de altura util |
| iPhone 14 Pro Max | 430x932 | Offset generoso, sobra espaco |
| iPhone com notch/Dynamic Island | varios | `env(safe-area-inset-bottom)` no calc |
| Android Chrome | varios | `100dvh` cobre address bar dinamica |
| Android com gesture nav | varios | Sem safe area inset, `env()` retorna 0 |

O `minHeight: 280px` e o safety net final: mesmo que o calculo falhe completamente, o conteudo nunca colapsa para zero/tela preta.

---

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/components/MobilePipelineView.tsx` | Remover `useLayoutEffect` + `containerRef` + `containerHeight`; usar CSS `dvh` com custom property; corrigir race condition `activeStageId` |
| `src/components/DashboardLayout.tsx` | Detectar `/pipeline` e desativar `overflow-y-auto` + padding |
| `src/pages/Pipeline.tsx` | Wrapper com `flex-1 min-h-0` em volta do `MobilePipelineView`; padding proprio no header |
| `src/App.css` | CSS custom property `--pipeline-offset` responsiva |

---

## Testes

1. Chrome DevTools → Device Toolbar → iPhone 12 (390x844) → `/pipeline`
2. Verificar lista de etapas (pills) aparece
3. Verificar leads aparecem e lista e scrollavel verticalmente
4. Testar troca de etapa tocando nas pills
5. iPhone SE (375x667) — mesmo cenario
6. iPhone 14 Pro Max (430x932) — mesmo cenario
7. Verificar tela preta em loading, sem leads, com leads
8. Verificar que desktop continua funcionando normalmente
