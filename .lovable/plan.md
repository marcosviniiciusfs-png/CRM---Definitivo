
# Plano: Mercado Pago Signature, Remocao de Ranking em Equipes, e Melhorias Financeiras/Colaboradores

## 1. Mercado Pago - Webhook Signature Secret

O Mercado Pago fornece uma chave secreta (signature) para validar que as notificacoes webhook sao autenticas. Atualmente o webhook `mercadopago-webhook` NAO valida a assinatura -- aceita qualquer request. A secret `MERCADOPAGO_WEBHOOK_SECRET` nao existe no projeto.

### Alteracoes:
- Solicitar ao usuario a chave de assinatura via ferramenta `add_secret` com nome `MERCADOPAGO_WEBHOOK_SECRET`
- Atualizar `supabase/functions/mercadopago-webhook/index.ts` para validar o header `x-signature` usando HMAC-SHA256 antes de processar a notificacao
- Rejeitar requests com assinatura invalida (retornando 401)

---

## 2. Remover Ranking de Equipes da pagina Equipes

O componente `TeamSalesMetrics` esta renderizado na pagina Equipes (linhas 342-349 de `Equipes.tsx`). O usuario quer REMOVER isso da pagina Equipes. Ja esta presente no Ranking, onde deve ficar.

### Alteracao:
- **`src/pages/Equipes.tsx`**: Remover o bloco que renderiza `<TeamSalesMetrics>` (linhas 342-349) e o import correspondente (linha 18)

---

## 3. Melhorias no Gerenciamento Financeiro e de Colaboradores

### 3.1 Comissoes Automaticas (atualmente manual/vazio)

**Problema**: A tabela `commissions` existe com 2 registros pendentes e ha 1 `commission_config` configurada, mas NAO existe trigger/automacao que crie comissoes automaticamente quando um lead e ganho. As comissoes precisam ser criadas manualmente.

**Solucao**: Criar um trigger de banco de dados que, ao mover um lead para o estagio "won", calcule e insira automaticamente uma comissao na tabela `commissions` baseado na configuracao de `commission_configs` da organizacao.

### Alteracoes:
- Migracao SQL: criar funcao `auto_create_commission()` + trigger em `leads` quando `funnel_stage_id` muda para um estagio do tipo "won"
- A funcao verifica se existe `commission_configs` ativa para a organizacao, calcula o valor e insere em `commissions`

### 3.2 Metas Individuais de Faturamento (Goals)

**Problema**: A tabela `goals` existe mas os valores sao fallback fixo (R$50.000). Nao ha interface para admin/owner definir metas por colaborador.

**Solucao**: Adicionar um botao "Definir Meta" no `TopSalesReps` que abre um modal simples para definir a meta de faturamento de cada colaborador.

### Alteracoes:
- **`src/components/dashboard/TopSalesReps.tsx`**: Adicionar icone de edicao ao lado de cada vendedor (visivel apenas para owner/admin) que abre um dialog inline para definir `target_value` na tabela `goals`
- Criar/atualizar o registro na tabela `goals` com upsert por `user_id + organization_id`

### 3.3 Blocos de Producao - Custos Reais e Despesas

**Problema**: Os blocos de producao calculam `total_cost` baseado apenas no `cost_price` dos itens vendidos. Nao ha como registrar despesas operacionais (aluguel, salarios, marketing, etc.) que afetam o lucro real.

**Solucao**: Criar uma tabela `production_expenses` para registrar despesas mensais e um componente para adiciona-las dentro do modal de detalhe do bloco de producao.

### Alteracoes:
- Migracao SQL: criar tabela `production_expenses` (id, organization_id, production_block_id, category, description, amount, created_at) com RLS
- **`src/components/ProductionBlockDetailModal.tsx`**: Adicionar secao "Despesas" com formulario para adicionar despesas e lista das existentes
- **`src/components/ProductionDashboard.tsx`**: Incluir despesas no calculo do lucro total exibido nos cards

### 3.4 Dashboard Financeiro Consolidado

**Problema**: Nao existe uma visao financeira consolidada. Os dados estao espalhados entre blocos de producao, comissoes e leads.

**Solucao**: Adicionar uma aba "Financeiro" na pagina Producao com resumo consolidado:
- Receita total do mes (leads ganhos)
- Custos dos produtos vendidos
- Despesas operacionais (da nova tabela)
- Comissoes pendentes/pagas
- Lucro liquido real

### Alteracoes:
- **`src/pages/Producao.tsx`**: Adicionar terceira aba "Financeiro"
- **`src/components/FinancialSummary.tsx`** (novo): Componente com cards de receita, custos, despesas, comissoes e lucro liquido, alimentado por queries na base

### 3.5 Historico de Atividades do Colaborador

**Problema**: A tabela `system_activities` existe mas nao ha visualizacao no perfil do colaborador. Nao e possivel ver o historico de acoes de cada membro.

**Solucao**: No `CollaboratorDashboard`, quando um colaborador e selecionado, mostrar um feed de atividades recentes (leads movidos, tarefas concluidas, vendas fechadas).

### Alteracoes:
- **`src/components/CollaboratorDashboard.tsx`**: Adicionar secao "Atividades Recentes" abaixo das metricas do colaborador selecionado, consultando `system_activities` filtrado por `user_id`

### 3.6 Indicadores de Performance (KPIs) por Colaborador na Tabela

**Problema**: A tabela de colaboradores em `Colaboradores.tsx` ja mostra vendas/faturamento do mes, mas faltam indicadores visuais claros de performance (bom, medio, ruim).

**Solucao**: Adicionar badges visuais de performance na tabela baseados em conversao e faturamento vs meta.

### Alteracoes:
- **`src/pages/Colaboradores.tsx`**: Na coluna de vendas/faturamento da tabela, adicionar indicador visual (verde/amarelo/vermelho) baseado na comparacao com a meta individual do colaborador

---

## Resumo Tecnico

| Alteracao | Arquivo(s) | Tipo |
|-----------|-----------|------|
| MP Webhook Secret | mercadopago-webhook/index.ts + secret | Backend + Seguranca |
| Remover ranking Equipes | Equipes.tsx | UI |
| Comissoes automaticas | Migracao SQL (trigger) | Backend |
| Metas individuais | TopSalesReps.tsx | UI + DB |
| Despesas de producao | Migracao SQL + ProductionBlockDetailModal.tsx + ProductionDashboard.tsx | Backend + UI |
| Dashboard financeiro | Producao.tsx + FinancialSummary.tsx (novo) | UI |
| Atividades do colaborador | CollaboratorDashboard.tsx | UI |
| KPIs visuais na tabela | Colaboradores.tsx | UI |
