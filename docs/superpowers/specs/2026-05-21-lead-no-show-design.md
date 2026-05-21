# Lead No-Show — Marcação via Card

## Visão Geral

Permitir que o operador marque rapidamente um lead como **no-show** (faltou à reunião) clicando com o botão direito no card do Pipeline. O ícone de calendário do card passa a refletir visualmente esse estado (laranja em vez de azul) e o Dashboard ganha contadores de no-show no mesmo padrão das demais métricas.

A infraestrutura de dados já existe: a coluna `leads.status_reuniao` (enum `'realizada' | 'no_show'`) foi criada na migration `20260331000000_add_status_reuniao.sql`. Esta spec entrega a UI e a métrica que estavam faltando.

## Objetivos

- Operador marca/desmarca no-show em um clique direito sobre o card
- Sinalização visual imediata no card (ícone do calendário laranja)
- Métricas de no-show e taxa de no-show no Dashboard

## Escopo

### Inclui

- Menu de contexto (clique direito) no `LeadCard` desktop com toggle "Marcar como no-show" / "Desfazer no-show"
- Mesmo item no `DropdownMenu` (3 pontinhos) do `MobileLeadCard`
- Cor do ícone `CalendarDays` muda para laranja quando `status_reuniao = 'no_show'`
- Hook de mutação `useToggleNoShow` com optimistic update e toast
- Dashboard: contagem de `no_show` no período e card "Taxa de no-show"

### Não inclui (YAGNI)

- Submenu para marcar como `realizada` (fluxo já existente fora do card; pode entrar em spec separada se necessário)
- Limpar status pela tela de detalhes (toggle no card já cobre desfazer)
- Histórico/audit log de mudanças de status
- Notificações automáticas pós no-show
- Permissões customizadas — herda RLS existente da tabela `leads`
- Migração de banco (campo já existe)

## Decisões de Design

| Decisão | Escolha | Por quê |
|---|---|---|
| Cor do ícone laranja | Apenas quando `status_reuniao = 'no_show'` | Sinaliza estado anormal sem poluir o caso comum (azul = agendamento pendente) |
| Gatilho no desktop | Botão direito via `ContextMenu` shadcn | Atende o pedido literal e não atrapalha o menu do lápis (Editar/Detalhes/Excluir) |
| Gatilho no mobile | Item adicionado ao `DropdownMenu` existente | Mobile não tem botão direito; long-press exigiria handler extra sem ganho relevante |
| Escopo do item | Toggle simples (marcar/desfazer no-show) | Foco no fluxo solicitado; reduz superfície de UI |
| Pré-condição | Item desabilitado se `dataAgendamentoReuniao` é `NULL` | No-show pressupõe reunião marcada; valida semântica do dado |

## Arquitetura

### Banco

Sem migration nova. Reusa:

```sql
-- já aplicado em 20260331000000_add_status_reuniao.sql
CREATE TYPE status_reuniao_type AS ENUM ('realizada', 'no_show');
ALTER TABLE leads ADD COLUMN status_reuniao status_reuniao_type DEFAULT NULL;
CREATE INDEX idx_leads_org_status_reuniao ON leads (organization_id, status_reuniao);
```

### Hook de mutação — `src/hooks/useToggleNoShow.ts` (novo)

```ts
type StatusReuniao = 'realizada' | 'no_show' | null;

interface ToggleNoShowInput {
  leadId: string;
  currentStatus: StatusReuniao;
}

// Toggle: se status atual é 'no_show' → null; caso contrário → 'no_show'.
// (Quando o lead estiver em 'realizada', clicar "Marcar como no-show" sobrescreve.)
// Optimistic update no cache do pipeline.
// Invalida cache do dashboard ao concluir.
// Toast de sucesso/erro.
useToggleNoShow(): UseMutationResult<...>
```

Regras:

- Se `currentStatus === 'no_show'` → `UPDATE leads SET status_reuniao = NULL WHERE id = ?`
- Caso contrário → `UPDATE leads SET status_reuniao = 'no_show' WHERE id = ?`
- Optimistic: atualiza a chave de query usada pelo Pipeline (descobrir no plano: provavelmente `['pipeline-leads', orgId, funnelId]` ou similar)
- Em erro: rollback do optimistic + toast de erro

### LeadCard desktop — [src/components/LeadCard.tsx](src/components/LeadCard.tsx)

**Novas props:**

```ts
statusReuniao?: 'realizada' | 'no_show' | null;
onToggleNoShow?: () => void;
```

**Envolver o `<Card>` raiz com `<ContextMenu>`:**

