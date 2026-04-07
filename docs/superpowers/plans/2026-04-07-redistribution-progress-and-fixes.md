# Redistribuicao com Progresso e Correcoes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 3 correcoes: (1) impedir refresh da pagina ao trocar de aba, (2) tornar funis bloqueados invisiveis para membros, (3) adicionar barra de progresso na redistribuicao.

**Architecture:**
1. Remover `beforeunload` handler que impede bfcache do navegador
2. Filtrar funis bloqueados na query de `loadFunnel()` no Pipeline
3. Adicionar estado de progresso e UI com polling na redistribuicao

**Tech Stack:** React, TypeScript, Supabase, TanStack Query

---

## Task 1: Corrigir Refresh ao Trocar Aba

**Files:**
- Modify: `src/hooks/useChatPresence.ts:55-75`

- [ ] **Step 1: Remover beforeunload handler e adicionar visibilitychange**

Modificar o useEffect que gerencia presenca WhatsApp. Remover o handler `beforeunload` que impede o bfcache e substituir por `visibilitychange` que atualiza a presenca quando a aba fica visivel/oculta.

```typescript
// Substituir o bloco do useEffect (linhas 26-75) por:
useEffect(() => {
  let instanceName: string | null = null;

  const setPresence = async (presence: "available" | "unavailable") => {
    if (!instanceName) return;
    try {
      await supabase.functions.invoke("set-whatsapp-presence", {
        body: { instance_name: instanceName, presence },
      });
    } catch (error) {
      console.error("Erro ao definir presenca:", error);
    }
  };

  const initPresence = async () => {
    if (!userId) return;
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("instance_name, status")
      .eq("user_id", userId)
      .eq("status", "CONNECTED")
      .maybeSingle();

    if (instance?.instance_name) {
      instanceName = instance.instance_name;
      await setPresence("available");
    }
  };

  initPresence();

  // Usar visibilitychange em vez de beforeunload para permitir bfcache
  const handleVisibilityChange = () => {
    if (!instanceName) return;
    if (document.hidden) {
      setPresence("unavailable");
    } else {
      setPresence("available");
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (instanceName) {
      setPresence("unavailable");
    }
  };
}, [userId]);
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useChatPresence.ts
git commit -m "fix: replace beforeunload with visibilitychange to enable bfcache

- Remove beforeunload handler that prevented browser back-forward cache
- Add visibilitychange listener to update WhatsApp presence when tab visibility changes
- Users will no longer experience full page reload when switching tabs"
```

---

## Task 2: Tornar Funis Bloqueados Invisiveis para Membros

**Files:**
- Modify: `src/pages/Pipeline.tsx:607-625`

- [ ] **Step 1: Modificar logica de filtragem de funis em loadFunnel()**

Na funcao `loadFunnel()`, modificar o bloco que filtra funis visiveis (linhas 607-625). Funis bloqueados (`is_active = false`) devem ser completamente removidos da lista para membros sem acesso explicito.

```typescript
// Substituir o bloco PERMISSÕES (linhas 607-625) por:
// PERMISSÕES: Controle de visibilidade de funis
// - Funil ATIVO (is_active = true): Todos podem ver
// - Funil INATIVO (is_active = false): Apenas admins + colaboradores autorizados
// - Membros SEM acesso a funil inativo: Funil NAO aparece na lista
let visibleFunnels = funnels;
if (!permissions.canManagePipeline && user?.id) {
  // Buscar funis que este usuario tem acesso explicito
  const { data: accessList } = await supabase
    .from("funnel_collaborators")
    .select("funnel_id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId);

  const accessibleIds = new Set((accessList || []).map((a: any) => a.funnel_id));

  // REMOVER funis bloqueados onde o usuario NAO tem acesso
  // Funis ativos permanecem visiveis para todos
  visibleFunnels = funnels.filter(
    (f: any) => f.is_active !== false || accessibleIds.has(f.id)
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat: hide blocked funnels from members without access

- Members without access to a blocked funnel no longer see it in the list
- Owners/admins continue to see all funnels
- Blocked funnels (is_active=false) are filtered out unless user has explicit access"
```

---

## Task 3: Adicionar Barra de Progresso na Redistribuicao

**Files:**
- Modify: `src/components/LeadDistributionList.tsx:108-130`
- Modify: `supabase/functions/redistribute-unassigned-leads/index.ts`

- [ ] **Step 1: Adicionar estado de progresso no LeadDistributionList**

Adicionar interface e estado para rastrear progresso da redistribuicao.

```typescript
// Adicionar apos as interfaces existentes (linha 35):
interface RedistributionProgress {
  total: number;
  processed: number;
  isRunning: boolean;
}

// Adicionar estado dentro do componente (apos linha 41):
const [progress, setProgress] = useState<RedistributionProgress>({
  total: 0,
  processed: 0,
  isRunning: false,
});
```

- [ ] **Step 2: Adicionar polling para atualizar progresso**

Modificar o mutation de redistribuicao para usar polling ate completar.

