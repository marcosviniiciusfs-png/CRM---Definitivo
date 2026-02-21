
# Limpeza do Modal de Edicao + Agendamento de Venda + Tooltips no Dashboard

## 3 tarefas principais

### Tarefa 1: Limpar o modal de edicao do lead (EditLeadModal.tsx)

**Remover:**
- Card "Acoes" inteiro (linhas 1539-1562): os 4 botoes "Enviar e-mail", "Fazer ligacao", "Gerar proposta", "Enviar WhatsApp" que nao funcionam
- Secao "Funil de Vendas" (linhas 800-867): a previa visual do funil com as etapas clicaveis (Novo Lead, Em Atendimento, Fechado, Perdido) e o Separator logo abaixo
- Remover tambem os estados e funcoes associados: `isUpdatingStage`, `handleStageClick`, `getStageLabel`, `getStageColor`, `editedStage`

**Manter:** Tabs de atividades, historico, sidebar com valor do negocio, dados do negocio, produtos/servicos

---

### Tarefa 2: Adicionar Agendamento de Venda ao lead

**Nova coluna no banco:**
- `data_agendamento_venda` (timestamp with time zone, nullable) na tabela `leads`

**No EditLeadModal.tsx (sidebar "Dados do negocio"):**
- Adicionar campo "Agendamento de Venda" com date+time picker (mesmo padrao dos outros campos editaveis com Popover + Calendar)
- O usuario seleciona data e hora do agendamento
- Salvar no campo `data_agendamento_venda` do lead
- Exibir a data formatada na sidebar

**No LeadDetailsDialog.tsx:**
- Exibir o agendamento de venda quando existir (similar ao card do Google Calendar que ja existe)

**Impacto nas metricas do Dashboard:**
- O campo `data_agendamento_venda` sera usado para calcular metricas como "Vendas Agendadas" no dashboard
- Os leads com agendamento preenchido podem ser contados para prever faturamento

---

### Tarefa 3: Tooltips explicativos em todas as metricas do Dashboard

**Modificar MetricCard.tsx:**
- Adicionar prop opcional `tooltip?: string` ao componente
- Envolver o titulo com um Tooltip (do Radix) mostrando a explicacao ao passar o mouse
- Icone de interrogacao (?) pequeno ao lado do titulo

**Textos dos tooltips no Dashboard.tsx:**

| Metrica | Tooltip |
|---------|---------|
| Novos Leads | "Total de leads captados neste mes. Inclui todas as fontes (manual, webhook, formularios)." |
| Novos Clientes | "Leads que foram movidos para a etapa 'Ganho' do funil neste mes." |
| Receita do Mes | "Soma do valor de todos os leads marcados como 'Ganho' neste mes." |
| Ticket Medio | "Receita do mes dividida pelo numero de vendas fechadas. Quanto maior, mais valor por venda." |
| Taxa de Perda | "Percentual de leads marcados como 'Perdido' em relacao ao total de leads." |
| Ciclo Medio de Vendas | "Tempo medio em dias entre a criacao do lead e o fechamento da venda (etapa 'Ganho'). Quanto menor, mais rapido sua equipe converte." |
| Previsao de Faturamento | "Valor ponderado do pipeline ativo. Calcula: valor de cada lead * taxa historica de conversao da etapa em que ele se encontra (ultimos 90 dias)." |
| Receita Prevista | "Projecao de receita do proximo mes baseada na media dos ultimos 3 meses de vendas fechadas, com ajuste de tendencia." |

**Cards grandes (Conversao, Gargalo, Top Sellers, Receita Acumulada):**
- Adicionar um icone de interrogacao ao lado do titulo de cada card com tooltip explicativo

---

## Arquivos a modificar/criar

| Arquivo | Acao |
|---------|------|
| Migracao SQL | Criar coluna `data_agendamento_venda` na tabela `leads` |
| `src/components/EditLeadModal.tsx` | Remover secao Acoes + Funil, adicionar campo Agendamento de Venda na sidebar |
| `src/components/MetricCard.tsx` | Adicionar prop `tooltip` com icone de interrogacao |
| `src/pages/Dashboard.tsx` | Passar textos de tooltip para cada MetricCard e cards grandes |
| `src/components/LeadDetailsDialog.tsx` | Exibir data de agendamento de venda (se existir) |

## Detalhes tecnicos

### Migracao SQL
```sql
ALTER TABLE public.leads 
ADD COLUMN data_agendamento_venda TIMESTAMPTZ DEFAULT NULL;
```

### MetricCard - nova prop
```typescript
interface MetricCardProps {
  // ... existentes
  tooltip?: string;  // NOVO
}
```
O tooltip sera implementado com o componente `Tooltip` do Radix que ja existe em `src/components/ui/tooltip.tsx`. Um icone `HelpCircle` (lucide) de 14px aparecera ao lado do titulo.

### Agendamento de Venda no EditLeadModal
- Usar o mesmo padrao de Popover + Calendar dos campos "Data de inicio" e "Data de conclusao"
- Adicionar campo de hora (Input type="time") dentro do Popover
- Salvar como `data_agendamento_venda` no lead
- Estado: `editingAgendamentoVenda`, `dataAgendamentoVenda`
