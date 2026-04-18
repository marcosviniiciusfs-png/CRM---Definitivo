# Equipes Page Redesign

## Objetivo

Redesenhar completamente o layout/JSX da pagina `src/pages/Equipes.tsx` preservando 100% da logica existente (queries Supabase, drag-and-drop dnd-kit, modais, handlers, AlertDialog). Apenas o JSX/layout muda.

## Escopo

- **Unico arquivo modificado**: `src/pages/Equipes.tsx`
- **Nenhuma mudanca logica**: queries, mutations, drag handlers, modais permanecem identicos
- **Novos estados adicionados**: `teamFilter`, `weeklyLeads` (useQuery separado)
- **Novos imports**: `Clock`, `Plus`, `cn`, `getInitials` (de `@/components/roulette/utils`)

## Design System

- Primary: `hsl(var(--primary))` = `hsl(357 75% 52%)` (vermelho)
- Dark mode: bg preto puro `hsl(0 0% 0%)`
- Tokens exclusivos: `bg-primary`, `text-primary`, `bg-muted`, `text-muted-foreground`, `border`, `bg-card`, `text-foreground`, `bg-destructive`, `text-destructive`
- Nenhuma classe customizada nova - apenas Tailwind + tokens existentes

## Estrutura do Layout

### 1. Header
- Titulo "Equipes" com subtitulo descritivo
- Botoes: "Metas" (outline, com icone Clock) e "Nova equipe" (primary, apenas para owner)

### 2. Stats Bar (4 metricas)
Layout: `grid grid-cols-2 md:grid-cols-4 gap-3`

| Metrica | Valor | Subtitulo |
|---------|-------|-----------|
| Equipes | `teams.length` | "todas ativas" com dot verde `bg-success` |
| Membros alocados | membros unicos em equipes | `X sem equipe` |
| Leads esta semana | useQuery `leads` org com `created_at >= 7 dias atras` | delta semanal |
| Conversao media | `% leads com stage != 'NOVO_LEAD'` | "para pipeline" |

Cada card: `bg-muted/50 rounded-lg p-3` com label uppercase `text-[11px]`, valor `text-[22px] font-semibold`, subtitulo `text-[11px]`.

### 3. Barra de Busca e Filtros
- Input com icone Search (pl-9, h-9)
- 4 botoes pill: "Todas", "Com lider", "Sem lider", "Meta em risco"
- Estado `teamFilter` (default: "Todas")
- Logica de filtro:
  - "Todas": sem filtro adicional
  - "Com lider": `t => !!t.leader_id`
  - "Sem lider": `t => !t.leader_id`
  - "Meta em risco": filtra equipes cuja meta principal tem progresso < 30%

### 4. Grid de Equipes (cards redesenhados)
Layout: `grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3`

Cada card:
- Stripe colorida no topo: `h-[3px]` com `background: team.color`
- Avatar da equipe: iniciais sobre fundo `team.color`, `rounded-lg`
- Nome + descricao/membros
- Dropdown com opcoes existentes (Editar, Metas, Excluir)
- Bloco de lider: avatar + nome + badge "Lider" com cores do time
- Area de metas expansivel (TeamGoalsCard)
- Lista de membros com SortableContext
- Drop zone vazia com borda dashed
- Progress bar da meta principal (busca `team_goals` tipo `sales_count` ou `leads_converted`)
- Footer com contagem de membros + botao "Metas"

### 5. DraggableMember (redesenhado)
- Layout compacto: `gap-2 px-2.5 py-1.5`
- Avatar `h-6 w-6` com iniciais via `getInitials`
- Nome `text-xs truncate`
- MemberTaskBadge
- Crown icon se lider
- Grip handle visual (3 linhas horizontais)

### 6. Card "Sem equipe" (redesenhado)
- Borda dashed, `col-span-full`
- Icone UserX + titulo + subtitulo
- Grid interno: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Mesmos DraggableMembers com SortableContext

### 7. DragOverlay
- Estilizado para combinar com novo DraggableMember
- Avatar h-7 w-7, nome text-xs, fundo bg-card com shadow

## Novos Dados/Queries

### `teamGoals` query
Um unico `useQuery` que busca todas as metas das equipes da organizacao de uma vez:
```
supabase.from('team_goals').select('*').eq('organization_id', orgId).order('created_at', { ascending: false })
```
Retorna mapa `teamId -> goal[]` para lookup rapido por card.

### `weeklyLeads` query
```
supabase.from('leads').select('*', { count: 'exact', head: true })
  .eq('organization_id', orgId)
  .gte('created_at', subDays(new Date(), 7).toISOString())
```

### Taxa de conversao
Calculada client-side: percentual de leads com `stage !== 'NOVO_LEAD'` sobre total de leads da org.

## Regras

1. Logica existente 100% preservada
2. TypeScript estrito - sem `any` desnecessario
3. Importar `getInitials` de `@/components/roulette/utils`
4. `TooltipProvider` permanece no wrapper externo
5. DragOverlay existente preservado com novo estilo
6. Filtro "Meta em risco" requer acesso aos team_goals data
7. Dark mode automatico via tokens CSS
