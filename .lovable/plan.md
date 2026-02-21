

# Controle de Acesso por Assinatura e Features "Em Breve"

## Resumo

Implementar duas camadas de controle:
1. **Paywall**: Usuarios sem assinatura ativa sao redirecionados para a pagina de Pricing (nao acessam o CRM)
2. **Features bloqueadas**: Metricas, Roleta de Leads, Chat e Integracoes ficam com tag "Em breve" e inacessiveis para todos os usuarios

## Mudancas

### 1. Novo componente `SubscriptionGate`

Criar um componente wrapper que verifica se o usuario tem assinatura ativa antes de permitir acesso ao CRM:

- Usa `subscriptionData` do `AuthContext`
- Se `subscribed === false`, redireciona para `/pricing`
- Se `subscribed === true`, renderiza os children normalmente
- Mostra loading enquanto verifica (subscriptionData pode ser null no inicio)

Sera usado no `App.tsx` envolvendo as rotas protegidas que precisam de assinatura (todas exceto `/pricing` e `/success`).

### 2. Ajustar fluxo de Auth

- Apos login/signup, redirecionar para `/pricing` em vez de `/dashboard`
- No `ProtectedRoute`, manter a logica atual (auth + org)
- O `SubscriptionGate` fara a verificacao adicional de assinatura

Fluxo completo:
```text
Usuario faz login
  |
  v
ProtectedRoute: verifica auth + org
  |
  v
SubscriptionGate: verifica assinatura
  |-- Sem assinatura -> /pricing
  |-- Com assinatura -> Dashboard/CRM
```

### 3. Pagina de Pricing acessivel sem assinatura

A rota `/pricing` ja esta dentro de `ProtectedRoute` (precisa de auth), mas NAO deve estar dentro do `SubscriptionGate`. Assim, usuarios logados sem assinatura podem acessar para escolher um plano.

Mesma logica para `/success` (pagina de confirmacao de pagamento).

### 4. Features bloqueadas com "Em breve"

No `AppSidebar.tsx`, os seguintes itens do menu serao marcados com badge "Em breve" e terao navegacao desabilitada:

| Feature | Rota | Acao |
|---------|------|------|
| Metricas | `/lead-metrics` | Badge "Em breve", click desabilitado |
| Roleta de Leads | `/lead-distribution` | Badge "Em breve", click desabilitado |
| Chat | `/chat` | Badge "Em breve", click desabilitado |
| Integracoes | `/integrations` | Badge "Em breve", click desabilitado |

Os itens continuam visiveis no menu, mas:
- Aparece um badge amarelo/cinza "Em breve" ao lado do nome
- O link nao navega (fica como `div` em vez de `NavLink`)
- Estilo visual mais opaco (opacity-60) para indicar indisponibilidade

Alem disso, as rotas no `App.tsx` para essas paginas terao um guard que redireciona para `/dashboard` caso alguem tente acessar diretamente pela URL.

### 5. Sidebar - PLAN_NAMES atualizado

Atualizar o mapa de nomes de planos no `AppSidebar.tsx` para usar os novos IDs:
```text
star -> Star
pro -> Pro
elite -> Elite
```

## Arquivos a modificar

| Arquivo | Acao |
|---------|------|
| `src/components/SubscriptionGate.tsx` | NOVO - Wrapper que verifica assinatura |
| `src/App.tsx` | Envolver rotas com SubscriptionGate, excluir /pricing e /success |
| `src/components/AppSidebar.tsx` | Adicionar badges "Em breve" e desabilitar links bloqueados, atualizar PLAN_NAMES |
| `src/pages/Auth.tsx` | Apos login, redirecionar para /pricing em vez de /dashboard |

## Detalhes Tecnicos

### SubscriptionGate.tsx

```text
- Importar useAuth para acessar subscriptionData
- Se subscriptionData === null (loading), mostrar LoadingAnimation
- Se subscriptionData.subscribed === false, Navigate para /pricing
- Se subscriptionData.subscribed === true, renderizar children
```

### AppSidebar - Itens bloqueados

Lista de URLs bloqueadas definida como constante:
```text
const LOCKED_FEATURES = ['/lead-metrics', '/lead-distribution', '/chat', '/integrations']
```

Para cada item no menu, verificar se esta na lista. Se sim:
- Renderizar como div (nao NavLink)
- Adicionar Badge "Em breve" com estilo discreto
- Aplicar opacity-60 e cursor-not-allowed

### Auth.tsx

Mudar o redirect apos login de `/dashboard` para `/pricing`. O `SubscriptionGate` cuidara de redirecionar para `/dashboard` se ja tiver assinatura ativa, ou manter em `/pricing` se nao tiver.

Alternativamente, redirecionar para `/dashboard` normalmente e deixar o `SubscriptionGate` redirecionar para `/pricing` - isso e mais limpo pois centraliza a logica.

**Decisao: manter redirect para /dashboard e deixar o SubscriptionGate gerenciar.** Assim o codigo do Auth.tsx nao precisa mudar.

### App.tsx - Estrutura

As rotas bloqueadas (`/lead-metrics`, `/lead-distribution`, `/chat`, `/integrations`) terao um componente simples que redireciona para `/dashboard`, garantindo que mesmo acesso direto pela URL seja bloqueado.

