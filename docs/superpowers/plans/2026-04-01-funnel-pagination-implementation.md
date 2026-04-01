# Paginação do Funil de Vendas - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar paginação por coluna no funil de vendas para suportar 1.000+ leads por etapa com botão "Carregar mais".

**Architecture:** Cada coluna do funil gerencia seu próprio estado de paginação. O componente Pipeline.tsx mantém um mapa de paginação por stage_id e executa queries sob demanda. PipelineColumn.tsx exibe o contador e botão de carregar mais.

**Tech Stack:** React, TypeScript, Supabase, TanStack Query

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/pages/Pipeline.tsx` | Estado de paginação, queries por etapa, handlers |
| `src/components/PipelineColumn.tsx` | UI do contador, botão "Carregar mais", loading state |

---

## Task 1: Adicionar Estado de Paginação no Pipeline.tsx

**Files:**
- Modify: `src/pages/Pipeline.tsx:127-145` (área de estados)

- [ ] **Step 1: Adicionar interface e estado de paginação**

Adicionar após a linha 48 (após os type definitions existentes):

```typescript
// Interface para estado de paginação por etapa
interface StagePaginationState {
  loadedCount: number;      // Quantos leads estão carregados
  totalCount: number;       // Total no banco (para exibir "X de Y")
  isLoading: boolean;       // Loading state para o botão
  hasMore: boolean;         // Se há mais leads para carregar
}
```

Adicionar após a linha 145 (após o estado `redistributedMap`):

```typescript
  // Estado de paginação por etapa
  const [stagePagination, setStagePagination] = useState<Record<string, StagePaginationState>>({});
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | head -50`
Expected: Build success ou erros de tipo conhecidos

- [ ] **Step 3: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: add StagePaginationState interface and state

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Modificar loadLeads para Paginação por Etapa

**Files:**
- Modify: `src/pages/Pipeline.tsx:658-731` (função loadLeads)

- [ ] **Step 1: Substituir função loadLeads existente**

Localizar a função `loadLeads` (aproximadamente linha 658) e substituí-la completamente por:

```typescript
  const loadLeads = async (funnelData?: { isCustom: boolean; funnel: any }, isTabChange: boolean = false) => {
    if (!user?.id || !organizationId) return;

    try {
      // Controlar estados de loading: Skeletons apenas se realmente necessário
      if (!isTabChange && leads.length === 0) {
        setInitialLoading(true);
      }
      setIsLoadingData(true);

      // Usar dados do funil passados ou estados atuais
      const isCustom = funnelData?.isCustom ?? usingCustomFunnel;
      const funnel = funnelData?.funnel ?? activeFunnel;

      // Buscar contagem total por etapa PRIMEIRO
      const stageIds = stages.map(s => s.id);
      const countPromises = stageIds.map(async (stageId) => {
        let query = supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId);

        // Aplicar filtro de permissão
        if (!permissions.canViewAllLeads && user?.id) {
          query = query.eq('responsavel_user_id', user.id);
        }

        // Filtrar por funil customizado ou padrão
        if (isCustom && funnel) {
          query = query.eq('funnel_id', funnel.id);
          // Para funil customizado, usar funnel_stage_id
          query = query.eq('funnel_stage_id', stageId);
        } else {
          query = query.is('funnel_id', null);
          // Para funil padrão, usar stage (string)
          query = query.eq('stage', stageId);
        }

        const { count, error } = await query;
        if (error) {
          console.error(`Erro ao contar leads da etapa ${stageId}:`, error);
          return { stageId, count: 0 };
        }
        return { stageId, count: count || 0 };
      });

      const countResults = await Promise.all(countPromises);
      const countMap = new Map(countResults.map(r => [r.stageId, r.count]));

      // Inicializar estado de paginação para cada etapa
      const initialPagination: Record<string, StagePaginationState> = {};
      stageIds.forEach(stageId => {
        const total = countMap.get(stageId) || 0;
        initialPagination[stageId] = {
          loadedCount: 0,
          totalCount: total,
          isLoading: false,
          hasMore: total > 0,
        };
      });
      setStagePagination(initialPagination);

      // Carregar primeiros 50 leads de cada etapa em paralelo
      const PAGE_SIZE = 50;
      const loadPromises = stageIds.map(async (stageId) => {
        const total = countMap.get(stageId) || 0;
        if (total === 0) return { stageId, leads: [] };

        let query = supabase
          .from('leads')
          .select('id, nome_lead, telefone_lead, email, stage, funnel_stage_id, funnel_id, position, avatar_url, responsavel, responsavel_user_id, valor, updated_at, created_at, source, descricao_negocio, duplicate_attempts_count')
          .eq('organization_id', organizationId);

        // Aplicar filtro de permissão
        if (!permissions.canViewAllLeads && user?.id) {
          query = query.eq('responsavel_user_id', user.id);
        }

        // Filtrar por funil
        if (isCustom && funnel) {
          query = query.eq('funnel_id', funnel.id);
          query = query.eq('funnel_stage_id', stageId);
        } else {
          query = query.is('funnel_id', null);
          query = query.eq('stage', stageId);
        }

        const { data, error } = await query
          .order('position', { ascending: true })
          .order('created_at', { ascending: false })
          .range(0, PAGE_SIZE - 1);

        if (error) {
          console.error(`Erro ao carregar leads da etapa ${stageId}:`, error);
          return { stageId, leads: [] };
        }

        return { stageId, leads: data || [] };
      });

      const loadResults = await Promise.all(loadPromises);

      // Combinar todos os leads
      const allLeads: Lead[] = [];
      loadResults.forEach(result => {
        allLeads.push(...result.leads);

        // Atualizar paginação com contagem carregada
        setStagePagination(prev => ({
          ...prev,
          [result.stageId]: {
            ...prev[result.stageId],
            loadedCount: result.leads.length,
            hasMore: result.leads.length < (prev[result.stageId]?.totalCount || 0),
          }
        }));
      });

      setLeads(allLeads);

      // Armazenar IDs dos leads para deduplicação
      leadIdsRef.current = new Set(allLeads.map(l => l.id));

      // Carregar dados relacionados em paralelo
      if (allLeads.length > 0) {
        const responsavelIds = [...new Set(allLeads.map(l => l.responsavel_user_id).filter(Boolean))] as string[];
        await Promise.all([
          loadLeadItems(allLeads.map(l => l.id)),
          loadLeadTags(allLeads.map(l => l.id)),
          loadProfiles(responsavelIds),
          loadAgendamentos(allLeads.map(l => l.id)),
          loadRedistributionData(allLeads.map(l => l.id)),
        ]);
      }
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
      toast.error("Erro ao carregar leads");
    } finally {
      setIsLoadingData(false);
      setInitialLoading(false);
      setIsTabTransitioning(false);
    }
  };
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | head -50`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: implement per-stage pagination in loadLeads

- Remove global limit of 200 leads
- Add per-stage count query
- Load 50 leads per stage initially
- Update pagination state with counts

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Adicionar Função loadMoreForStage

**Files:**
- Modify: `src/pages/Pipeline.tsx` (após a função loadLeads)

- [ ] **Step 1: Adicionar função loadMoreForStage**

Adicionar após a função `loadLeads` (aproximadamente linha 730):

```typescript
  // Carregar mais leads para uma etapa específica
  const loadMoreForStage = async (stageId: string) => {
    if (!organizationId || !user?.id) return;

    const currentPagination = stagePagination[stageId];
    if (!currentPagination || currentPagination.isLoading || !currentPagination.hasMore) return;

    // Set loading state
    setStagePagination(prev => ({
      ...prev,
      [stageId]: { ...prev[stageId], isLoading: true }
    }));

    try {
      const PAGE_SIZE = 50;
      const offset = currentPagination.loadedCount;

      const isCustom = usingCustomFunnel;
      const funnel = activeFunnel;

      let query = supabase
        .from('leads')
        .select('id, nome_lead, telefone_lead, email, stage, funnel_stage_id, funnel_id, position, avatar_url, responsavel, responsavel_user_id, valor, updated_at, created_at, source, descricao_negocio, duplicate_attempts_count')
        .eq('organization_id', organizationId);

      // Aplicar filtro de permissão
      if (!permissions.canViewAllLeads && user?.id) {
        query = query.eq('responsavel_user_id', user.id);
      }

      // Filtrar por funil
      if (isCustom && funnel) {
        query = query.eq('funnel_id', funnel.id);
        query = query.eq('funnel_stage_id', stageId);
      } else {
        query = query.is('funnel_id', null);
        query = query.eq('stage', stageId);
      }

      const { data, error } = await query
        .order('position', { ascending: true })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        // Adicionar novos leads ao estado
        setLeads(prev => {
          const existingIds = new Set(prev.map(l => l.id));
          const newLeads = data.filter(l => !existingIds.has(l.id));
          return [...prev, ...newLeads];
        });

        // Atualizar IDs ref
        data.forEach(l => leadIdsRef.current.add(l.id));

        // Atualizar paginação
        setStagePagination(prev => ({
          ...prev,
          [stageId]: {
            ...prev[stageId],
            loadedCount: prev[stageId].loadedCount + data.length,
            hasMore: prev[stageId].loadedCount + data.length < prev[stageId].totalCount,
            isLoading: false,
          }
        }));

        // Carregar dados relacionados para novos leads
        await Promise.all([
          loadLeadItems(data.map(l => l.id)),
          loadLeadTags(data.map(l => l.id)),
          loadProfiles(data.map(l => l.responsavel_user_id).filter(Boolean) as string[]),
          loadAgendamentos(data.map(l => l.id)),
          loadRedistributionData(data.map(l => l.id)),
        ]);
      } else {
        // No more data
        setStagePagination(prev => ({
          ...prev,
          [stageId]: { ...prev[stageId], hasMore: false, isLoading: false }
        }));
      }
    } catch (error) {
      console.error(`Erro ao carregar mais leads da etapa ${stageId}:`, error);
      toast.error("Erro ao carregar mais leads");
      setStagePagination(prev => ({
        ...prev,
        [stageId]: { ...prev[stageId], isLoading: false }
      }));
    }
  };
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | head -50`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: add loadMoreForStage function for pagination

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Atualizar Realtime Handler para Incrementar Contagem

**Files:**
- Modify: `src/pages/Pipeline.tsx:354-416` (handler INSERT leads)

- [ ] **Step 1: Atualizar handler de INSERT para incrementar totalCount**

Localizar o handler de INSERT de leads (aproximadamente linha 354) e modificar a seção que adiciona novos leads. Adicionar após a linha que faz `setLeads(prev => [newLead, ...prev]);`:

Substituir o bloco dentro do handler INSERT (de `if (!leadIdsRef.current.has(newLead.id))` até o fechamento do if) por:

```typescript
          // Verificar se é realmente um lead novo (não carregado anteriormente)
          if (!leadIdsRef.current.has(newLead.id)) {
            // Determinar o stageId correto
            const stageId = usingCustomFunnelRef.current
              ? newLead.funnel_stage_id
              : (newLead.stage || "NOVO");

            // Adicionar ao estado
            setLeads(prev => [newLead, ...prev]);
            leadIdsRef.current.add(newLead.id);

            // Incrementar contador total da etapa
            setStagePagination(prev => {
              const current = prev[stageId] || { loadedCount: 0, totalCount: 0, isLoading: false, hasMore: false };
              const newTotalCount = current.totalCount + 1;
              const newLoadedCount = current.loadedCount + 1;

              return {
                ...prev,
                [stageId]: {
                  ...current,
                  totalCount: newTotalCount,
                  loadedCount: newLoadedCount,
                  hasMore: newLoadedCount < newTotalCount,
                }
              };
            });

            // Carregar perfil do responsável se disponível
            const uid = (newLead as any).responsavel_user_id;
            if (uid) {
              supabase
                .from('profiles')
                .select('user_id, full_name, avatar_url')
                .eq('user_id', uid)
                .single()
                .then(({ data }) => {
                  if (data) {
                    setProfilesMap(prev => ({
                      ...prev,
                      [data.user_id]: { full_name: data.full_name || '', avatar_url: data.avatar_url },
                    }));
                  }
                });
            }
          }
