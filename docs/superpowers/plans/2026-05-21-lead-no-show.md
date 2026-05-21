# Lead No-Show — Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa-a-tarefa. Os passos usam checkbox (`- [ ]`) para tracking.

**Goal:** Permitir marcar um lead como `no_show` via clique direito no card (desktop) ou item no menu mobile, com ícone do calendário laranja e métricas no Dashboard.

**Architecture:** UI no `LeadCard` (desktop) usando `ContextMenu` do shadcn já presente; `MobileLeadCard` ganha item no `DropdownMenu` existente. Hook React Query `useToggleNoShow` faz UPDATE direto na tabela `leads` (RLS existente cobre permissão) e invalida o cache `['pipeline-leads']`. Dashboard ganha duas queries análogas às de `'realizada'`.

**Tech Stack:** React 18, TypeScript, Tailwind, shadcn/ui, @tanstack/react-query v5, @supabase/supabase-js, lucide-react. Sem framework de testes — verificação via `npm run build`, `npm run lint` e smoke manual.

**Spec:** [2026-05-21-lead-no-show-design.md](../specs/2026-05-21-lead-no-show-design.md)

---

## Estrutura de Arquivos

**Criar:**
- `src/hooks/useToggleNoShow.ts` — mutação React Query

**Modificar:**
- `src/types/chat.ts` — adicionar `status_reuniao` em `Lead`
- `src/pages/Pipeline.tsx` — adicionar `status_reuniao` em dois `select()` e propagar no `PipelineColumn` + `DragOverlay`
- `src/components/PipelineColumn.tsx` — passar `statusReuniao` e `onToggleNoShow` ao `SortableLeadCard`
- `src/components/LeadCard.tsx` — novas props, envolver com `ContextMenu`, cor laranja no ícone, atualizar memo comparator
- `src/components/MobileLeadCard.tsx` — nova prop, item no `DropdownMenu`, cor laranja no badge de agendamento
- `src/components/MobilePipelineView.tsx` — passar `statusReuniao` e handler
- `src/pages/Dashboard.tsx` — duas queries de no-show + cards exibindo métrica

**Sincronizar (sem código):**
- `Projetos/Kairoz CRM/Changelog.md` (vault)
- `Projetos/Kairoz CRM/Home.md` (vault — contagens)

---

### Task 1: Tipo `Lead` ganha `status_reuniao`

**Files:**
- Modify: `src/types/chat.ts`

- [ ] **Step 1: Editar interface `Lead`**

Adicionar o campo após `whatsapp_instance_id?` (linha 28 — antes do `}` da interface):

```ts
  whatsapp_instance_id?: string | null;
  status_reuniao?: 'realizada' | 'no_show' | null;
}
```

- [ ] **Step 2: Verificar build**

Comando:

```
npm run build
```

Esperado: build conclui sem erros. Se houver erro de TS em arquivos que constroem `Lead`, deixar como está — o campo é opcional e não quebra construções existentes.

- [ ] **Step 3: Commit**

```
git add src/types/chat.ts
git commit -m "feat(leads): add status_reuniao field to Lead type"
```

---

### Task 2: Adicionar `status_reuniao` nas queries do Pipeline

**Files:**
- Modify: `src/pages/Pipeline.tsx:744` (query por etapa) e `:844` (query de fallback)

- [ ] **Step 1: Atualizar select da query por etapa (linha 744)**

Substituir:

```ts
let dataQ = supabase.from('leads').select('id,nome_lead,telefone_lead,email,stage,funnel_stage_id,funnel_id,position,avatar_url,responsavel,responsavel_user_id,valor,updated_at,created_at,source,descricao_negocio,duplicate_attempts_count,additional_data').eq('organization_id', organizationId);
```

Por:

```ts
let dataQ = supabase.from('leads').select('id,nome_lead,telefone_lead,email,stage,funnel_stage_id,funnel_id,position,avatar_url,responsavel,responsavel_user_id,valor,updated_at,created_at,source,descricao_negocio,duplicate_attempts_count,additional_data,status_reuniao').eq('organization_id', organizationId);
```

- [ ] **Step 2: Atualizar select da query de fallback (linha 844)**

Substituir:

```ts
.select('id, nome_lead, telefone_lead, email, stage, funnel_stage_id, funnel_id, position, avatar_url, responsavel, responsavel_user_id, valor, updated_at, created_at, source, descricao_negocio, duplicate_attempts_count, additional_data')
```

Por:

