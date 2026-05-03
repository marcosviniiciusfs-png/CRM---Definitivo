# Spec — Sincronização Google Sheets via Service Account

**Data:** 2026-05-03
**Status:** Aprovado, aguardando implementation plan
**Substitui:** Fase 2 com OAuth-por-usuário (descartada — Google bloqueava com erro `app não concluiu verificação`)

## Problema

A Fase 2 atual exige que cada usuário do CRM conecte a própria conta Google via OAuth. Isso gera dois bloqueadores graves:

1. **Erro `Acesso bloqueado: app não concluiu o processo de verificação do Google`** — o OAuth Client está em modo Testing. Para sair, o app precisa passar pelo OAuth Verification do Google (privacy policy pública, homepage pública, demonstração em vídeo, semanas/meses de fila). Inviável no curto prazo.
2. **Fricção alta no usuário-alvo** — corretores não-técnicos travam no fluxo de OAuth, principalmente com a tela de "app não verificado".

O usuário pediu explicitamente um fluxo onde "o CRM teria sempre acesso à planilha através de um email" — ou seja, identidade de serviço fixa do CRM, não credencial do usuário final.

## Solução: Service Account

Substituir o OAuth-por-usuário por **uma única Google Service Account** do projeto Kairoz. A Service Account é uma identidade própria do Google (não é uma conta humana e não exige consent screen ou app verification). Ela tem um email no formato `<nome>@<projeto>.iam.gserviceaccount.com` e é autorizada via JWT assinado com sua private key RS256.

**Fluxo do usuário final:**

1. No CRM, abrir Integrações → Google Sheets.
2. Card no topo mostra o email da Service Account com botão "Copiar".
3. No Google Sheets, compartilhar a planilha com esse email (apenas Visualização).
4. Voltar ao CRM, clicar em **Conectar planilha**.
5. Colar o link da planilha.
6. CRM valida que tem acesso (via Sheets API).
7. Escolher aba e linha do cabeçalho.
8. Mapear colunas para campos de lead.
9. Salvar — sincronização ativa, novos leads aparecem em até 2 min.

Sem OAuth. Sem tela de consent. Sem verificação Google.

## Escopo

### Em escopo

- Apagar fluxo OAuth atual (tabelas, Edge Functions, secret de criptografia, registros de UI).
- Criar autenticação via Service Account em `sync-google-sheets` e `sync-google-sheets-meta`.
- Refatorar UI (`GoogleSheetsConnection.tsx`, `ConnectGoogleSheetDialog.tsx`) para o novo fluxo.
- Documentar setup do Google Cloud (criação da Service Account, ativação da API, configuração de secrets).
- Manter intactas: `sheet_sync_configs` (com `integration_id` removido), `sheet_processed_rows`, `sheet_sync_logs`, parser BR, cron pg_cron, atribuição configurável, idempotência por hash.

### Fora de escopo

- Auto-discover via Drive API (listar planilhas que a SA tem acesso). Pode entrar em iteração futura se virar dor.
- Multi-tenancy de Service Accounts (uma SA por organização). Hoje uma SA serve todos os tenants — separação fica em `sheet_sync_configs.organization_id` + RLS.
- Migração de configs existentes do fluxo OAuth — não há configs reais em produção (OAuth nunca funcionou).
- Suporte a Excel via OneDrive — continua fora.

## Arquitetura

### Identidade Google

Uma Service Account única por ambiente Kairoz, criada no Google Cloud Console do projeto que já hospeda as credenciais do Calendar. Recomendado:

- **Nome:** `kairoz-sheets-sync`
- **Email gerado:** `kairoz-sheets-sync@<project-id>.iam.gserviceaccount.com`
- **Chave:** JSON exportada uma vez, com private key RS256.
- **Roles necessárias:** nenhuma no GCP (a SA só usa Sheets API; o acesso por planilha é dado pelo compartilhamento).
- **APIs a habilitar:** Google Sheets API v4. (Drive API NÃO é necessária no fluxo manual escolhido.)

