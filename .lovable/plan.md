

# Migracao Completa: Stripe para Mercado Pago

## Visao Geral

Substituir toda a infraestrutura de pagamentos do Stripe para o Mercado Pago, incluindo 8 Edge Functions, frontend de pricing, e criar um webhook para receber notificacoes do Mercado Pago.

## Novos Precos

| Plano | Preco Antigo | Preco Novo |
|-------|-------------|------------|
| Star | R$ 197 | R$ 47,99 |
| Pro | R$ 497 | R$ 197,99 |
| Elite | R$ 1.970 | R$ 499,00 |
| Colaborador Extra | R$ 30 | R$ 25,00 |

## Arquitetura Mercado Pago

O Mercado Pago usa a API de **Preapproval** (assinaturas recorrentes). O fluxo sera:

```text
Usuario clica "Assinar"
    |
    v
Edge Function "create-checkout" cria um preapproval_plan 
e gera um init_point (URL de pagamento)
    |
    v
Usuario paga no Mercado Pago
    |
    v
Mercado Pago envia notificacao via Webhook (IPN)
    |
    v
Edge Function "mercadopago-webhook" recebe e salva 
o status da assinatura na tabela "subscriptions"
    |
    v
"check-subscription" consulta a tabela "subscriptions"
(nao precisa mais chamar API externa em cada request)
```

## Nova Tabela: subscriptions

Para nao depender de chamadas a API do Mercado Pago em cada verificacao de assinatura, vamos armazenar os dados localmente:

```sql
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID REFERENCES public.organizations(id),
  mp_preapproval_id TEXT UNIQUE,
  mp_payer_email TEXT,
  plan_id TEXT NOT NULL, -- 'star', 'pro', 'elite'
  status TEXT NOT NULL DEFAULT 'pending', -- 'authorized', 'paused', 'cancelled', 'pending'
  amount NUMERIC(10,2),
  extra_collaborators INTEGER DEFAULT 0,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Owners podem ver a propria assinatura
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- Service role pode tudo (webhook)
CREATE POLICY "Service role full access"
  ON public.subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);
-- (esta policy sera restrita ao service_role via role check)
```

## Secret Necessario

Precisaremos configurar **1 novo secret**:

- **MERCADOPAGO_ACCESS_TOKEN**: Token de producao do Mercado Pago (encontrado em mercadopago.com.br > Seu negocio > Configuracoes > Credenciais > Access Token de Producao)

## Edge Functions a Modificar/Criar

### 1. `create-checkout` (REESCREVER)
- Usar API REST do Mercado Pago (`https://api.mercadopago.com/preapproval`)
- Criar assinatura recorrente com os novos precos
- Retornar `init_point` (URL de checkout do MP)
- Se tiver colaboradores extras, somar ao valor total

### 2. `check-subscription` (REESCREVER)
- Em vez de chamar Stripe API, consultar a tabela `subscriptions` local
- Buscar pelo user_id ou pelo owner da organizacao
- Retornar os mesmos campos que retorna hoje (subscribed, product_id, max_collaborators, etc.)
- Muito mais rapido (query local vs API externa)

### 3. `mercadopago-webhook` (NOVA)
- Endpoint publico que recebe notificacoes IPN do Mercado Pago
- Processar eventos: payment, preapproval
- Atualizar a tabela `subscriptions` com o status correto
- URL do webhook: `https://qcljgteatwhhmjskhthp.supabase.co/functions/v1/mercadopago-webhook`

### 4. `update-subscription` (REESCREVER)
- Para adicionar colaboradores: atualizar o `preapproval` no MP com novo valor (plano base + N * R$25)
- Para upgrade: cancelar preapproval atual e criar novo com plano superior

### 5. `customer-portal` (SIMPLIFICAR)
- Mercado Pago nao tem portal de billing como Stripe
- Redirecionar para pagina de gerenciamento do MP ou retornar info da assinatura para gerenciar no proprio CRM

### 6. `calculate-mrr` (REESCREVER)
- Consultar tabela `subscriptions` com status = 'authorized'
- Somar os valores (muito mais simples que iterar owners no Stripe)

### 7. `calculate-daily-revenue` (REESCREVER)
- Consultar tabela `subscriptions` criadas/atualizadas hoje
- Nao precisa mais chamar API do Stripe

### 8. `count-paying-users` (REESCREVER)
- COUNT de subscriptions com status = 'authorized' agrupadas por user_id

### 9. `subscription-growth` (REESCREVER)
- Consultar tabela `subscriptions` ordenadas por created_at
- Gerar chart data sem chamar API externa

## Frontend

### `src/pages/Pricing.tsx`
- Remover todas as referencias a Stripe (priceId, productId)
- Atualizar precos: Star R$47,99, Pro R$197,99, Elite R$499
- Colaborador extra: R$25
- Mapear planos por ID interno ('star', 'pro', 'elite')

### `src/components/ui/creative-pricing.tsx`
- Remover comparacoes com product IDs do Stripe
- Usar plan_id ('star', 'pro', 'elite') para identificar plano atual

### `src/contexts/AuthContext.tsx`
- Sem mudanca estrutural - continua chamando check-subscription que agora consulta tabela local

### `supabase/config.toml`
- Adicionar `mercadopago-webhook` com `verify_jwt = false` (webhook publico)

## URL do Webhook para Mercado Pago

Apos implementacao, a URL que voce deve cadastrar no painel do Mercado Pago sera:

```
https://qcljgteatwhhmjskhthp.supabase.co/functions/v1/mercadopago-webhook
```

Essa URL recebera as notificacoes automaticas (IPN) do Mercado Pago sobre pagamentos e assinaturas.

## Ordem de Implementacao

1. Solicitar o secret `MERCADOPAGO_ACCESS_TOKEN`
2. Criar tabela `subscriptions` via migracao
3. Criar Edge Function `mercadopago-webhook`
4. Reescrever `create-checkout` para Mercado Pago
5. Reescrever `check-subscription` para consultar tabela local
6. Reescrever `update-subscription` para Mercado Pago
7. Simplificar `customer-portal`
8. Reescrever `calculate-mrr`, `calculate-daily-revenue`, `count-paying-users`, `subscription-growth` para usar tabela local
9. Atualizar frontend (Pricing.tsx, creative-pricing.tsx)
10. Deploy e testar webhook

## Sobre Colaboradores Extras

Sim, o sistema de colaboradores extras funciona com Mercado Pago. A logica sera:
- O valor da assinatura = preco do plano + (quantidade de extras * R$25)
- Ao adicionar colaboradores, a Edge Function atualiza o valor do `preapproval` no Mercado Pago via API
- Exemplo: Pro + 3 extras = R$197,99 + R$75 = R$272,99/mes

