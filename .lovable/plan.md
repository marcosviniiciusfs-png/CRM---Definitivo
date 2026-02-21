

# Estabilizar Carregamento e Cache de Paginas

## Problema 1 - Metricas nao carrega

A pagina LeadMetrics tem um bug na logica do `useEffect`. O estado `loading` comeca como `true`, mas o `useEffect` depende de `[user, shouldLoadMetrics]`. Quando o `user` chega do auth (com delay), o `shouldLoadMetrics` pode ja ter sido consumido, ou a condicao falha porque `user` ainda nao existia no primeiro render. Resultado: a pagina fica presa em "Carregando metricas..." para sempre.

**Correcao**: Simplificar o useEffect para depender de `isReady` e `organizationId` (vindos do `useOrganizationReady`), removendo o flag `shouldLoadMetrics` desnecessario. Carregar metricas assim que `isReady && organizationId` estiver disponivel.

## Problema 2 - Paginas recarregam ao navegar

Todas as paginas (Dashboard, Pipeline, LeadMetrics, Ranking, etc.) usam `useState` + `useEffect` para buscar dados. Quando o usuario navega para outra pagina e volta, o componente desmonta e remonta, perdendo todo o estado e refazendo todas as queries do zero.

**Correcao**: O projeto ja tem `@tanstack/react-query` instalado e configurado com `staleTime: 5 minutos`. Basta converter as funcoes de fetch para usar `useQuery`, que mantem os dados em cache global (no `QueryClient`). Quando o usuario volta para a pagina, os dados aparecem instantaneamente do cache.

## Mudancas por arquivo

### 1. `src/pages/LeadMetrics.tsx`

- Remover o estado `shouldLoadMetrics` e o `loading` manual
- Usar `useQuery` para buscar as metricas (facebook, whatsapp, manual)
- Usar `useQuery` separado para ads metrics
- O `useEffect` atual sera substituido por queries declarativas que dependem de `organizationId`
- O estado de loading vira do `isLoading` do useQuery
- Dados ficam em cache: ao voltar para a pagina, aparecem instantaneamente

```typescript
// ANTES (quebrado):
const [loading, setLoading] = useState(true);
const [shouldLoadMetrics, setShouldLoadMetrics] = useState(true);
useEffect(() => {
  if (user && shouldLoadMetrics) { loadMetrics(); }
}, [user, shouldLoadMetrics]);

// DEPOIS (estavel):
const { data: metricsData, isLoading } = useQuery({
  queryKey: ['lead-metrics', organizationId, dateRange],
  queryFn: () => fetchAllMetrics(organizationId!, dateRange),
  enabled: !!organizationId && !!dateRange?.from && !!dateRange?.to,
  staleTime: 1000 * 60 * 5,
});
```

### 2. `src/pages/Dashboard.tsx`

- Converter `loadMetrics`, `loadConversionData`, `loadTopSellers`, `loadLossRate`, `loadGoal`, `loadLastContribution` para `useQuery`
- Manter as subscriptions realtime, mas em vez de chamar as funcoes diretamente, usar `queryClient.invalidateQueries` para atualizar o cache
- Resultado: Dashboard carrega instantaneamente ao voltar

```typescript
// Realtime atualiza via invalidation:
supabase.channel('dashboard-leads')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  })
  .subscribe();
```

### 3. `src/pages/Pipeline.tsx`

- Converter fetch de leads, stages e funnels para `useQuery`
- Pipeline e a pagina mais pesada; cache evita reload completo ao voltar

### 4. `src/pages/Ranking.tsx`

- Converter fetch de ranking data para `useQuery`

### 5. `src/pages/Leads.tsx`

- Converter fetch de leads para `useQuery`

## Resumo de arquivos

| Arquivo | Acao |
|---------|------|
| `src/pages/LeadMetrics.tsx` | Corrigir bug de loading + converter para useQuery |
| `src/pages/Dashboard.tsx` | Converter para useQuery + invalidation no realtime |
| `src/pages/Pipeline.tsx` | Converter para useQuery |
| `src/pages/Ranking.tsx` | Converter para useQuery |
| `src/pages/Leads.tsx` | Converter para useQuery |

## Resultado esperado

1. LeadMetrics carrega corretamente (bug de loading corrigido)
2. Todas as paginas carregam dados do cache ao voltar (sem loading spinner)
3. Dados continuam atualizados via realtime (invalidation)
4. Primeira visita carrega normalmente; visitas subsequentes sao instantaneas por 5 minutos

