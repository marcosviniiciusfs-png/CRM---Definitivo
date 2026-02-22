
# Correcoes: RLS Despesas, Planos no Admin, e Controle de Acesso por Secao

## Problema 1: Despesas nao salvam - RLS bloqueando

**Causa raiz**: A tabela `production_expenses` tem uma policy RESTRICTIVE chamada "Deny public access to production expenses" com `USING (false)` para ALL. Policies RESTRICTIVE com `false` bloqueiam TUDO, inclusive usuarios autenticados, mesmo que existam policies PERMISSIVE permitindo acesso. E assim que o Postgres funciona: RESTRICTIVE policies fazem AND com as PERMISSIVE.

### Correcao:
- Migracacao SQL: Dropar a policy restritiva "Deny public access to production expenses"
- As policies permissivas ja existentes (Admins can create/update/delete, Users can view) passam a funcionar corretamente

```sql
DROP POLICY "Deny public access to production expenses" ON production_expenses;
```

---

## Problema 2: Todos usuarios mostram "Pro" no Admin Dashboard

**Causa raiz**: O AdminDashboard.tsx usa `u.email_confirmed_at` (campo de confirmacao de email) para determinar se o usuario e "Pro" ou "Free". Isso esta completamente errado -- `email_confirmed_at` significa que o usuario confirmou o email, nao que tem assinatura. A tabela `subscriptions` esta VAZIA (0 registros), entao todos sao gratuitos.

Linhas afetadas no AdminDashboard.tsx:
- Linha 392-393: "Ultimas Assinaturas" mostra badge Pro/Free baseado em `email_confirmed_at`
- Linha 497-498: Tabela "Pedidos" mostra badge Pro/Free baseado em `email_confirmed_at`
- Linha 501: Valor do pedido usa `email_confirmed_at` para calcular
- Linha 609-610: Tabela "Clientes" mostra badge Pro/Free baseado em `email_confirmed_at`

### Correcao:
- No `loadData`, carregar os dados da tabela `subscriptions` e criar um Map de `user_id -> plan_id`
- Substituir todas as referencias a `email_confirmed_at ? "Pro" : "Free"` por uma lookup nesse Map
- Exibir o nome correto do plano (Star/Pro/Elite) ou "Free" quando nao houver assinatura

### Arquivo: `src/pages/AdminDashboard.tsx`
- Adicionar state `subscriptionMap: Record<string, string>` 
- No `loadData`, query `subscriptions` (select user_id, plan_id, status where status = 'authorized')
- Criar helper `getUserPlan(userId)` que retorna o plan_id ou 'none'
- Atualizar todas as 4 ocorrencias de badge Pro/Free nas 3 tabelas

---

## Problema 3: Controle de acesso por secao no Admin

Criar um sistema que permita ao super admin definir quais secoes cada usuario pode ver/acessar, incluindo liberar individualmente as secoes "Em breve" (Metricas, Roleta, Chat, Integracoes).

### 3.1 Nova tabela `user_section_access`

```sql
CREATE TABLE public.user_section_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, section_key)
);

ALTER TABLE user_section_access ENABLE ROW LEVEL SECURITY;

-- Super admins podem gerenciar (via RPC no AdminUserDetails)
CREATE POLICY "Users can read own access" ON user_section_access
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage all" ON user_section_access
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
```

Secoes disponiveis (section_key):
- `dashboard` - Inicio
- `pipeline` - Pipeline
- `leads` - Leads
- `lead-metrics` - Metricas (locked por padrao)
- `lead-distribution` - Roleta de Leads (locked por padrao)
- `chat` - Chat (locked por padrao)
- `ranking` - Ranking
- `colaboradores` - Colaboradores
- `producao` - Producao
- `equipes` - Equipes
- `atividades` - Atividades
- `tasks` - Tarefas
- `integrations` - Integracoes (locked por padrao)
- `settings` - Configuracoes

### 3.2 UI no AdminUserDetails

Adicionar um novo Card "Controle de Acesso por Secao" abaixo do card de Plano:
- Lista de todas as secoes com switches (toggle on/off)
- As secoes "Em breve" aparecem com indicador especial
- Botao "Salvar Acessos" faz upsert em `user_section_access`
- Por padrao, secoes nao-locked sao habilitadas e secoes locked sao desabilitadas

### 3.3 Sidebar respeita o controle

No `AppSidebar.tsx`:
- Carregar `user_section_access` do usuario logado
- Para cada item do menu, verificar se existe registro `is_enabled = false` para aquela secao
- Se `is_enabled = false`, ocultar o item completamente (nao mostrar nem como locked)
- Para secoes "Em breve" (LOCKED_FEATURES), se `is_enabled = true` no banco, DESBLOQUEAR (remover o Lock e permitir navegacao)
- Se nao houver registro no banco, usar o comportamento padrao (liberado para secoes normais, locked para LOCKED_FEATURES)

### Arquivos afetados:
- Migracao SQL: criar tabela + policies
- `src/pages/AdminUserDetails.tsx`: Novo card com toggles por secao
- `src/components/AppSidebar.tsx`: Consultar `user_section_access` e aplicar visibilidade

---

## Resumo Tecnico

| Correcao | Arquivo(s) | Tipo |
|----------|-----------|------|
| RLS production_expenses | Migracao SQL | DB |
| Plano correto no admin | AdminDashboard.tsx | UI/Logica |
| Tabela section_access | Migracao SQL | DB |
| UI controle de acesso | AdminUserDetails.tsx | UI |
| Sidebar respeita acesso | AppSidebar.tsx | Logica |
