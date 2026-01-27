
## Diagnóstico (o que está acontecendo e por quê)

### Sintoma
Ao clicar em **Conectar Google Calendar** você vai para a tela do Google para escolher a conta e aparece erro (normalmente “invalid_client”).

### Causa real (confirmada)
O CRM não está usando o **Client ID real** do Google. A função do backend que monta o link de login do Google está enviando:

- `client_id=PLACEHOLDER_VALUE_TO_BE_REPLACED`

Isso faz o Google rejeitar imediatamente com **invalid_client**.

### Por que isso acontece mesmo você “colocando no SQL”
Porque **essas credenciais não podem ficar no banco (SQL)** e **o CRM não lê do banco** para isso.

O fluxo é assim:

1) Frontend (CRM) chama uma função do backend: `google-calendar-oauth-initiate`  
2) Essa função precisa ler as credenciais **de variáveis secretas do backend** (secrets):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
3) Como hoje essas secrets estão com valor “PLACEHOLDER…”, a URL do Google sai inválida.

Ou seja: **colocar ID/secret no banco não muda nada** para essa integração, e ainda é inseguro.

---

## Objetivo da correção
Trocar os valores “PLACEHOLDER” pelos valores reais do (a) **Client ID OAuth 2.0** e (b) **Client Secret OAuth 2.0** no local correto: **Secrets do Backend (Lovable Cloud)**.

---

## Passo a passo (bem preciso)

### Parte 1 — Pegar os valores corretos no Google Cloud
Você precisa ter um **OAuth Client ID (Aplicativo Web)**. Não é “API Key” e não é “Calendar ID”.

No Google Cloud Console:
1. Vá em **APIs e serviços → Biblioteca**
2. Ative **Google Calendar API**
3. Vá em **APIs e serviços → Tela de consentimento OAuth**
   - Tipo: **Externo** (ou Interno, se for Workspace)
   - Adicione os escopos (pelo menos):
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `openid`
     - `https://www.googleapis.com/auth/calendar`
   - Se estiver em “Teste”, adicione seu e-mail em **Usuários de teste**
4. Vá em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**
   - Tipo: **Aplicativo da Web**
   - Você vai obter:
     - **ID do cliente** (termina com `apps.googleusercontent.com`)
     - **Segredo do cliente**

Guarde exatamente esses 2 valores.

---

### Parte 2 — Colocar os valores no lugar certo (Secrets do Backend)
Você deve atualizar as secrets do backend, NÃO o banco SQL.

#### Desktop (computador)
1. No editor do seu projeto, clique em **View Backend / Backend**
   - Normalmente fica na barra superior (ícones de “Cloud/Backend”)
2. Procure uma seção chamada **Secrets** ou **Environment Variables**
3. Encontre estas chaves (já existem no seu projeto):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
4. Clique para **editar** cada uma e cole os valores corretos do Google Cloud:
   - `GOOGLE_CLIENT_ID` = o “ID do cliente” (ex: `xxxxx.apps.googleusercontent.com`)
   - `GOOGLE_CLIENT_SECRET` = o “Segredo do cliente” (string curta)
5. Salve

#### Mobile (celular)
1. Abra o menu **…** (canto inferior direito) no modo Chat
2. Entre em **Backend / Cloud**
3. Procure **Secrets / Variáveis**
4. Edite:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
5. Salve

#### Atenções importantíssimas ao colar
- Não coloque aspas (`" "`).
- Não coloque espaço antes/depois.
- `GOOGLE_CLIENT_ID` precisa terminar com **`.apps.googleusercontent.com`**.

---

### Parte 3 — Conferir a chave de criptografia (necessária para finalizar a conexão)
Existe mais uma secret envolvida depois que você escolhe a conta Google:

- `GOOGLE_CALENDAR_ENCRYPTION_KEY`

Garanta que:
- Ela existe (no seu projeto já existe)
- Ela tem um valor forte (recomendado: **32+ caracteres aleatórios**)

Se ela estiver fraca/placeholder, a conexão pode falhar no final (depois do Google), com erro de “callback”.

---

### Parte 4 — Configurar o “Redirect URI” correto no Google Cloud (muito comum errar)
No mesmo OAuth Client (Aplicativo Web), você precisa configurar o **URI de redirecionamento autorizado** apontando para o callback do seu backend.

1. No Google Cloud: **Credenciais → Seu OAuth Client**
2. Em **URIs de redirecionamento autorizados**, adicione o callback do seu backend que termina exatamente com:
   - `/functions/v1/google-calendar-oauth-callback`

Como você pega a URL completa correta sem eu te passar link técnico:
- Abra **View Backend**
- Vá em **Backend Functions / Edge Functions**
- Abra a função **google-calendar-oauth-callback**
- Copie a **URL pública** que o painel mostra
- Cole essa URL no Google Cloud em “URIs de redirecionamento autorizados”

Também ajuste **Origens JavaScript autorizadas** com:
- O endereço do site onde você abre o CRM (copie da barra do navegador)
- Se você testa no Preview, adicione também a origem do Preview

---

### Parte 5 — Testar novamente
1. Volte no CRM
2. Vá em **Configurações → Integrações → Google Calendar → Conectar**
3. Escolha a conta Google
4. Se concluir, o CRM vai marcar como **Conectado**
5. Teste criar um evento

---

## Como vamos garantir que resolveu (validação técnica)
Depois de você atualizar as secrets, eu vou:
1. Re-testar a função `google-calendar-oauth-initiate` (por trás) e confirmar que:
   - o `client_id` na URL não é mais `PLACEHOLDER...`
2. Se ainda falhar, o próximo ponto a checar será:
   - Redirect URI errado no Google Cloud
   - App em modo “Teste” sem você estar em “Usuários de teste”
   - OAuth Client criado como tipo errado (tem que ser **Web**)

---

## Melhorias de produto (para você nunca travar nisso de novo)
Além de te guiar para corrigir agora, eu vou implementar no código:
1. **Validação anti-placeholder** na função `google-calendar-oauth-initiate`:
   - Se `GOOGLE_CLIENT_ID` estiver como placeholder, retornar erro claro:
     - “Credenciais do Google não configuradas no Backend Secrets…”
2. **Mensagem amigável no UI** (tela de Integrações):
   - Mostrar “Credenciais pendentes” e abrir instruções em 1 clique (sem “invalid_client” do Google)
3. (Opcional) Botão “Diagnosticar integração” que testa:
   - se existe integração ativa para o usuário
   - se secrets estão configuradas (sem expor valores)

---

## O que eu preciso de você (para não errar o ambiente)
1) Você está tentando conectar pelo **Preview** (ambiente de teste) ou pelo **site publicado/domínio final**?  
2) Você consegue abrir o **View Backend** aí? (sim/não)

Com essas 2 respostas, eu ajusto as instruções exatamente para o seu caso (principalmente as “Origens JavaScript autorizadas” e qual URL copiar no Redirect URI).
