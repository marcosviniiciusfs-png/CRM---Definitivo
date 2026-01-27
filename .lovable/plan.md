

# Corrigir Erro "invalid_client: Unauthorized" no Google Calendar

## Diagnóstico

Os logs da edge function mostram claramente o problema:

```
❌ Erro ao trocar código: {
  "error": "invalid_client",
  "error_description": "Unauthorized"
}
```

Este erro significa que o **GOOGLE_CLIENT_SECRET** configurado no backend **não corresponde** ao **GOOGLE_CLIENT_ID** que você forneceu.

### Por que o erro acontece?

O fluxo OAuth funciona assim:
1. Usuario seleciona conta Google (funciona - CLIENT_ID correto)
2. Google redireciona de volta com codigo de autorizacao (funciona)
3. Edge function tenta trocar codigo por tokens usando CLIENT_ID + CLIENT_SECRET
4. Google retorna "invalid_client" porque o SECRET nao corresponde ao ID

## Causa Provavel

Voce atualizou o **GOOGLE_CLIENT_ID** para o valor correto (`543944011390-...`), mas o **GOOGLE_CLIENT_SECRET** ainda e do projeto/credencial anterior.

Cada Client ID tem seu proprio Client Secret. Eles sao um par e devem vir da mesma credencial OAuth no Google Cloud Console.

## Solucao

### Passo 1: Obter o Client Secret Correto

1. Acesse [Google Cloud Console - Credenciais](https://console.cloud.google.com/apis/credentials)
2. Clique no OAuth Client que tem o ID `543944011390-32bc853m6jc08jjn25jmf9c98b0qbh2r.apps.googleusercontent.com`
3. Copie o **Segredo do cliente** (Client Secret)

**IMPORTANTE:** O segredo deve vir da **mesma credencial** onde voce copiou o Client ID!

### Passo 2: Atualizar o Secret no Backend

Apos aprovar este plano, vou solicitar que voce insira o **GOOGLE_CLIENT_SECRET** correto.

### Passo 3: Testar Novamente

1. Va em **Configuracoes → Integracoes**
2. Clique em **Google Calendar → Conectar**
3. Selecione sua conta Google
4. Deve funcionar!

## Checklist de Verificacao

| Componente | Status | Acao |
|------------|--------|------|
| GOOGLE_CLIENT_ID | Correto | Nenhuma |
| GOOGLE_CLIENT_SECRET | **INCORRETO** | Atualizar com o segredo correspondente ao Client ID |
| URI de Redirect | Correto | Nenhuma |
| Origens JavaScript | Correto | Nenhuma |

## Secao Tecnica

O codigo da edge function `google-calendar-oauth-callback` faz a troca de codigo por tokens na linha 96-108:

```typescript
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    code,
    client_id: googleClientId,       // GOOGLE_CLIENT_ID do backend
    client_secret: googleClientSecret, // GOOGLE_CLIENT_SECRET do backend - ESTE ESTA ERRADO
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }),
});
```

O Google valida que `client_id` e `client_secret` formam um par valido. Como o secret atual nao corresponde ao ID, retorna `invalid_client`.

