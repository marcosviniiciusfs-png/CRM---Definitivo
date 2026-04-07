---
name: Redistribuicao com Progresso e Correcoes
description: Barra de progresso para redistribuicao, correcao do refresh ao trocar aba, e visibilidade de funis bloqueados
type: project
---

# Redistribuicao com Progresso e Correcoes

## Problemas

1. **Redistribuicao sem feedback visual**: Ao redistribuir muitos leads (500+), o usuario nao ve o progresso - apenas um spinner e uma mensagem final. O processamento demora e nao ha indicacao de quanto falta.

2. **Refresh ao trocar de aba**: Quando o usuario muda de aba no navegador ou app e volta para o CRM, a pagina recarrega completamente do zero, perdendo todo o contexto e estado atual.

3. **Funis bloqueados visiveis para membros**: Quando um funil esta bloqueado, membros sem acesso ainda conseguem ver o funil na lista (mesmo que sem os leads deles). O comportamento esperado e que o funil seja completamente invisivel.

---

## Solucoes

---
name: progress-bar-redistribution
description: Barra de progresso visual para redistribuicao de leads em massa
---

### 1. Barra de Progresso na Redistribuicao

**Backend (Edge Function `redistribute-unassigned-leads`):**

Modificar para processar leads em lotes de 50 e retornar progresso:

```typescript
// Novo retorno com progresso
return {
  success: true,
  total: unassignedLeads.length,
  processed: processedCount,
  batch_complete: processedCount >= unassignedLeads.length,
  redistributed_count: redistributedCount,
  errors: errors.length > 0 ? errors : undefined
};
```

**Frontend (`LeadDistributionList.tsx`):**

```tsx
interface ProgressState {
  total: number;
  processed: number;
  isRunning: boolean;
}

// Polling a cada 1 segundo ate completar
useEffect(() => {
  if (!progress.isRunning) return;

  const interval = setInterval(async () => {
    const { data } = await supabase.functions.invoke('redistribute-unassigned-leads', {
      body: { organization_id: organizationId, check_progress: true }
    });

    setProgress({
      total: data.total,
      processed: data.processed,
      isRunning: !data.batch_complete
    });
  }, 1000);

  return () => clearInterval(interval);
}, [progress.isRunning]);
```

**UI:**
- Barra de progresso visual: `[████████░░░░] 127/500`
- Texto: "Redistribuindo 127 de 500 leads..."
- Botao "Cancelar" durante processamento

---
name: fix-page-refresh
description: Correcao do refresh da pagina ao trocar de aba
---

### 2. Correcao do Refresh ao Trocar Aba

**Causa raiz:** O `beforeunload` handler em `useChatPresence.ts` impede o bfcache (back-forward cache) do navegador, Isso causa uma recarga completa quando o usuario volta para a aba.

**Solucao:** Remover o `beforeunload` handler e usar abordagem alternativa para presenca WhatsApp.

**Arquivo:** `src/hooks/useChatPresence.ts`

**Antes:**
```typescript
window.addEventListener("beforeunload", handleBeforeUnload);
```

**Depois:**
```typescript
// Remover beforeunload - usar visibilitychange para atualizar presenca
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      setPresence("unavailable");
    } else {
      setPresence("available");
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
}, []);
```

**Beneficios:**
- Navegador pode usar bfcache corretamente
- Pagina e restaurada instantaneamente ao voltar
- Presenca WhatsApp atualizada quando aba fica visivel/oculta

---
name: blocked-funnels-invisible
description: Tornar funis bloqueados completamente invisiveis para membros sem acesso
---

### 3. Funis Bloqueados Invisiveis para Membros

**Comportamento esperado:**
- **Owners/Admins**: Veem todos os funis e leads normalmente
- **Members**:
  - Funil bloqueado (sem acesso): **Completamente invisivel na lista**
  - Funil liberado: Visivel normalmente

**Implementacao:**

**Backend (Database Query em `Pipeline.tsx`):**

```typescript
// Filtrar funis que o membro pode ver
let funnelQuery = supabase
  .from('sales_funnels')
  .select('*')
  .eq('organization_id', organizationId);

// Se nao for owner/admin, filtrar funis bloqueados sem acesso
if (!permissions.canViewAllLeads) {
  funnelQuery = funnelQuery.or('is_active.eq.true', `id.in.${accessibleFunnelIds}`);
}

// Ou usar uma RPC/View do banco:
// SELECT * FROM sales_funnels
// WHERE organization_id = ? AND (
//   is_active = true OR
//   id IN (SELECT funnel_id FROM funnel_collaborators WHERE user_id = ?)
// )
```

**Frontend (`Pipeline.tsx`):**

```typescript
// Buscar funis que o usuario pode ver
const { data: funnels } = await supabase
  .from('sales_funnels')
  .select('*')
  .eq('organization_id', organizationId)
  .or('is_active.eq.true', `id.in.(${accessibleFunnelIds})`);

// Ou usar RPC:
const { data: visibleFunnels } = await supabase.rpc('get_visible_funnels', {
  org_id: organizationId
});
```

---

## Arquivos Afetados

1. `supabase/functions/redistribute-unassigned-leads/index.ts` - Adicionar logica de lotes e progresso
2. `src/components/LeadDistributionList.tsx` - UI com barra de progresso
3. `src/hooks/useChatPresence.ts` - Remover beforeunload, adicionar visibilitychange
4. `src/pages/Pipeline.tsx` - Filtrar funis bloqueados para membros

---

## Ordem de Implementacao
1. Corrigir refresh ao trocar aba (maior impacto na UX)
2. Tornar funis bloqueados invisiveis (seguranca)
3. Adicionar barra de progresso (feature)