### Schema do banco

**Migration nova** (`20260503120000_google_sheets_service_account.sql`):

```sql
-- 1. Apagar tabelas do fluxo OAuth (não há dados em produção)
DROP TABLE IF EXISTS public.google_sheets_tokens CASCADE;
DROP TABLE IF EXISTS public.google_sheets_integrations CASCADE;

-- 2. Remover integration_id de sheet_sync_configs
ALTER TABLE public.sheet_sync_configs
  DROP CONSTRAINT IF EXISTS sheet_sync_configs_integration_id_fkey,
  DROP COLUMN IF EXISTS integration_id;
```

`sheet_processed_rows` e `sheet_sync_logs` permanecem como estão.

### Edge Functions

**Apagar do projeto Supabase:**
- `google-sheets-oauth-initiate`
- `google-sheets-oauth-callback`

**Reescrever para usar SA:**
- `sync-google-sheets`
- `sync-google-sheets-meta`

**Helper compartilhado** — extraído como módulo Deno reutilizável dentro de cada função (Deno não suporta cross-function imports trivialmente, então o helper é duplicado em ambos `index.ts`):

```ts
// getServiceAccountAccessToken()
// 1. Constrói JWT com claims:
//    iss = SA_EMAIL
//    scope = "https://www.googleapis.com/auth/spreadsheets.readonly"
//    aud = "https://oauth2.googleapis.com/token"
//    iat = now(), exp = now() + 3600
// 2. Assina com RS256 usando crypto.subtle.importKey + sign
// 3. POST oauth2.googleapis.com/token com grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
// 4. Retorna access_token (válido por 1h)
// 5. Cache em memória do worker com TTL 50min
```

A private key vem em formato PEM (cabeçalho `-----BEGIN PRIVATE KEY-----`). O helper converte PEM→DER→CryptoKey via `crypto.subtle.importKey('pkcs8', ...)`.

**Resto da lógica de `sync-google-sheets`** (loop de configs, hash, INSERT idempotente, parser BR, distribuição) **permanece idêntica**. A única mudança é a fonte do access_token.

### Secrets do Supabase

**Adicionar:**
- `GOOGLE_SA_EMAIL` — string `kairoz-sheets-sync@<project>.iam.gserviceaccount.com`
- `GOOGLE_SA_PRIVATE_KEY` — string com a private key PEM completa, incluindo `-----BEGIN PRIVATE KEY-----` e quebras de linha (escape `\n` se passado via flag CLI)

**Remover:**
- `GOOGLE_SHEETS_ENCRYPTION_KEY` (não usa mais — SA não persiste tokens)