```

- [ ] **Step 2: Verificar que o código compila**

Run: `npm run build 2>&1 | head -50`
Expected: Build success

- [ ] **Step 3: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: update Realtime handler to increment pagination count

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Atualizar PipelineColumn Props

**Files:**
- Modify: `src/components/PipelineColumn.tsx:9-26` (interface)

- [ ] **Step 1: Adicionar props de paginação à interface**

Substituir a interface `PipelineColumnProps` por:

```typescript
interface StagePaginationState {
  loadedCount: number;
  totalCount: number;
  isLoading: boolean;
  hasMore: boolean;
}

interface PipelineColumnProps {
  id: string;
  title: string;
  count: number;
  color: string;
  leads: Lead[];
  isEmpty?: boolean;
  onLeadUpdate?: () => void;
  onEdit?: (lead: Lead) => void;
  onDelete?: (lead: Lead) => void;
  leadItems: Record<string, any[]>;
  leadTagsMap: Record<string, Array<{ id: string; name: string; color: string }>>;
  isDraggingActive: boolean;
  profilesMap?: Record<string, { full_name: string; avatar_url: string | null }>;
  duplicateLeadIds?: Set<string>;
  agendamentosMap?: Record<string, { reuniao?: string | null; venda?: string | null }>;
  redistributedMap?: Record<string, { fromName: string; minutes: number }>;
  // Props de paginação
  pagination?: StagePaginationState;
  onLoadMore?: () => void;
}
```

- [ ] **Step 2: Adicionar desestruturação das novas props**

Modificar a desestruturação no componente (linha 28-45) para incluir:

```typescript
export const PipelineColumn = memo(({
  id,
  title,
  count,
  color,
  leads,
  isEmpty,
  onLeadUpdate,
  onEdit,
  onDelete,
  leadItems,
  leadTagsMap,
  isDraggingActive,
  profilesMap = {},
  duplicateLeadIds,
  agendamentosMap = {},
  redistributedMap = {},
  pagination,
  onLoadMore,
}: PipelineColumnProps) => {
```

- [ ] **Step 3: Verificar que o código compila**

Run: `npm run build 2>&1 | head -50`
Expected: Build success

- [ ] **Step 4: Commit**

```bash
git add src/components/PipelineColumn.tsx
git commit -m "feat: add pagination props to PipelineColumn interface

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Adicionar UI de Paginação na Coluna

**Files:**
- Modify: `src/components/PipelineColumn.tsx:53-130` (retorno do componente)

- [ ] **Step 1: Atualizar contador do badge**

Modificar o badge de contagem (linha 57-66) para exibir "carregados/total":

```typescript
        <Badge
          className={cn(
            "rounded-full w-auto min-w-6 h-6 flex items-center justify-center px-2 text-xs",
            isHexColor(color) ? "text-white" : "",
            !isHexColor(color) && color
          )}
          style={isHexColor(color) ? { backgroundColor: color } : undefined}
        >
          {pagination ? `${pagination.loadedCount}/${pagination.totalCount}` : count}
        </Badge>
```

- [ ] **Step 2: Adicionar botão "Carregar mais" ao final da coluna**

Substituir o conteúdo do `SortableContext` div (linha 74-128) por:

```typescript
      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "pipeline-column space-y-2 min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto p-2 rounded-lg scrollbar-hide",
            !isDraggingActive && "transition-colors duration-200",
            isOver && "bg-muted/50 ring-2 ring-primary/20"
          )}
        >
          {isEmpty ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum lead nesta etapa
            </p>
          ) : (
            leads.map((lead) => {
              const responsavelProfile = lead.responsavel_user_id
                ? profilesMap[lead.responsavel_user_id]
                : undefined;
              // Fallback: se o perfil não foi carregado mas o campo texto existe, usa ele
              const responsavelName = responsavelProfile?.full_name || (lead as any).responsavel || undefined;
              const responsavelAvatarUrl = responsavelProfile?.avatar_url || undefined;
              return (
                <SortableLeadCard
                  key={lead.id}
                  id={lead.id}
                  name={lead.nome_lead}
                  phone={lead.telefone_lead}
                  email={(lead as any).email}
                  date={(lead as any).formattedDate || new Date(lead.created_at).toLocaleString("pt-BR")}
                  avatarUrl={lead.avatar_url}
                  stage={lead.stage}
                  value={lead.valor}
                  createdAt={lead.created_at}
                  source={lead.source}
                  description={lead.descricao_negocio}
                  onUpdate={onLeadUpdate}
                  onEdit={() => onEdit?.(lead)}
                  onDelete={() => onDelete?.(lead)}
                  leadItems={leadItems[lead.id] || []}
                  leadTags={leadTagsMap[lead.id] || []}
                  isDraggingActive={isDraggingActive}
                  responsavelName={responsavelName}
                  responsavelAvatarUrl={responsavelAvatarUrl}
                  isDuplicate={duplicateLeadIds ? duplicateLeadIds.has(lead.id) : false}
                  dataAgendamentoReuniao={agendamentosMap[lead.id]?.reuniao}
                  dataAgendamentoVenda={agendamentosMap[lead.id]?.venda}
                  isRedistributed={!!redistributedMap[lead.id]}
                  redistributedFromName={redistributedMap[lead.id]?.fromName}
                  redistributionMinutes={redistributedMap[lead.id]?.minutes}
                />
              );
            })
          )}

          {/* Botão Carregar Mais */}
          {pagination && pagination.hasMore && (
            <button
              onClick={onLoadMore}
              disabled={pagination.isLoading}
              className={cn(
                "w-full py-2 px-3 text-xs font-medium rounded-md transition-colors",
                "border border-dashed border-muted-foreground/30",
                "hover:border-primary/50 hover:bg-muted/50",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {pagination.isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Carregando...
                </span>
              ) : (
                `Carregar mais (${Math.min(50, pagination.totalCount - pagination.loadedCount)})`
              )}
            </button>
          )}

          {/* Info de paginação */}
          {pagination && pagination.totalCount > 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-1">
              Exibindo {pagination.loadedCount} de {pagination.totalCount} leads
            </p>
          )}
        </div>
      </SortableContext>
```

- [ ] **Step 3: Verificar que o código compila**

Run: `npm run build 2>&1 | head -50`
Expected: Build success

- [ ] **Step 4: Commit**

```bash
git add src/components/PipelineColumn.tsx
git commit -m "feat: add Load More button and pagination UI to PipelineColumn

- Display loaded/total count in badge
- Add clickable Load More button
- Show loading spinner during fetch
- Display 'Exibindo X de Y' info text

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Passar Props de Paginação do Pipeline para Coluna

**Files:**
- Modify: `src/pages/Pipeline.tsx:1673-1696` (render PipelineColumn)

- [ ] **Step 1: Passar props de paginação para PipelineColumn**

Localizar onde `PipelineColumn` é renderizado dentro do `TabsContent` (aproximadamente linha 1673) e modificar:

```typescript
                      <PipelineColumn
                        key={`${selectedFunnelId}-${stage.id}`}
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
```

- [ ] **Step 2: Atualizar também o render do funil padrão (sem tabs)**

Localizar o segundo local onde `PipelineColumn` é renderizado (fora do Tabs, aproximadamente linha 1710) e aplicar as mesmas mudanças:

```typescript
                  <PipelineColumn
                    key={`default-${stage.id}`}
                    id={stage.id}
                    title={stage.title}
                    count={stageLeads.length}
                    color={stage.color}
                    leads={stageLeads}
                    isEmpty={stageLeads.length === 0}
                    onLeadUpdate={() => loadLeads(undefined, false)}
                    onEdit={handleEditLead}
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
```

- [ ] **Step 3: Verificar que o código compila**

Run: `npm run build 2>&1 | head -50`
Expected: Build success

- [ ] **Step 4: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: pass pagination props to PipelineColumn components

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Testar Localmente

**Files:**
- Nenhum arquivo a modificar

- [ ] **Step 1: Iniciar servidor de desenvolvimento**

Run: `npm run dev`

- [ ] **Step 2: Abrir navegador e navegar para o funil de vendas**

Abrir: `http://localhost:5173/pipeline`

- [ ] **Step 3: Verificar comportamento**

Verificar:
1. Badge mostra "50/X" em cada coluna
2. Botão "Carregar mais" aparece no final de cada coluna
3. Clicar no botão carrega mais 50 leads
4. Loading spinner aparece durante carregamento
5. Texto "Exibindo X de Y" aparece no final

- [ ] **Step 4: Parar servidor**

Ctrl+C no terminal

---

## Summary

Este plano implementa paginação por coluna no funil de vendas:

1. **Task 1**: Adiciona interface e estado de paginação
2. **Task 2**: Refatora loadLeads para carregar 50 por etapa
3. **Task 3**: Adiciona função loadMoreForStage
4. **Task 4**: Atualiza handler Realtime para incrementar contagem
5. **Task 5**: Adiciona props de paginação ao PipelineColumn
6. **Task 6**: Implementa UI do botão "Carregar mais"
7. **Task 7**: Conecta props entre Pipeline e PipelineColumn
8. **Task 8**: Testa localmente

## Critérios de Aceitação

- [ ] Cada coluna carrega inicialmente 50 leads
- [ ] Botão "Carregar mais" funciona por coluna
- [ ] Contador exibe "X/Y" leads
- [ ] Novos leads via Realtime atualizam contador
- [ ] Performance mantida com 1.000+ leads por etapa
- [ ] Loading state visível durante carregamento