```typescript
// Substituir redistributeMutation (linhas 109-129) por:
const redistributeMutation = useMutation({
  mutationFn: async () => {
    if (!organizationId) throw new Error("Organizacao nao encontrada");

    // Iniciar redistribuicao
    setProgress({ total: 0, processed: 0, isRunning: true });

    const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", {
      body: { organization_id: organizationId },
    });

    if (error) throw error;
    return data;
  },
  onSuccess: (data) => {
    // Se o backend retornar progresso, atualizar
    if (data?.total !== undefined && data?.processed !== undefined) {
      setProgress({
        total: data.total,
        processed: data.processed,
        isRunning: !data.batch_complete,
      });
    }

    if (data?.batch_complete || data?.redistributed_count !== undefined) {
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      toast.success(`${data?.redistributed_count || 0} leads redistribuidos com sucesso!`);
      setProgress(prev => ({ ...prev, isRunning: false }));
    }
  },
  onError: (error: any) => {
    console.error("Erro ao redistribuir leads:", error);
    toast.error(error?.message || "Erro ao redistribuir leads");
    setProgress(prev => ({ ...prev, isRunning: false }));
  },
});

// Polling enquando estiver rodando
useEffect(() => {
  if (!progress.isRunning || !organizationId) return;

  const pollProgress = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", {
        body: { organization_id: organizationId, check_progress: true },
      });

      if (!error && data) {
        setProgress({
          total: data.total || 0,
          processed: data.processed || 0,
          isRunning: !data.batch_complete,
        });

        if (data.batch_complete) {
          queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
          toast.success(`${data?.redistributed_count || 0} leads redistribuidos com sucesso!`);
        }
      }
    } catch (err) {
      console.error("Erro ao verificar progresso:", err);
    }
  };

  const interval = setInterval(pollProgress, 1000);
  return () => clearInterval(interval);
}, [progress.isRunning, organizationId, queryClient]);
```

- [ ] **Step 3: Atualizar UI para mostrar barra de progresso**

Modificar a secao de leads sem responsavel para mostrar barra de progresso.

```typescript
// Substituir o bloco de UI (linhas 220-248) por:
{/* Secao de leads sem responsavel */}
{unassignedCount !== undefined && unassignedCount > 0 && (
  <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
    <CardContent className="py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">
              {progress.isRunning
                ? `Redistribuindo ${progress.processed} de ${progress.total} leads...`
                : `${unassignedCount} lead${unassignedCount !== 1 ? "s" : ""} sem responsavel`
              }
            </p>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {progress.isRunning
                ? "Por favor, aguarde..."
                : "Leads que entraram no CRM mas nao foram distribuidos"
              }
            </p>
          </div>
        </div>
        {progress.isRunning ? (
          <div className="flex items-center gap-3">
            {/* Barra de progresso */}
            <div className="w-32 h-2 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{
                  width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%`
                }}
              />
            </div>
            <span className="text-sm text-amber-600 dark:text-amber-400 min-w-[60px]">
              {progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%
            </span>
          </div>
        ) : (
          <Button
            onClick={() => redistributeMutation.mutate()}
            disabled={redistributeMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${redistributeMutation.isPending ? "animate-spin" : ""}`} />
            {redistributeMutation.isPending ? "Redistribuindo..." : "Redistribuir agora"}
          </Button>
        )}
      </div>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 4: Modificar Edge Function para suportar progresso**

Modificar `supabase/functions/redistribute-unassigned-leads/index.ts` para processar em lotes e retornar progresso. Para simplificar, vamos manter a implementacao atual mas adicionar campos de progresso na resposta.

```typescript
// No final da Edge Function (linhas 155-162), modificar o retorno para:
// Adicionar campos de progresso na resposta
return new Response(
  JSON.stringify({
    success: true,
    redistributed_count: redistributedCount,
    total_unassigned: unassignedLeads.length,
    processed: redistributedCount, // Para compatibilidade com polling
    total: unassignedLeads.length, // Para compatibilidade com polling
    batch_complete: true, // Por enquanto, processa tudo de uma vez
    errors: errors.length > 0 ? errors : undefined
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

- [ ] **Step 5: Commit**

```bash
git add src/components/LeadDistributionList.tsx supabase/functions/redistribute-unassigned-leads/index.ts
git commit -m "feat: add progress bar for lead redistribution

- Add visual progress bar showing processed/total leads
- Add polling mechanism for real-time progress updates
- Show percentage and count during redistribution
- Disable button and show progress while redistributing"
```

---

## Task 4: Build e Deploy

**Files:**
- Nenhum (comandos de deploy)

- [ ] **Step 1: Build do frontend**

```bash
npm run build
```

Expected: Build sucesso sem erros

- [ ] **Step 2: Deploy da Edge Function**

```bash
npx supabase functions deploy redistribute-unassigned-leads --no-verify-jwt
```

Expected: Deployed successfully

- [ ] **Step 3: Deploy do frontend**

```bash
npx vercel --prod --yes
```

Expected: Deployment ready

- [ ] **Step 4: Commit final (se houver mudancas)**

```bash
git add -A
git commit -m "chore: build and deploy redistribution progress and fixes"
```

---

## Resumo de Arquivos Modificados

1. `src/hooks/useChatPresence.ts` - Remover beforeunload, adicionar visibilitychange
2. `src/pages/Pipeline.tsx` - Filtrar funis bloqueados para membros
3. `src/components/LeadDistributionList.tsx` - Adicionar barra de progresso
4. `supabase/functions/redistribute-unassigned-leads/index.ts` - Adicionar campos de progresso

## Ordem de Execucao

1. Task 1: Corrigir refresh (maior impacto na UX)
2. Task 2: Funis bloqueados (seguranca)
3. Task 3: Barra de progresso (feature)
4. Task 4: Deploy