**Não tocar:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ENCRYPTION_KEY` — seguem servindo o fluxo do Google Calendar, que continua igual.

### Frontend

**`src/components/GoogleSheetsConnection.tsx`** — refatoração:

- Remover estados `integration`, `connecting`, `handleConnect`, `handleDisconnect`.
- Remover lógica de detectar `?integration=google_sheets&success=...` no querystring (não há mais redirect OAuth).
- Adicionar card no topo com:
  - Email da SA (vem de `import.meta.env.VITE_GOOGLE_SA_EMAIL` exposto via `.env.local`, OU vem de uma chamada a uma Edge Function pública que retorna apenas o email — preferir o ENV pra evitar round-trip).
  - Botão "Copiar email" (Clipboard API).
  - Texto explicativo: "Compartilhe sua planilha com este email (Visualização). Sem isso, a sincronização não funciona."
- Lista de planilhas conectadas (`sheet_sync_configs`) — igual hoje, sem mudança.
- Botão "Conectar planilha" — abre `ConnectGoogleSheetDialog`.

**`src/components/ConnectGoogleSheetDialog.tsx`** — ajustes na etapa 1:

- Banner persistente acima do campo de link: "Antes de continuar, compartilhe a planilha com `<email-da-SA>` (Visualização)."
- Manter o input de link e parsing.
- Botão "Validar acesso" chama `sync-google-sheets-meta` (já existe, será reescrito para usar SA).
- Tratamento de erro:
  - **403** ou erro contendo "permission" → modal com instrução clara: "A planilha não está compartilhada com `<email-da-SA>`. Verifique e tente novamente." + botão de copiar email.
  - **404** → "Planilha não encontrada — confira o link."
  - Outros erros → mensagem genérica do servidor.

Etapas 2 e 3 (escolher aba, mapear, escolher funil) ficam idênticas.

**Remover** componentes/arquivos órfãos:
- Não há nenhum (o `GoogleSheetsModal` continua, só envolve o `GoogleSheetsConnection` reformado).

**`src/pages/Integrations.tsx`** — ajustes:

- A query `google_sheets_integrations` desaparece (tabela apagada).
- O card `GoogleSheetsCard` passa a considerar `gsheetsActiveCount > 0` como sinal de "conectado" (em vez de existência de integração).

### Variáveis de ambiente

`.env.local` adiciona:

```
VITE_GOOGLE_SA_EMAIL=kairoz-sheets-sync@<project-id>.iam.gserviceaccount.com
```

(Apenas o email é exposto ao client; a private key fica só no Supabase.)

## Fluxo de dados

```
[Cron pg_cron */2min]
   ↓ HTTP POST
[Edge: sync-google-sheets]
   ↓ getServiceAccountAccessToken() → JWT RS256 → access_token
   ↓ SELECT sheet_sync_configs WHERE next_sync_at <= now() LIMIT 6
   ↓ Para cada config:
     ↓ GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{aba}
     ↓ Para cada linha pós-header:
       ↓ hash = sha256(telefone + email + nome_normalizado)
       ↓ INSERT sheet_processed_rows ... ON CONFLICT DO NOTHING
       ↓ Se inserido: INSERT em leads (lógica idêntica à atual em syncOneConfig)
       ↓ Se attribution_strategy = roleta: distribute-lead bulk_mode
   ↓ UPDATE next_sync_at = now() + sync_interval_minutes
   ↓ INSERT sheet_sync_logs (status, rows_*, duration)
