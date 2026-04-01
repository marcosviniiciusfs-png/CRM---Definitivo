# Paginação do Funil de Vendas - Design Document

**Data:** 2026-04-01
**Status:** Aprovado
**Autor:** Claude

## Problema

O funil de vendas atual tem um limite fixo de 200 leads (global, não por etapa). Quando novos leads chegam via notificação Realtime mas o limite foi atingido, eles não aparecem na interface. O usuário precisa:

1. Visualizar até 1.000+ leads por etapa
2. Paginar os resultados com botão "Carregar mais"
3. Manter performance otimizada

## Solução

Implementar paginação por coluna com botão "Carregar mais". Cada etapa do funil carrega inicialmente 50 leads e pode expandir sob demanda.

## Especificações Técnicas

### 1. Estado de Paginação

```typescript
// Pipeline.tsx - Novo estado
interface StagePaginationState {
  loadedCount: number;      // Quantos leads estão carregados
  totalCount: number;       // Total no banco (para exibir "X de Y")
  isLoading: boolean;       // Loading state para o botão
  hasMore: boolean;         // Se há mais leads para carregar
}

const [stagePagination, setStagePagination] = useState<Record<string, StagePaginationState>>({});
```

### 2. Query Otimizada por Etapa

```typescript
// Carregar leads por etapa com paginação
const loadLeadsForStage = async (stageId: string, offset: number = 0, limit: number = 50) => {
  const { data, count } = await supabase
    .from('leads')
    .select('id, nome_lead, telefone_lead, ...', { count: 'exact' })
    .eq('funnel_stage_id', stageId)
    .order('position', { ascending: true })
    .range(offset, offset + limit - 1);

  return { data, count };
};
```

### 3. Componentes Afetados

#### Pipeline.tsx
- Remover `.limit(200)` global
- Adicionar estado `stagePagination`
- Adicionar função `loadMoreForStage(stageId)`
- Modificar `loadLeads` para carregar 50 por etapa
- Adicionar query de contagem total por etapa
- Atualizar handler Realtime para incrementar contagem

#### PipelineColumn.tsx
- Adicionar prop `pagination: StagePaginationState`
- Adicionar prop `onLoadMore: () => void`
- Exibir contador "Visíveis: X de Y"
- Adicionar botão "Carregar mais" no final da coluna
- Adicionar estado de loading no botão

### 4. UI da Coluna

```
┌─────────────────────────────┐
│ Novo Lead        [50/850]  │  ← Badge mostra (carregados / total)
│ ─────────────────────────── │
│ [Card 1]                    │
│ [Card 2]                    │
│ ...                         │
│ [Card 50]                   │
├─────────────────────────────┤
│   [Carregar mais (50)]      │  ← Botão com loading state
│   Carregados 50 de 850      │  ← Texto informativo
└─────────────────────────────┘
```

### 5. Fluxo de Carregamento

```
Initial Load:
1. Carregar contagem total por etapa (COUNT query)
2. Carregar primeiros 50 leads de cada etapa
3. Atualizar stagePagination com counts

User clica "Carregar mais":
1. Set loading = true para etapa
2. Query: OFFSET 50 LIMIT 50
3. Append leads ao estado existente
4. Update loadedCount
5. Set loading = false
```

### 6. Realtime (Novos Leads)

Quando novo lead chega via Realtime:
1. Adiciona ao estado local (se dentro dos 50 visíveis)
2. Incrementa `totalCount` da etapa
3. Se `loadedCount < 50`: mostra automaticamente
4. Se `loadedCount >= 50`: usuário precisa clicar "Carregar mais"

### 7. Performance

| Métrica | Antes | Depois |
|---------|-------|--------|
| Leads iniciais | 200 global | 50 por etapa |
| Queries iniciais | 1 query | 1 count + N queries (paralelas) |
| Memória | Todos 200 | Cresce sob demanda |
| Tempo carregamento | ~2s | ~500ms |

### 8. Arquivos a Modificar

1. `src/pages/Pipeline.tsx` - Lógica de paginação
2. `src/components/PipelineColumn.tsx` - UI de paginação

## Plano de Implementação

1. Modificar Pipeline.tsx para paginação por etapa
2. Modificar PipelineColumn.tsx para botão "Carregar mais"
3. Testar localmente
4. Validar funcionamento com dados reais

## Critérios de Aceitação

- [ ] Cada coluna carrega inicialmente 50 leads
- [ ] Botão "Carregar mais" funciona por coluna
- [ ] Contador exibe "X de Y" leads
- [ ] Novos leads via Realtime atualizam contador
- [ ] Performance mantida com 1.000+ leads por etapa
- [ ] Loading state visível durante carregamento
