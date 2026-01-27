

# Corrigir Erro redirect_uri_mismatch no Google Calendar

## Diagnóstico

O erro ocorre porque a URI de callback configurada no Google Cloud Console aponta para um projeto Supabase diferente do que esta realmente rodando o app.

| Configurado no Google Cloud | Valor Correto |
|----------------------------|---------------|
| `https://uwwanpztskkhzdqifbai.supabase.co/...` | `https://qcljgteatwhhmjskhthp.supabase.co/functions/v1/google-calendar-oauth-callback` |

## Passos para Corrigir

### 1. Atualizar URI de Redirecionamento no Google Cloud

1. Acesse [Google Cloud Console - Credenciais](https://console.cloud.google.com/apis/credentials)
2. Clique no OAuth Client "Kairoz CRM"
3. Em **URIs de redirecionamento autorizados**:
   - **Remova** a URI antiga (`...uwwanpztskkhzdqifbai...`)
   - **Adicione** a URI correta:
   ```
   https://qcljgteatwhhmjskhthp.supabase.co/functions/v1/google-calendar-oauth-callback
   ```
4. Clique em **Salvar**

### 2. Adicionar Origem JavaScript Autorizada

Para seu dominio proprio funcionar, adicione em **Origens JavaScript autorizadas**:

```
https://www.kairozcrm.com.br
```

### 3. Testar Novamente

Apos salvar (pode levar ate 5 minutos para propagar):
1. Va em **Configuracoes → Integracoes**
2. Clique em **Mais Integracoes → Google Calendar**
3. Clique em **Conectar Google Calendar**

## Resumo das Configuracoes Necessarias

| Campo | Valor |
|-------|-------|
| **URIs de redirecionamento autorizados** | `https://qcljgteatwhhmjskhthp.supabase.co/functions/v1/google-calendar-oauth-callback` |
| **Origens JavaScript autorizadas** | `https://www.kairozcrm.com.br` |

## Secao Tecnica

O fluxo OAuth funciona assim:

1. Usuario clica em "Conectar Google Calendar"
2. Frontend chama edge function `google-calendar-oauth-initiate`
3. Edge function gera URL do Google com `redirect_uri=https://qcljgteatwhhmjskhthp.supabase.co/functions/v1/google-calendar-oauth-callback`
4. Usuario autoriza no Google
5. Google redireciona para a URI de callback com o codigo de autorizacao
6. Edge function `google-calendar-oauth-callback` troca o codigo por tokens
7. Usuario e redirecionado de volta ao app com sucesso

O erro acontece no passo 5: o Google verifica se a `redirect_uri` enviada corresponde a uma das URIs autorizadas. Como voce tinha a URI de outro projeto, o Google bloqueou.