```

## Tratamento de erros

| Cenário | Comportamento |
|---|---|
| 403 (planilha não compartilhada) | Marca config como `error_count++`, `last_error = "Sem permissão — confirme compartilhamento"`. Após 3 erros, `is_active = false` + notificação. |
| 404 (planilha apagada) | Mesma trilha, `last_error = "Planilha não encontrada"`. |
| 429 (quota Sheets API) | Retry exponencial dentro do mesmo tick (até 3 tentativas, 1s/2s/4s). Se ainda falhar, marca erro e o cron tenta no próximo tick. |
| Cabeçalho renomeado | Já tratado no código atual via `findColumnIndex` que tenta nome do header e fallback por índice. Se ambos falharem para `nome_lead` ou `telefone_lead`, marca erro com mensagem clara. |
| JWT signing falhou (private key inválida) | Erro 500 fatal, log no Supabase. Operador precisa reconfigurar `GOOGLE_SA_PRIVATE_KEY`. |
| Token cache stale | TTL de 50min é defensivo (Google emite tokens de 60min). Se chegar 401, força refresh do cache. |

## Quota e SLA

Sem mudança vs design anterior:

- Sheets API: 300 reads/min/projeto. Cap de 6 configs/tick a cada 2 min = ~3 reads/min. Folga ampla.
- SLA de latência mantido: novos leads em ≤ 2-3 min.
- Service Account não tem quota separada; consome do mesmo bucket do projeto.

## Segurança

- Private key da SA só vive em Supabase Secrets, nunca em código ou variável de ambiente do client.
- O email da SA é público por design (precisa ser, para o usuário compartilhar a planilha com ele).
- RLS em `sheet_sync_configs`, `sheet_processed_rows`, `sheet_sync_logs` continua igual: leitura/escrita só por membros da org dona da config.
- A SA tem permissão "Visualização" em cada planilha individual (controlado pelo Google Sheets, não pelo CRM). Se um usuário do CRM remove uma config, a SA continua com acesso à planilha (mas o CRM para de ler) — o usuário pode revogar o compartilhamento no Google Sheets quando quiser.

## Setup operacional (one-time)

Documentar em `docs/GOOGLE_SHEETS_SETUP.md` (substituindo o conteúdo atual):

1. **Google Cloud Console**
   - Acessar https://console.cloud.google.com/iam-admin/serviceaccounts
   - Criar Service Account `kairoz-sheets-sync`
   - Em "Keys" → "Add key" → "JSON" → baixar o arquivo
   - Em https://console.cloud.google.com/apis/library → habilitar **Google Sheets API**

2. **Supabase secrets**
   - `npx supabase secrets set GOOGLE_SA_EMAIL=...`
   - `npx supabase secrets set GOOGLE_SA_PRIVATE_KEY="$(cat sa-key.json | jq -r .private_key)"`
   - `npx supabase secrets unset GOOGLE_SHEETS_ENCRYPTION_KEY`

3. **`.env.local` do frontend**
   - Adicionar `VITE_GOOGLE_SA_EMAIL=kairoz-sheets-sync@...`

4. **Apagar Edge Functions OAuth no dashboard**
   - `google-sheets-oauth-initiate`
   - `google-sheets-oauth-callback`

5. **Aplicar migration nova** via `npx supabase db push`.

6. **Re-deploy de `sync-google-sheets` e `sync-google-sheets-meta`** com a versão SA.

## Plano de rollback

Como nada está em produção, rollback é simétrico ao setup:

- `DROP` das tabelas Sheets, `cron.unschedule('sync-google-sheets')`, deletar todas as Edge Functions Sheets, remover secrets `GOOGLE_SA_*`.
- Calendar continua funcionando (não foi tocado).

## Testes manuais (smoke)

1. Configurar SA + secrets + .env como descrito.
2. Compartilhar uma planilha de teste com 2 linhas (Nome, Telefone, Email) com o email da SA.
3. Em http://localhost:8080/integrations → Google Sheets → Conectar planilha.
4. Verificar erro claro se NÃO compartilhada antes de tentar.
5. Validar com link da planilha compartilhada → preview deve aparecer.
6. Mapear colunas, salvar.
7. Aguardar até 2 min — leads aparecem em /pipeline.
8. Adicionar uma 3ª linha na planilha → em até 2 min vira lead novo.
9. Editar telefone de lead existente na planilha → não deve duplicar (hash mudaria, mas dedupe cross-source por `telefone_lead` na tabela leads pega).
10. Apagar config → log deve mostrar "config inativa" no próximo tick.

## Decisões deliberadas (registro)

- **Uma SA, todos tenants.** Multi-SA por organização adicionaria operação manual no GCP por cliente novo. Single-SA + RLS resolve isolamento de dados entre orgs.
- **Sem Drive API.** O fluxo manual de "cole o link" dispensa listar arquivos. Drive API exigiria scope adicional e abriria mais superfície.
- **Token cache em memória do worker, não em DB.** Edge Function workers reciclam frequentemente; cache em memória vive ~minutos a horas. DB cache adicionaria complexidade sem ganho relevante (token de SA é barato de gerar — ~50ms).
- **Email da SA exposto ao client via `VITE_*`.** Email de SA é público por design; expor não é vazamento. Alternativa (chamar Edge Function pra buscar) adiciona latência sem ganho de segurança.
- **Apagar OAuth do dia 1, não deprecated.** Reduz dívida técnica e código morto. Como nunca funcionou em prod, não há blast radius.