```ts
.select('id, nome_lead, telefone_lead, email, stage, funnel_stage_id, funnel_id, position, avatar_url, responsavel, responsavel_user_id, valor, updated_at, created_at, source, descricao_negocio, duplicate_attempts_count, additional_data, status_reuniao')
```

- [ ] **Step 3: Verificar build**

Comando:

```
npm run build
```

Esperado: build OK. Lint não deve reclamar.

- [ ] **Step 4: Smoke manual**

Abrir DevTools → Network → recarregar Pipeline → conferir que a resposta dos endpoints `leads?...select=...` agora inclui `status_reuniao` para cada lead.

- [ ] **Step 5: Commit**

```
git add src/pages/Pipeline.tsx
git commit -m "feat(pipeline): select status_reuniao on lead queries"
```

---

### Task 3: Hook `useToggleNoShow`

**Files:**
- Create: `src/hooks/useToggleNoShow.ts`

- [ ] **Step 1: Criar o arquivo do hook**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type StatusReuniao = 'realizada' | 'no_show' | null;

interface ToggleNoShowInput {
  leadId: string;
  currentStatus: StatusReuniao;
}

export function useToggleNoShow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leadId, currentStatus }: ToggleNoShowInput) => {
      const nextStatus: StatusReuniao =
        currentStatus === 'no_show' ? null : 'no_show';

      const { error } = await supabase
        .from('leads')
        .update({ status_reuniao: nextStatus })
        .eq('id', leadId);

      if (error) throw error;
      return { leadId, nextStatus };
    },
    onSuccess: ({ nextStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-realized'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-no-show'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-today-realized'] });
      toast({
        title: nextStatus === 'no_show' ? 'Lead marcado como no-show' : 'No-show desfeito',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Erro ao atualizar status',
        description: err?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });
}
```

- [ ] **Step 2: Confirmar caminho de import do `supabase` e do `useToast`**

Comando:

```
npm run build
```

Esperado: build OK. Se algum import falhar, abrir um arquivo existente (ex: `src/pages/Dashboard.tsx`) e copiar a importação real de `supabase` e de `useToast`.

- [ ] **Step 3: Commit**

```
git add src/hooks/useToggleNoShow.ts
git commit -m "feat(leads): add useToggleNoShow mutation hook"
```

---

### Task 4: LeadCard desktop — props, ContextMenu, ícone laranja

**Files:**
- Modify: `src/components/LeadCard.tsx`

- [ ] **Step 1: Adicionar import do ContextMenu**

No topo do arquivo, junto aos outros imports de UI (depois do bloco de `dropdown-menu`, ~linha 13):

```tsx
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
```

- [ ] **Step 2: Adicionar campos em `BaseLeadCardProps` (~linha 131)**

Depois de `dataAgendamentoVenda?: string | null;`:

```tsx
  dataAgendamentoVenda?: string | null;
  statusReuniao?: 'realizada' | 'no_show' | null;
  onToggleNoShow?: () => void;
  isRedistributed?: boolean;
```

- [ ] **Step 3: Adicionar mesmos campos em `LeadCardViewProps` (~linha 153)**

```tsx
  dataAgendamentoVenda?: string | null;
  statusReuniao?: 'realizada' | 'no_show' | null;
  onToggleNoShow?: () => void;
  isRedistributed?: boolean;
```

- [ ] **Step 4: Desestruturar as novas props no componente `LeadCardView` (~linha 193)**

Adicionar logo após `dataAgendamentoVenda`:

```tsx
  dataAgendamentoReuniao,
  dataAgendamentoVenda,
  statusReuniao,
  onToggleNoShow,
  isRedistributed = false,
```

- [ ] **Step 5: Envolver o JSX retornado com `ContextMenu`**

Localizar o `return (<Card ...>`. Substituir:

```tsx
  return (
    <Card
      ref={setNodeRef}
      ...
```

Por:

```tsx
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          ref={setNodeRef}
          ...
```

E o fechamento `</Card>` (linha ~609) por:

```tsx
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-background z-50">
        <ContextMenuItem
          disabled={!dataAgendamentoReuniao}
          onSelect={(e) => {
            e.preventDefault();
            onToggleNoShow?.();
          }}
        >
          {statusReuniao === 'no_show' ? 'Desfazer no-show' : 'Marcar como no-show'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
```

- [ ] **Step 6: Atualizar cor do ícone do calendário (linha ~398)**

Localizar o `<button>` interno ao bloco `{dataAgendamentoReuniao && !dragging && (` (~linha 391-401). Substituir:

```tsx
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); if (onEdit) onEdit(); }}
                  title={`Reunião: ${new Date(dataAgendamentoReuniao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                  className="h-4 w-4 flex items-center justify-center text-blue-500 hover:text-blue-400 transition-colors"
                >
                  <CalendarDays className="h-3 w-3" />
                </button>
```

Por:

```tsx
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); if (onEdit) onEdit(); }}
                  title={
                    statusReuniao === 'no_show'
                      ? `Reunião (No-show): ${new Date(dataAgendamentoReuniao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                      : `Reunião: ${new Date(dataAgendamentoReuniao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                  }
                  className={cn(
                    "h-4 w-4 flex items-center justify-center transition-colors",
                    statusReuniao === 'no_show'
                      ? "text-orange-500 hover:text-orange-400"
                      : "text-blue-500 hover:text-blue-400"
                  )}
                >
                  <CalendarDays className="h-3 w-3" />
                </button>
```

- [ ] **Step 7: Atualizar memo comparator (~linha 665)**

Adicionar comparação de `statusReuniao` antes de `dataAgendamentoVenda`:

```tsx
    prevProps.dataAgendamentoReuniao === nextProps.dataAgendamentoReuniao &&
    prevProps.statusReuniao === nextProps.statusReuniao &&
    prevProps.dataAgendamentoVenda === nextProps.dataAgendamentoVenda &&
```

- [ ] **Step 8: Verificar build e tipos**

Comando:

```
npm run build
```

Esperado: build OK.

- [ ] **Step 9: Smoke manual (sem o wiring ainda — visual estática)**

Não é possível testar o menu sem o wiring do PipelineColumn — pular o smoke até a Task 5. O build deve estar verde.

- [ ] **Step 10: Commit**

```
git add src/components/LeadCard.tsx
git commit -m "feat(LeadCard): add no-show context menu and orange calendar icon"
```

---

### Task 5: Wire LeadCard no PipelineColumn e DragOverlay

**Files:**
- Modify: `src/components/PipelineColumn.tsx:109-137`
- Modify: `src/pages/Pipeline.tsx` — bloco `<DragOverlay>` (~linha 2584) e local de instanciação do `<PipelineColumn>` (procurar por `<PipelineColumn` no arquivo)

- [ ] **Step 1: Importar hook no Pipeline.tsx**

No topo de `src/pages/Pipeline.tsx`, junto aos outros imports de hooks:

```ts
import { useToggleNoShow } from '@/hooks/useToggleNoShow';
```

- [ ] **Step 2: Instanciar o hook dentro do componente `Pipeline`**

Localizar onde os hooks são chamados (próximo de `useToast`, `useQueryClient` ou similar — buscar `useQueryClient()`). Adicionar:

```ts
const toggleNoShow = useToggleNoShow();
```

- [ ] **Step 3: Criar callback de toggle estável**

Adicionar logo abaixo, junto aos outros callbacks `useCallback`:

```ts
const handleToggleNoShow = useCallback((leadId: string, currentStatus: 'realizada' | 'no_show' | null | undefined) => {
  toggleNoShow.mutate({ leadId, currentStatus: currentStatus ?? null });
}, [toggleNoShow]);
```

(Se `useCallback` não estiver importado nesse arquivo, importar de `react`.)

- [ ] **Step 4: Passar callback ao `<PipelineColumn>` em todos os usos**

Buscar todas as ocorrências de `<PipelineColumn` no arquivo. Em cada uma, adicionar a prop:

```tsx
<PipelineColumn
  ...
  onToggleNoShow={handleToggleNoShow}
/>
```

- [ ] **Step 5: Passar `statusReuniao` e `onToggleNoShow` ao `<LeadCard>` no `DragOverlay` (~linha 2584)**

No bloco `<LeadCard ... />` dentro de `<DragOverlay>`, adicionar:

```tsx
<LeadCard
  ...
  dataAgendamentoReuniao={agendamentosMap[activeLead.id]?.reuniao}
  statusReuniao={activeLead.status_reuniao}
  onToggleNoShow={() => handleToggleNoShow(activeLead.id, activeLead.status_reuniao)}
  ...
/>
```

(Inserir após a prop `dataAgendamentoReuniao` existente.)

- [ ] **Step 6: Adicionar prop `onToggleNoShow` à interface do `PipelineColumn`**

Em `src/components/PipelineColumn.tsx`, localizar a interface de props (topo do arquivo). Adicionar:

```ts
  onToggleNoShow?: (leadId: string, currentStatus: 'realizada' | 'no_show' | null | undefined) => void;
```

Desestruturar `onToggleNoShow` nos parâmetros do componente.

- [ ] **Step 7: Passar `statusReuniao` e `onToggleNoShow` ao `<SortableLeadCard>`**

Em `src/components/PipelineColumn.tsx`, no JSX dentro do `leads.map` (~linha 108-137), adicionar duas novas props após `dataAgendamentoVenda`:

```tsx
                  dataAgendamentoReuniao={agendamentosMap[lead.id]?.reuniao}
                  dataAgendamentoVenda={agendamentosMap[lead.id]?.venda}
                  statusReuniao={lead.status_reuniao}
                  onToggleNoShow={() => onToggleNoShow?.(lead.id, lead.status_reuniao)}
                  isRedistributed={!!redistributedMap[lead.id]}
```

- [ ] **Step 8: Verificar build**

Comando:

```
npm run build
```

Esperado: build OK. Se TS reclamar sobre `lead.status_reuniao`, conferir que a Task 1 foi commitada.

- [ ] **Step 9: Smoke manual no navegador (Pipeline desktop)**

1. `npm run dev`, abrir Pipeline com um lead que tenha reunião agendada.
2. Botão direito no card → confirma que aparece "Marcar como no-show".
3. Clicar — toast aparece, ícone do calendário fica laranja, contador no Dashboard ainda não muda (Task 7 implementa).
4. Botão direito novamente → confirma que vira "Desfazer no-show".
5. Clicar — ícone volta a azul, toast confirma.
6. Em lead sem `dataAgendamentoReuniao` (sem ícone azul/laranja), abrir menu → item deve aparecer **disabled**.
7. Arrastar (drag-and-drop) um card — confirmar que o context menu não interfere; drag continua funcionando.

- [ ] **Step 10: Commit**

```
git add src/pages/Pipeline.tsx src/components/PipelineColumn.tsx
git commit -m "feat(pipeline): wire no-show toggle through column and drag overlay"
```

---

### Task 6: MobileLeadCard — suporte ao no-show

**Files:**
- Modify: `src/components/MobileLeadCard.tsx`
- Modify: `src/components/MobilePipelineView.tsx` (passar handler)

- [ ] **Step 1: Adicionar prop em `MobileLeadCardProps` (~linha 16-31)**

Após `agendamentos?:`:

```ts
  agendamentos?: { reuniao?: string | null; venda?: string | null };
  statusReuniao?: 'realizada' | 'no_show' | null;
  onToggleNoShow?: () => void;
  isRedistributed?: boolean;
```

- [ ] **Step 2: Desestruturar nas props do componente (~linha 33-37)**

```ts
export function MobileLeadCard({
  lead, stages, currentStageId, onEdit, onDelete, onMoveRequest,
  responsavelName, tags = [], isDuplicate, agendamentos,
  statusReuniao, onToggleNoShow,
  isRedistributed, redistributedFromName, redistributionReason = 'inactivity',
}: MobileLeadCardProps) {
```

- [ ] **Step 3: Sobrescrever cor do badge de agendamento quando no_show**

Localizar o bloco `{agendStatus && (...)` (~linha 172-180). Substituir:

```tsx
          {agendStatus && (
            <span className={cn(
              'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border',
              agendStatus.color === 'destructive' ? 'bg-red-50 text-red-700 border-red-200' :
              agendStatus.color === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-blue-50 text-blue-700 border-blue-200'
            )}>
              <Calendar className="h-2.5 w-2.5" />{agendStatus.label}
            </span>
          )}
```

Por:

```tsx
          {agendStatus && (
            <span className={cn(
              'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border',
              statusReuniao === 'no_show'
                ? 'bg-orange-50 text-orange-700 border-orange-200'
                : agendStatus.color === 'destructive' ? 'bg-red-50 text-red-700 border-red-200' :
                  agendStatus.color === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-blue-50 text-blue-700 border-blue-200'
            )}>
              <Calendar className="h-2.5 w-2.5" />
              {statusReuniao === 'no_show' ? `No-show · ${agendStatus.label}` : agendStatus.label}
            </span>
          )}
```

- [ ] **Step 4: Adicionar item de no-show no DropdownMenu (~linha 203-214)**

Substituir o bloco `<DropdownMenuContent ...>` por:

```tsx
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              Editar lead
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!agendamentos?.reuniao}
              onClick={(e) => { e.stopPropagation(); onToggleNoShow?.(); }}
            >
              {statusReuniao === 'no_show' ? 'Desfazer no-show' : 'Marcar como no-show'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Excluir lead
            </DropdownMenuItem>
          </DropdownMenuContent>
```

- [ ] **Step 5: Importar hook em `MobilePipelineView.tsx`**

Topo do arquivo:

```ts
import { useToggleNoShow } from '@/hooks/useToggleNoShow';
```

- [ ] **Step 6: Instanciar e criar callback**

Dentro do componente `MobilePipelineView`, próximo aos outros hooks:

```ts
const toggleNoShow = useToggleNoShow();
const handleToggleNoShow = useCallback(
  (leadId: string, currentStatus: 'realizada' | 'no_show' | null | undefined) =>
    toggleNoShow.mutate({ leadId, currentStatus: currentStatus ?? null }),
  [toggleNoShow]
);
```

(Importar `useCallback` de `react` se ainda não estiver.)

- [ ] **Step 7: Passar `statusReuniao` e `onToggleNoShow` ao `<MobileLeadCard>` (~linha 157-170)**

No `<MobileLeadCard ...>`, adicionar duas props após `agendamentos`:

```tsx
                  agendamentos={agendamentosMap[lead.id]}
                  statusReuniao={lead.status_reuniao}
                  onToggleNoShow={() => handleToggleNoShow(lead.id, lead.status_reuniao)}
```

- [ ] **Step 8: Verificar build**

Comando:

```
npm run build
```

Esperado: build OK.

- [ ] **Step 9: Smoke manual mobile**

1. DevTools → Toggle device toolbar (mobile viewport) → abrir Pipeline em modo mobile.
2. Tocar nos 3 pontinhos de um lead → confirmar que aparece "Marcar como no-show".
3. Tocar — toast aparece, badge "Hoje/Amanhã/Atrasado" vira "No-show · …" laranja.
4. Tocar novamente nos 3 pontinhos → confirma "Desfazer no-show".
5. Em lead sem agendamento, item aparece disabled.

- [ ] **Step 10: Commit**

```
git add src/components/MobileLeadCard.tsx src/components/MobilePipelineView.tsx
git commit -m "feat(mobile): add no-show toggle and orange badge on MobileLeadCard"
```

---

### Task 7: Dashboard — métrica de no-show

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Adicionar query de no-show (após query "Reuniões realizadas", linha 393-409)**

Inserir depois da query `realizedCount`:

```ts
  // 3b. Reuniões no-show
  const { data: noShowCount } = useQuery({
    queryKey: ['dashboard-no-show', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status_reuniao', 'no_show')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      return count || 0;
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });
```

- [ ] **Step 2: Derivar `noShowValue` e `noShowRate` próximo de `realizedValue` (~linha 753)**

Depois de `const realizedValue = realizedCount ?? 0;`:

```ts
  const realizedValue = realizedCount ?? 0;
  const noShowValue = noShowCount ?? 0;
  const totalMeetings = realizedValue + noShowValue;
  const noShowRate = totalMeetings > 0 ? Math.round((noShowValue / totalMeetings) * 100) : 0;
```

- [ ] **Step 3: Adicionar `<MetricCard>` de No-show ao BLOCO 1 (~linha 859-867)**

Localizar o último `<MetricCard>` do BLOCO 1 — `title="Ticket Médio"`. Logo após o `/>` desse card e antes de fechar a `</div>` do bloco, inserir:

```tsx
        <MetricCard
          title="No-show"
          value={noShowValue}
          variation={0}
          sparkline={[0, 0, 0, 0, 0, 0, noShowValue]}
          color="#f59e0b"
          subtitle={`${noShowRate}% das reuniões`}
        />
```

O quinto card vai naturalmente para a segunda linha em viewports `lg` (grade é `lg:grid-cols-4`). Aceitável visualmente; se preferir 5 colunas, trocar a classe da `<div>` (linha 833) para `lg:grid-cols-5` — opcional.

- [ ] **Step 4: Adicionar No-show ao `funilData` (linha 770-776)**

Substituir o array por:

```tsx
  const funilData = [
    { etapa: 'Leads captados', valor: totalLeadsValue, color: '#4a7cfb' },
    { etapa: 'Leads atendidos', valor: attendedLeadsValue, color: '#3ecf8e' },
    { etapa: 'Reuniões realizadas', valor: realizedValue, color: '#f5a623' },
    { etapa: 'No-show', valor: noShowValue, color: '#f59e0b' },
    { etapa: 'Propostas enviadas', valor: proposalsValue, color: '#a78bfa' },
    { etapa: 'Vendas fechadas', valor: soldValue, color: '#3ecf8e' }
  ];
```

- [ ] **Step 5: Verificar build**

Comando:

```
npm run build
```

Esperado: build OK.

- [ ] **Step 6: Smoke manual no Dashboard**

1. Marcar pelo menos um lead como no-show no Pipeline.
2. Abrir Dashboard → confirma que o card "No-show" mostra o contador correto e a taxa correspondente.
3. Trocar o filtro de período (Hoje / Mês / Trimestre / Ano) → contador atualiza coerentemente.
4. Conferir o gráfico de funil — etapa "No-show" deve aparecer com o valor coerente.
5. Desfazer o no-show → contador zera no próximo refresh.

- [ ] **Step 7: Commit**

```
git add src/pages/Dashboard.tsx
git commit -m "feat(dashboard): add no-show count and rate metrics"
```

---

### Task 8: Verificação final (lint + build + smoke completo)

- [ ] **Step 1: Lint**

```
npm run lint
```

Esperado: zero erros. Warnings preexistentes podem ficar; novos warnings introduzidos pela feature devem ser corrigidos.

- [ ] **Step 2: Build de produção**

```
npm run build
```

Esperado: build conclui com sucesso, sem `error TS...`.

- [ ] **Step 3: Smoke end-to-end**

Roteiro completo:

1. Pipeline desktop: botão direito num lead **com** reunião → marca no-show → ícone laranja → desfaz → ícone azul.
2. Pipeline desktop: botão direito num lead **sem** reunião → item disabled.
3. Pipeline desktop: drag-and-drop continua funcionando depois de abrir/fechar o context menu.
4. Mobile: 3 pontinhos → marca no-show → badge laranja → desfaz.
5. Mobile: lead sem agendamento → item disabled.
6. Dashboard: card "No-show" reflete contagem; taxa coerente; filtros de período atualizam.
7. Notificações toast aparecem em sucesso e em erro (forçar erro: cortar internet e tentar marcar — toast de erro aparece).

- [ ] **Step 4: Commit final (se houve ajustes de lint)**

```
git add -A
git commit -m "chore: lint fixes after no-show implementation"
```

(Pular se não houve alterações.)

---

### Task 9: Sincronizar Obsidian Vault

**Files:**
- Modify: `c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/02 - Plans/2026-05-21-lead-no-show.md` (criar — espelho deste plano)
- Modify: `c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/Changelog.md` (entrada `[Plan]` e `[Feature]` em 2026-05-21)
- Modify: `c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/Home.md` (contagem Plans 25→26, adicionar link)

- [ ] **Step 1: Copiar plano para o vault**

Criar `02 - Plans/2026-05-21-lead-no-show.md` no vault com o mesmo conteúdo deste arquivo.

- [ ] **Step 2: Atualizar Changelog**

Adicionar abaixo da entrada de Spec de 2026-05-21:

```markdown
- **[Plan]** Plano de implementação do Lead No-Show → [[2026-05-21-lead-no-show]]
- **[Feature]** Lead No-Show — clique direito no card marca/desfaz no-show, ícone laranja, contadores no Dashboard → [[2026-05-21-lead-no-show]]
```

- [ ] **Step 3: Atualizar Home.md**

Trocar `## Plans de Implementação (25)` por `## Plans de Implementação (26)` e adicionar `- [[2026-05-21-lead-no-show]]` ao final da lista de Plans.

- [ ] **Step 4: Commit final (no repo, com o sync explícito)**

```
git add -A
git commit -m "docs: sync no-show plan and feature to Obsidian vault"
```

(O vault não é versionado; este commit cobre apenas mudanças no repo.)

---

## Checklist Final

- [ ] Tipo `Lead.status_reuniao` adicionado
- [ ] Queries do Pipeline retornam `status_reuniao`
- [ ] Hook `useToggleNoShow` criado e funcionando
- [ ] `LeadCard` desktop com ContextMenu + ícone laranja
- [ ] `MobileLeadCard` com item de menu + badge laranja
- [ ] Pipeline (desktop e mobile) passa `statusReuniao` e handler
- [ ] Dashboard mostra contagem e taxa de no-show
- [ ] Build e lint limpos
- [ ] Smoke manual: desktop, mobile, dashboard, erro de rede
- [ ] Obsidian vault sincronizado (Changelog, Home, plano)
