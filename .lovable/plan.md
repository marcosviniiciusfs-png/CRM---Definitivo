

# Redesign do Admin Dashboard - Layout com Tabs e Design Limpo

## Visao Geral

Reestruturar completamente o Admin Dashboard para seguir o design das imagens de referencia: navegacao por tabs no topo, fundo branco limpo, sem efeitos neon/glow, e separacao do conteudo em 4 abas.

## Estrutura de Navegacao (Navbar Superior)

Navbar fixa no topo com:
- Logo "Kairoz" + badge "Admin" (lado esquerdo)
- Tabs: **Dashboard** | **Pedidos** | **Clientes** | **Usuarios Admin** (centro)
- Avatar + email do usuario logado (lado direito)

## Aba 1: Dashboard

**Metric Cards (4 cards em linha):**
- Receita Total (R$ X - Y assinantes Pro)
- Ultimos 7 Dias (R$ X - Y novos Pro)
- Total de Usuarios (X - Y gratuitos)
- Taxa de Conversao (X% - Free -> Pro)

**Grafico "Clientes Pagantes vs Gratuitos - Ultimos 8 Meses":**
- LineChart com 2 linhas (Pro e Gratuitos)
- Legenda abaixo do grafico

**Secao inferior (2 colunas):**
- Ultimas Assinaturas: lista com email, data e badge do plano (Pro/Free)
- Resumo de Planos: Plano Pro (Ativo) com count + barra de progresso, Plano Gratuito com count + barra, Ticket medio (Pro)

## Aba 2: Pedidos

**Metric Cards (4):** Total de Pedidos, Receita Total, Pedidos Ativos, Pendentes

**Filtros:** Campo de busca + dropdown "Todos os status" + dropdown "Todos os planos" + botao "Exportar CSV"

**Tabela:** CLIENTE | PLANO | VALOR | STATUS | DATA | ID PAGAMENTO

## Aba 3: Clientes

**Metric Cards (4):** Total de Clientes, Clientes Pagantes, Em Gratuito, Novos este Mes

**Grafico:** "Crescimento de Clientes - Ultimos 8 Meses" (AreaChart com Pro + Gratuito)

**Filtros:** Campo de busca + dropdown "Todos os planos" + botao "Exportar CSV"

**Tabela:** EMAIL | DATA DE CADASTRO | PLANO | STATUS | TEMPO ASSINANTE | JA CANCELOU? | ID PAGAMENTO | ACOES (link "Plano")

## Aba 4: Usuarios Admin

**Layout 2 colunas:**
- Esquerda: "Criar Novo Administrador" - formulario com Email + Senha + botao "Criar Administrador"
- Direita: "Administradores Ativos" - lista com avatar, email, badge "Voce", data de adicao

## Mudancas Visuais

- Remover TODAS as classes `glow-border` e `glow-icon`
- Remover GIF de paying users
- Cards com borda sutil `border` padrao, fundo branco
- Icones coloridos dentro de circulos (verde para $, azul para trending, roxo para usuarios, etc.)
- Design completamente limpo e minimalista
- Forcar tema claro no admin (`bg-white` em vez de `bg-background`)

## Detalhes Tecnicos

### Arquivos a modificar

| Arquivo | Acao |
|---------|------|
| `src/pages/AdminDashboard.tsx` | Reescrever completamente com layout de tabs |
| `src/pages/AdminUserDetails.tsx` | Ajuste minimo - remover glow, manter funcionalidades |
| `src/App.tsx` | Sem alteracao - rotas permanecem iguais |

### Implementacao

O `AdminDashboard.tsx` sera reestruturado usando `Tabs` do Radix UI (ja disponivel em `src/components/ui/tabs.tsx`) para as 4 abas.

**Todas as funcionalidades existentes serao mantidas:**
- `loadData()` com RPCs e Edge Functions (count_main_users, list_all_users, count-paying-users, calculate-mrr, calculate-daily-revenue, subscription-growth)
- `loadAdmins()`, `handleAddAdmin()`, `handleRemoveAdmin()` para gerenciamento de admins
- Paginacao na tabela de usuarios
- Navegacao para `/admin/user/:userId` ao clicar em um usuario
- Dialog de adicionar admin

**Dados reorganizados entre as tabs:**
- Tab Dashboard: mrr, dailyRevenue, payingUsersCount, totalUsers, chartData, planChartData
- Tab Pedidos: mesmos dados de users filtrados/apresentados como "pedidos" (assinaturas)
- Tab Clientes: users completo com paginacao, grafico de crescimento
- Tab Usuarios Admin: admins, formulario de criar admin

**Novos calculos derivados:**
- Taxa de conversao: `(payingUsersCount / totalUsers) * 100`
- Usuarios gratuitos: `totalUsers - payingUsersCount`
- Novos este mes: ja calculado em `newUsersThisMonth`
- Ticket medio Pro: `mrr / payingUsersCount`

### Icones dos MetricCards

Cada metric card tera um icone dentro de um circulo colorido, seguindo o padrao das imagens:
- `DollarSign` em circulo verde para receita
- `TrendingUp` em circulo azul para ultimos 7 dias
- `Users` em circulo laranja para total usuarios
- `BarChart3` em circulo roxo para taxa de conversao
- `ShoppingCart` em circulo azul para pedidos
- `CheckCircle` em circulo verde para ativos
- `Clock` em circulo vermelho para pendentes

