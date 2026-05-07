# Spec — Redistribuir leads por colaborador + bug fix da redistribuição de Perdidos

**Data:** 2026-05-07
**Stakeholder:** Hurtz (owner)
**Tipo:** Substituição de UI + nova edge function + bug fix

## Contexto

Na página **Roleta** existe hoje:
- Um botão **"Simular"** com painel colapsável (`RouletteSimulator.tsx`) que faz uma simulação what-if puramente diagnóstica — escolhe `source + funnel` e mostra qual agente seria escolhido, sem escrever nada no banco.
- Um botão **"Redistribuir Perdidos"** que chama `redistribute-lost-leads` em loop até esgotar (em teoria).

Dois problemas:

1. **O Simulador é uma feature pouco usada.** O owner pediu para substituí-lo por uma ação útil: **"Redistribuir leads de um colaborador"** — pegar todos os leads ativos de um colaborador específico e redistribuí-los pelas roletas configuradas, sem remover o colaborador da org (caso de uso: férias, sobrecarga, mudança de função).

2. **A redistribuição de Perdidos para na 19ª lead.** Bug: a query em [redistribute-lost-leads/index.ts:33-56](../../../supabase/functions/redistribute-lost-leads/index.ts#L33-L56) busca 200 leads quaisquer com `funnel_stage_id` não-nulo e **filtra perdidos em JS depois**. Se a org tem muitos leads em outros estágios, o batch cai com poucos perdidos. O `has_more` é então calculado como `filteredLeads.length >= BATCH_SIZE` — falso quando filtramos para 19, e o cliente para. Sobram dezenas/centenas de perdidos não tocados.

## Resultado esperado

- Botão "Simular" e componente `RouletteSimulator` removidos.
- Novo botão "Redistribuir colaborador" no header da página Roleta, que abre painel colapsável com dropdown de colaboradores ativos da org.
- Owner escolhe colaborador → modal de confirmação mostra count exato de leads ativos a serem redistribuídos → confirma → barra de progresso → toast final com summary.
- Roteamento por lead segue a mesma hierarquia já usada em `redistribute-unassigned-leads` (`source + funnel > source > all + funnel > all`).
- Redistribuição de Perdidos: filtra `stage_type='lost'` no banco. `has_more` baseado em count real do que sobrou. **Garantia de redistribuir TODOS os leads perdidos**, independente do volume (até 50.000 por execução, com cap protetor anti-loop-infinito).
- Mesmas garantias para a redistribuição de não-atribuídos e a nova de colaborador.

## Decisões tomadas no brainstorming

| Decisão | Escolha |
|---|---|
| Roteamento da redistribuição de colaborador | **Auto por lead** — desatribui tudo, deixa o pipeline existente de não-atribuídos roteie via `findBestConfig` |
| Estratégia de "delay para não travar" | **Cliente-side** — 800ms de delay entre iterações do `while(hasMore)`, sem reescrever arquitetura |
| Garantia de redistribuir TODOS | **Sim** — cap de 500 iterações × 100 batch = 50.000 leads, com guarda anti-loop-vazio |
| Reaproveitar `redistribute-collaborator-leads` existente | **Não** — função existente força um `config_id` único; não respeita auto-roteamento. Cria nova função e mantém a antiga (pode ser removida no futuro se ninguém usar). |

## Componentes

### 1. Frontend — substituição da UI do Simulador

**Arquivo:** `src/pages/LeadDistribution.tsx`

- **Remover** botão "Simular" (linhas 264-271) e `<RouletteSimulator open={...} onToggle={...} />` (linha 285).
- **Remover** state `simulatorOpen` (linha 40).
- **Adicionar** botão "Redistribuir colaborador" no mesmo lugar do header (ícone `Shuffle` ou `Users`).
- **Adicionar** state `collabRedistOpen` (boolean) controlando painel novo.
- **Adicionar** componente `<RedistributeFromCollaboratorPanel />` no mesmo lugar do antigo Simulador.
- **Adicionar** mutation `redistributeFromCollaboratorMutation` seguindo mesmo padrão (loop + delay + guarda).

**Arquivo:** `src/components/roulette/RouletteSimulator.tsx` — **DELETADO**.

**Arquivo:** `src/components/roulette/RedistributeFromCollaboratorPanel.tsx` — **NOVO**.

Conteúdo do novo painel:
- Header colapsável com ícone + título "Redistribuir leads de um colaborador"
- Subtítulo explicando o que faz (1-2 linhas)
- Dropdown com colaboradores ativos da org (`organization_members` com `is_active=true`, ordenados por nome)
- Texto contador: "Este colaborador tem **N** leads ativos." Atualizado quando seleção muda — busca count via supabase.
- Botão `Redistribuir todos os leads` (destructive variant) — desabilitado se N=0 ou nenhum colaborador selecionado
- Modal de confirmação ao clicar: "Você está prestes a desatribuir N leads de [Nome] e redistribuí-los automaticamente. Esta ação não pode ser desfeita. Continuar?"
- Após confirmação: invoca `redistributeFromCollaboratorMutation`

### 2. Backend — nova edge function `redistribute-from-collaborator`

**Arquivo:** `supabase/functions/redistribute-from-collaborator/index.ts` — **NOVO**.

**Auth:** JWT do owner ou admin.

**Input:** `{ organization_id, collaborator_user_id }`

**Pré-condições:**
1. JWT válido → caller_id
2. Caller é `owner` OU `admin` da `organization_id`
3. `collaborator_user_id` existe em `organization_members` da mesma org

**Fluxo:**

| Passo | Ação |
|---|---|
| 1 | Identificar IDs de stages `won`/`lost` desta org (JOIN em `sales_funnels`, padrão da feature anterior) |
| 2 | Contar leads ativos do colaborador: `WHERE responsavel_user_id = X AND organization_id = Y AND (funnel_stage_id IS NULL OR NOT IN (closed))`. Esse é o `total_intended`. Se 0, retorna early. |
| 3 | Desatribuir: `UPDATE leads SET responsavel_user_id = NULL WHERE responsavel_user_id = X AND ...mesmos filtros...`. Operação única, sem batching aqui (UPDATE escala bem). |
| 4 | Loop interno (até 500 iterações) chamando o mesmo pipeline do `redistribute-unassigned-leads` (extrair função compartilhada ou simplesmente fazer fetch + distribuir lá dentro). |
| 5 | Retornar `{ success: true, redistributed_count, total_intended, skipped, duration_ms }` |

**Trade-off de extrair função compartilhada vs duplicar lógica:** o ideal seria extrair `redistributeBatch(supabase, orgId, batchSize)` para um arquivo compartilhado consumido por `redistribute-unassigned-leads` e o novo. Mas Edge Functions são bundles isolados; compartilhar código entre funções exige um diretório `_shared/`. Vamos extrair — é o padrão Deno/Supabase recomendado e prepara terreno para futuras consolidações.

**Arquivo `supabase/functions/_shared/redistribute-batch.ts` — NOVO** — função `redistributeBatch(supabase, orgId, options)` retornando `{ redistributed, skipped, hasMore, totalRemaining }`. Consumida pelas duas funções.

### 3. Backend — bug fix em `redistribute-lost-leads`

**Arquivo:** `supabase/functions/redistribute-lost-leads/index.ts`

**Patch 1 — query no banco:**

Substituir o bloco que busca leads + filtra em JS por:

```ts
// Pré-buscar IDs de stages 'lost' desta org
const { data: lostStages } = await supabase
  .from('funnel_stages')
  .select('id, sales_funnels!inner(organization_id)')
  .eq('sales_funnels.organization_id', organization_id)
  .eq('stage_type', 'lost');
const lostStageIds = (lostStages || []).map((s: { id: string }) => s.id);

if (lostStageIds.length === 0) {
  return new Response(JSON.stringify({
    success: true, redistributed_count: 0, total: 0, has_more: false,
    message: 'Nenhuma etapa Perdido configurada'
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Buscar leads diretamente do banco (já filtrados)
const { data: lostLeads, error: leadsError } = await supabase
  .from('leads')
  .select('id, source, funnel_id, funnel_stage_id')
  .eq('organization_id', organization_id)
  .in('funnel_stage_id', lostStageIds)
  .limit(BATCH_SIZE);
if (leadsError) throw leadsError;
```

**Patch 2 — `has_more` correto baseado no que sobrou:**

Substituir `const hasMore = filteredLeads.length >= BATCH_SIZE;` por count real:

```ts
const { count: remainingCount } = await supabase
  .from('leads')
  .select('id', { count: 'exact', head: true })
  .eq('organization_id', organization_id)
  .in('funnel_stage_id', lostStageIds);
const hasMore = (remainingCount || 0) > 0;
```

**Patch 3 — `BATCH_SIZE`** reduzido de 200 → 100. Mais folga para timeouts.

### 4. Frontend — robustez nas 3 mutations

**Arquivo:** `src/pages/LeadDistribution.tsx`

Mudanças aplicadas a `redistributeMutation` (não-atribuídos), `redistributeLostMutation` (perdidos) e à nova `redistributeFromCollaboratorMutation`:

1. **Cap de iterações: 50 → 500** (em batches de 100, cobre 50.000 leads).
2. **Guarda anti-loop-vazio:** se `count === 0 && hasMore`, sai do loop e reporta `skipped`.
3. **Delay de 800ms** entre iterações (`await new Promise(r => setTimeout(r, 800))`), depois de atualizar o progresso.
4. **Toast final** com mensagem completa: "X redistribuídos. Y aguardando configuração de roleta/agente." (se skipped > 0).

## Casos de borda

| Caso | Comportamento |
|---|---|
| Colaborador não tem leads ativos | Modal mostra "0 leads", botão desabilitado. Função não é chamada. |
| Colaborador tem só leads em won/lost | Igual ao item anterior (filtro exclui won/lost). |
| Falta de roleta para um source específico (ex.: Facebook) | Lead fica `responsavel_user_id IS NULL`. Reporta `skipped`. Cron de auto-redistribute retomará quando houver config. |
| Servidor cai a meio do loop | Cliente para no erro. Próxima invocação continua de onde parou — todos os passos são WHERE/UPDATE em estado atual (idempotente). |
| Org com 50k leads perdidos | 500 × 100 = 50k. Cobertura. Acima disso, cap protege. Owner pode rodar de novo. |
| Caller é admin (não owner) | Permitido para o redistribute-from-collaborator (admin já gerencia colaboradores em outras telas). |
| Owner clica 2× rapidamente | `mutation.isPending` desabilita o botão (padrão React Query). |

## Arquivos afetados

- **Editado:** `src/pages/LeadDistribution.tsx` (substituir simulador, nova mutation, cap+delay+guarda nas 3 mutations)
- **Deletado:** `src/components/roulette/RouletteSimulator.tsx`
- **Novo:** `src/components/roulette/RedistributeFromCollaboratorPanel.tsx`
- **Novo:** `supabase/functions/redistribute-from-collaborator/index.ts`
- **Novo:** `supabase/functions/_shared/redistribute-batch.ts`
- **Editado:** `supabase/functions/redistribute-lost-leads/index.ts` (3 patches)
- **Editado:** `supabase/functions/redistribute-unassigned-leads/index.ts` (refatorar para usar `_shared/redistribute-batch.ts`)

## Testes manuais (golden path)

1. **Setup:** Owner cria colaborador "Teste Carlos". Atribui 30 leads a ele em estágios variados (10 ativos, 5 won, 5 lost, 10 ativos em outro funil). Configura 2 roletas (uma por funil).

2. **Caso 1 — Redistribuir colaborador:**
   - Página Roleta → botão "Redistribuir colaborador" → painel abre
   - Dropdown: seleciona Carlos → texto mostra "20 leads ativos"
   - Clica "Redistribuir todos os leads" → modal confirma 20 leads
   - Confirma → barra de progresso enche → toast "20 leads redistribuídos"
   - SQL: leads ativos do Carlos agora têm `responsavel_user_id` apontando para outros agentes; leads won/lost intactos.
   - Carlos continua na org, na roleta, podendo logar.

3. **Caso 2 — Redistribuir Perdidos com volume alto:**
   - Setup: 500 leads na org, 250 em estágio Perdido (espalhados entre funis)
   - Clica "Redistribuir Perdidos" → barra avança em incrementos visíveis (100, 200, 250)
   - Após ~3 iterações × 800ms = ~3-5s, toast "250 leads perdidos redistribuídos"
   - SQL: nenhum lead em estágio lost com responsável original; todos foram movidos para o primeiro estágio de algum funil.

4. **Caso 3 — Caso degenerado (sem agentes para um source):**
   - Setup: 30 leads, 10 com `source='facebook'`, mas nenhuma roleta tem `source_type='facebook'` ou `'all'`
   - Redistribuir → barra avança → toast "20 redistribuídos. 10 aguardando configuração de roleta/agente."

## Fora de escopo

- Realtime UI updates do progresso via Supabase Realtime — atual polling visual via barra de progresso é suficiente.
- Background job via pg_cron — overkill para o volume atual.
- Remover a função `redistribute-collaborator-leads` antiga (que recebe `config_id` único) — fica como dead code reusável; remoção pode ser feita em follow-up.
- UI de filtros adicionais no painel de redistribuir colaborador (ex.: filtrar por funnel antes de redistribuir) — YAGNI.