```tsx
<ContextMenu>
  <ContextMenuTrigger asChild>
    <Card ... />
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem
      disabled={!dataAgendamentoReuniao}
      onSelect={() => onToggleNoShow?.()}
    >
      {statusReuniao === 'no_show' ? 'Desfazer no-show' : 'Marcar como no-show'}
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

**Cuidados:**

- `e.stopPropagation()` no trigger para não conflitar com drag-and-drop (`@dnd-kit`)
- Item desabilitado mostra tooltip nativo "Defina uma data de reunião primeiro"
- Atualizar `memo` comparator (final do arquivo, ~linha 657) para incluir `statusReuniao`

**Ícone do calendário** (atualizar [LeadCard.tsx:391-401](src/components/LeadCard.tsx#L391)):

```tsx
{dataAgendamentoReuniao && !dragging && (
  <button
    ...
    title={
      statusReuniao === 'no_show'
        ? `Reunião (No-show): ${formattedDate}`
        : `Reunião: ${formattedDate}`
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
)}
```

### MobileLeadCard — [src/components/MobileLeadCard.tsx](src/components/MobileLeadCard.tsx)

- Mesmas duas props (`statusReuniao`, `onToggleNoShow`)
- Adiciona um `<DropdownMenuItem>` no menu de 3 pontinhos existente, com mesma label dinâmica e mesma regra de `disabled`
- Mesma lógica de cor do ícone

### Pipeline / PipelineColumn — [src/pages/Pipeline.tsx](src/pages/Pipeline.tsx) e [src/components/PipelineColumn.tsx](src/components/PipelineColumn.tsx)

- Garantir que `status_reuniao` é incluído no `select()` da query de leads do pipeline
- Conectar `useToggleNoShow` e passar `statusReuniao` + `onToggleNoShow={() => mutate({ leadId, currentStatus })}` adiante até o `LeadCard`
- Mesmo wiring no fluxo mobile

### Dashboard — [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx)

- Duplicar o padrão das queries de `realizada` ([linhas 399 e 580](src/pages/Dashboard.tsx#L399)) para `no_show`
- Renderizar dois novos elementos:
  - **Card "Reuniões"**: mostra `X realizadas / Y no-show` (combina os dois contadores)
  - **Card "Taxa de no-show"**: `noShow / (realizada + noShow) * 100` no período filtrado
- Trend (atual vs período anterior) seguindo o padrão dos demais cards

## Fluxo de Dados

```
Operador → botão direito no card
        → ContextMenu abre
        → clica "Marcar como no-show"
        → onToggleNoShow() → useToggleNoShow.mutate()
        → optimistic: cache pipeline reflete status_reuniao = 'no_show'
        → ícone do card vira laranja imediatamente
        → Supabase UPDATE confirma
        → invalida cache do dashboard
        → toast "Lead marcado como no-show"
```

Próximo refresh do Dashboard reflete contadores atualizados.

## Tratamento de Erros

| Cenário | Comportamento |
|---|---|
| Erro de rede no UPDATE | Rollback do optimistic + toast de erro |
| Lead sem `dataAgendamentoReuniao` | Item desabilitado, não dispara mutação |
| RLS nega update | Toast de erro genérico + rollback |
| Lead já com `status_reuniao = 'realizada'` | Toggle ainda funciona: marca `'no_show'` (sobrescreve) — operador conscientemente reclassifica |

## Acessibilidade

- `ContextMenu` do shadcn é acessível por teclado nativamente (Shift+F10, Menu key)
- Item desabilitado recebe `aria-disabled` automaticamente
- Tooltip do ícone descreve estado completo (data + "No-show" quando aplicável)
- Contraste laranja vs fundo dark mode: usar `text-orange-500` (mesmo nível de saturação do `text-blue-500` atual)

## Testes Mínimos

- `LeadCard` renderiza item "Marcar como no-show" quando `dataAgendamentoReuniao` está definido
- Item desabilitado quando `dataAgendamentoReuniao` é `null`
- Clique no item chama `onToggleNoShow`
- Label vira "Desfazer no-show" quando `statusReuniao === 'no_show'`
- Ícone laranja com `statusReuniao = 'no_show'`, azul caso contrário
- `MobileLeadCard` espelha os mesmos comportamentos
- `useToggleNoShow` alterna corretamente entre `'no_show'` e `null`
- Dashboard renderiza contagem de no-show e taxa quando há dados

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Conflito do `ContextMenuTrigger` com drag-and-drop do `@dnd-kit` | `e.stopPropagation()` nos handlers do trigger; testar drag após implementar |
| Cache do pipeline com chave de query diferente da esperada | Inspecionar `useQuery` do Pipeline antes de escrever optimistic update no plano |
| Operador marca no-show por engano em produção | Toggle (desfazer) cobre esse caso sem precisar de confirm dialog |
| Mudança de cor pode confundir quem já se acostumou com azul | Tooltip explícito + laranja só aparece em estado anormal |

## Artefatos Tocados

**Novos:**
- `src/hooks/useToggleNoShow.ts`
- Testes para hook e cards

**Modificados:**
- `src/components/LeadCard.tsx`
- `src/components/MobileLeadCard.tsx`
- `src/pages/Pipeline.tsx`
- `src/components/PipelineColumn.tsx`
- `src/pages/Dashboard.tsx`

**Sem mudança:**
- Banco (campo já existe)
- Edge functions
- `LeadDetailsDialog.tsx` (fora do escopo)
