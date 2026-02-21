
# Auditoria de Redundancias, Persistencia de Paginas e Otimizacao de Producao

## 1. Auditoria Completa de Redundancias

### 1.1 "Top Vendedores vs Meta" no Colaboradores Dashboard
**Problema:** O componente `TopSalesReps` mostra vendedores vs meta, mas a meta usa valor fallback fixo de R$50.000 (`target: userGoal?.target_value || 50000`). A tabela `goals` existe e tem registros, mas nao ha interface para o admin/owner definir metas individuais por colaborador.
**Decisao:** MANTER e MELHORAR. A tabela `goals` ja existe. Vamos adicionar um pequeno botao de "Definir Meta" ao lado do titulo ou dentro do seletor de colaborador, permitindo que admins/owners definam a meta de faturamento de cada colaborador. Isso torna o componente funcional de verdade.

### 1.2 "TeamSalesMetrics" nas Equipes vs "Times Ativos" no Ranking
**Problema:** A pagina Equipes mostra `TeamSalesMetrics` (ranking de vendas por equipe do mes). A pagina Ranking mostra apenas "Times Ativos" (avatares dos times, sem metricas). O usuario quer mover o ranking de equipes para dentro do Ranking, substituindo "Times Ativos".
**Decisao:** MOVER. Substituir o footer "Times Ativos" no Ranking pelo componente `TeamSalesMetrics` adaptado. Manter tambem nas Equipes (la e contextual).

### 1.3 "SalesGauge" no Colaboradores Dashboard
**Problema:** O gauge de vendas usa `totalTarget` calculado como a soma de todas as metas de goals, ou fallback de R$100.000. Sem interface de definicao de meta global, esse valor e arbitrario.
**Decisao:** MELHORAR junto com 1.1 - quando as metas individuais estiverem funcionais, o gauge refletira os valores corretos.

### 1.4 "ForecastByOwner" no Colaboradores Dashboard
**Problema:** Mostra previsao por vendedor. Funciona corretamente baseado nos leads ganhos. 
**Decisao:** MANTER. Funcional.

### 1.5 Goals individuais (tabela `goals`) - `current_value` sempre 0
**Problema:** A tabela `goals` tem 4 registros, todos com `current_value: 0`. O `current_value` nunca e atualizado automaticamente quando leads sao ganhos.
**Decisao:** CORRIGIR. O `current_value` nao e usado em nenhum lugar critico (os dashboards calculam vendas diretamente dos leads). Ignorar esse campo por ora, mas garantir que o `target_value` seja editavel.

## 2. Persistencia de Paginas (React Query)

### Paginas que JA usam React Query (persistentes):
- Dashboard (**OK** - `staleTime: 5min`)
- Ranking (**OK** - `staleTime: 5min`)

### Paginas que NAO usam React Query (recarregam toda vez):
- Colaboradores - usa `useState` + `useEffect` + `loadOrganizationData()`
- Equipes - usa `useState` + `useEffect` + `loadData()`
- Pipeline - usa `useState` + `useEffect` + `loadLeads()`
- Leads - usa hooks customizados mas sem React Query
- Chat - usa `useState` + `useEffect`
- Producao - usa `useState` + `useEffect` + `loadItems()` e `loadProductionBlocks()`
- CollaboratorDashboard (sub-componente) - usa `useState` + `useEffect`

### Paginas a migrar para React Query (prioridade):
1. **Colaboradores** - recarrega toda a lista ao voltar
2. **Equipes** - recarrega ao voltar  
3. **Producao** - recarrega ao voltar
4. **CollaboratorDashboard** - recarrega ao mudar de aba ou voltar

Pipeline, Leads e Chat sao mais complexos (paginacao infinita, realtime pesado) e seriam migrados em uma fase posterior.

## 3. Blocos de Producao - Eficiencia

**Problemas identificados:**
- O `ProductionDashboard` faz multiplas queries sequenciais: getUser -> getMember -> ensureBlock -> calculateMetrics (que faz mais 2-3 queries) -> loadBlocks
- A funcao `ensureCurrentMonthBlock` SEMPRE recalcula metricas, mesmo quando nada mudou
- Listener de realtime no componente faz queries adicionais a cada update de lead

**Melhorias:**
- Migrar para React Query com `staleTime: 5min`
- Usar `organizationId` do contexto em vez de buscar getUser/getMember toda vez
- Calcular metricas apenas quando o bloco e criado pela primeira vez ou quando explicitamente solicitado
- Simplificar o realtime para apenas invalidar o cache

## Alteracoes Tecnicas

### Arquivo: `src/pages/Ranking.tsx`
- Substituir o footer "Times Ativos" pelo componente `TeamSalesMetrics`
- Buscar `teamMembers` junto com `teams` na query existente
- Renderizar `TeamSalesMetrics` abaixo do leaderboard em ambas as abas (tasks e sales)

### Arquivo: `src/pages/Colaboradores.tsx`
- Migrar `loadOrganizationData` para `useQuery` com `staleTime: 5min`
- Usar `queryClient.invalidateQueries` nas operacoes de CRUD

### Arquivo: `src/pages/Equipes.tsx`
- Migrar `loadData` para `useQuery` com `staleTime: 5min`
- Usar `queryClient.invalidateQueries` nas operacoes de CRUD

### Arquivo: `src/components/ProductionDashboard.tsx`
- Migrar para `useQuery` com `staleTime: 5min`
- Usar `organizationId` do contexto (`useOrganizationReady`)
- Simplificar: so calcular metricas na criacao do bloco, nao a cada load
- Realtime invalida cache em vez de recalcular tudo

### Arquivo: `src/components/CollaboratorDashboard.tsx`
- Migrar `loadDashboardData` para `useQuery` com `staleTime: 5min`
- Cache por `orgId + period + selectedCollaborator`

### Arquivo: `src/components/dashboard/TopSalesReps.tsx`
- Renomear titulo de "Top Vendedores vs Meta" para "Top Vendedores" (remover referencia a meta que nao funciona ainda)
- Manter a barra de progresso mas sem o label "vs Meta"

## Resumo de Impacto

| Alteracao | Impacto |
|-----------|---------|
| Ranking: substituir Times Ativos por TeamSalesMetrics | Informacao util em vez de avatares decorativos |
| TopSalesReps: remover referencia a "Meta" | Elimina confusao sobre funcionalidade inexistente |
| 5 componentes migrados para React Query | Paginas persistentes, sem reload ao navegar de volta |
| ProductionDashboard otimizado | Menos queries, carregamento mais rapido |
