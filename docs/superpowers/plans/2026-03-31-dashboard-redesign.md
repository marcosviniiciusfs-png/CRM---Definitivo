# Plano de Implementação - Dashboard Redesign

## Visão Geral
Redesign completo do dashboard principal do CRM baseado no spec aprovada e em `docs/superpowers/specs/2026-03-31-dashboard-design.md`. O objetivo é criar um dashboard profissional, sem "cara de IA", totalmente funcional com todas as métricas do modelo funcionando.

## Pré-requisitos
- Node.js 18+
- React 18+
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL)
- TanStack Query (React Query)
- Recharts (gráficos)
- Framer Motion (animações)

## Estrutura de Arquivos

### Arquivos a criar/modificar
| Arquivo | Descrição |
|--------|-------------|
| `src/pages/Dashboard.tsx` | **REESCREVER COMPLE** - componente principal do dashboard |
| `src/components/MetricCard.tsx` | **Reutilizar** - componente de card de métricas existente |
| `supabase/migrations/YYYYMMDDHHMMSS_add_status_reuniao.sql` | **CRIAR** - migration para campo `status_reuniao` |
| `docs/superpowers/specs/2026-03-31-dashboard-design.md` | **REFERÊNCIA** - spec de referência (este arquivo) |

### Arquivos a criar
| Arquivo | Descrição |
|--------|-------------|
| `src/components/dashboard/DashboardFilters.tsx` | **NO** - Componente de filtro de período |
| `src/components/dashboard/DashboardCharts.tsx` | **No** - Componente de gráficos (Funil, Leads) |

## Definições de Dados

### Períodos de Filtro
| Período | Descrição |
|--------|-------------|
| Hoje | Leads com `created_at` de hoje (00:00 - 23:59) |
| Este Mês | Leads com `created_at` no mês atual (1º até último day) |
| Trimestre | Leads com `created_at` no trimestre atual (Jan 1st/Feb 1st/Apr 1st/Jul 1st/Oct 1st) |
| Ano | Leads com `created_at` no ano atual (Jan 1st - Dec 31st) |

### Cálculos de Métricas

| Métrica | Cálculo |
|--------|----------|
| **Leads Totais** | `COUNT(leads) WHERE organization_id = ? AND created_at BETWEEN ? |
| **MQL** | `COUNT(leads) WHERE organization_id = ? AND funnel_stage_id IN (SELECT id FROM funnel_stages WHERE stage_type = 'won')` |
| **Taxa MQL** | `(MQL / Leads Totais) * 100)` |
| **Leads Hoje** | `COUNT(leads) WHERE organization_id = ? AND created_at::date = CURRENT_DATE` |
| **Reuniões Agendadas** | `COUNT(leads) WHERE organization_id = ? AND calendar_event_id IS NOT NULL` |
| **Realizadas** | `COUNT(leads) WHERE organization_id = ? AND calendar_event_id IS NOT NULL AND status_reuniao = 'realizada'` |
| **No-show** | `COUNT(leads) WHERE organization_id = ? AND calendar_event_id IS NOT NULL AND status_reuniao = 'no_show'` |
| **Taxa No-show** | `(No-show / Reuniões Agendadas) * 100)` |
| **Vendas do Mês** | `SUM(valor) FROM leads WHERE organization_id = ? AND funnel_stage_id IN (SELECT id FROM funnel_stages WHERE stage_type = 'won') AND updated_at >= start_of_month` |
| **Vendas no Total** | `COUNT(leads) WHERE organization_id = ? AND funnel_stage_id IN (SELECT id FROM funnel_stages WHERE stage_type = 'won')` |
| **Leads no Funil** | `COUNT(leads) WHERE organization_id = ? AND funnel_stage_id IS NOT NULL AND funnel_stage_id NOT IN (SELECT id FROM funnel_stages WHERE stage_type IN ('won', 'lost'))` |

## Tarefas de Implementação

### Fase 1: Preparação e Banco de Dados (30 min)
- [ ] Criar migration `add_status_reuniao_field`
- [ ] Executar migration no Supabase
- [ ] Atualizar tipos TypeScript se necessário

### Fase 2: Componente de Filtro de Período (45 min)
- [ ] Criar `DashboardFilters.tsx`
- [ ] Implementar lógica de período (Hoje, Este Mês, Trimestre, Ano)
- [ ] Estilização: profissional, dark mode nativo
- [ ] Integração com Dashboard.tsx

### Fase 3: Queries React Query (60 min)
- [ ] Query: Leads Totais
- [ ] Query: MQL + Taxa MQL
- [ ] Query: Leads Hoje
- [ ] Query: Reuniões Agendadas
- [ ] Query: Realizadas vs No-show
- [ ] Query: Vendas do Mês
- [ ] Query: Vendas no Total
- [ ] Query: Leads no Funil
- [ ] Query: Top 5 Vendedores (existente)
- [ ] Query: Funil Completo (existente)
- [ ] Query: Gargalo (existente)

### Fase 4: UI dos Cards (60 min)
- [ ] Reorganizar layout do Dashboard.tsx
- [ ] Aplicar novo grid (4 cards + 3 cards + 3 cards)
- [ ] Adicionar tooltips explicativos
- [ ] Estilização: cores por métrica, dark mode
- [ ] Manter componente Top 5 Vendedores com gif

### Fase 5: Seções Inferiores (45 min)
- [ ] Criar componente Taxas Chave (tabela)
- [ ] Integrar gráfico Funil Completo
- [ ] Integrar visualização de Gargalo
- [ ] Real-time subscriptions

### Fase 6: Testes e Validação (30 min)
- [ ] Testar filtro de período
- [ ] Testar todas as métricas
- [ ] Validar dark mode
- [ ] Testar real-time updates
- [ ] Verificar responsividade mobile

### Fase 7: Documentação e Commit (15 min)
- [ ] Atualizar comentários no código
- [ ] Commit final

## Critérios de Aceite
- [ ] Todas as 12 métricas funcionando
- [ ] Filtro de período operacional
- [ ] Dark mode funcionando corretamente
- [ ] Real-time updates funcionando
- [ ] Top 5 Vendedores mantido com gif
- [ ] Performance otimizada (queries paralelas)
- [ ] Código limpo e legível

## Riscos Técnicos
- **Migration**: Campo novo requer deploy antes do código
- **Performance**: Muitas queries podem impactar tempo de carregamento inicial
- **Compatibilidade**: Manter su função com componentes existentes (MetricCard)

## Estimativa de Tempo
- **Desenvolvimento**: 3-4 horas
- **Testes**: 1 hora
- **Total**: 4-5 horas
