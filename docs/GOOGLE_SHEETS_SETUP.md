# Setup do Google Sheets — Service Account

A integração de sincronização Google Sheets usa uma única **Service Account** do projeto Kairoz. Os usuários compartilham suas planilhas com o email da SA — sem OAuth, sem login Google, sem app verification.

Este documento descreve o setup one-time. Após isso, qualquer organização do CRM pode conectar planilhas livremente.

## 1. Criar a Service Account

1. Acesse https://console.cloud.google.com/iam-admin/serviceaccounts no projeto Google Cloud que já hospeda as credenciais do Calendar (mesmo projeto).
2. Clique em **+ CREATE SERVICE ACCOUNT**.
3. Preencha:
   - **Service account name:** `kairoz-sheets-sync`
   - **Service account ID:** `kairoz-sheets-sync` (preenchido automaticamente)
   - **Description:** `Sincronização de planilhas para o CRM Kairoz`
4. Clique em **CREATE AND CONTINUE**.
5. Pule as duas próximas telas (sem roles, sem grant access). Clique em **DONE**.
6. Anote o email gerado: `kairoz-sheets-sync@<SEU-PROJECT-ID>.iam.gserviceaccount.com`.

## 2. Gerar a chave privada (JSON)

1. Na lista de Service Accounts, clique em `kairoz-sheets-sync@...`.
2. Aba **KEYS** → **ADD KEY** → **Create new key**.
3. Escolha **JSON** → **CREATE**.
4. Salve o arquivo `.json` baixado em local seguro. Esta é a única vez que a private key é exibida.

## 3. Habilitar a Sheets API

1. Acesse https://console.cloud.google.com/apis/library/sheets.googleapis.com no mesmo projeto.
2. Se não estiver ativada, clique em **ENABLE**.

(Drive API NÃO é necessária neste fluxo — a SA acessa apenas as planilhas explicitamente compartilhadas com ela.)

## 4. Configurar secrets no Supabase

A partir do diretório do projeto:

```bash
SA_EMAIL=$(jq -r .client_email caminho/para/sa-key.json)
SA_PRIVATE_KEY=$(jq -r .private_key caminho/para/sa-key.json)

npx supabase secrets set GOOGLE_SA_EMAIL="$SA_EMAIL" --project-ref uxttihjsxfowursjyult
npx supabase secrets set GOOGLE_SA_PRIVATE_KEY="$SA_PRIVATE_KEY" --project-ref uxttihjsxfowursjyult

# Remover secret antigo do fluxo OAuth (se existir)
npx supabase secrets unset GOOGLE_SHEETS_ENCRYPTION_KEY --project-ref uxttihjsxfowursjyult
```

Sem `jq`? Use Node:

```bash
SA_EMAIL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('caminho/para/sa-key.json','utf8')).client_email)")
SA_PRIVATE_KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('caminho/para/sa-key.json','utf8')).private_key)")
```

Verificar:
```bash
npx supabase secrets list --project-ref uxttihjsxfowursjyult | grep GOOGLE_SA
```

## 5. Configurar `.env.local`

Adicionar ao `.env.local` do frontend (não commitar):

```
VITE_GOOGLE_SA_EMAIL=kairoz-sheets-sync@<SEU-PROJECT-ID>.iam.gserviceaccount.com
```

## 6. Pronto — fluxo do usuário final

1. Abra `http://localhost:8080/integrations` (ou produção).
2. Card verde **Google Sheets** → **Gerenciar**.
3. O CRM mostra o email da SA com botão **Copiar**.
4. No Google Sheets, abra a planilha → **Compartilhar** → cole o email → escolha **Visualizador** → enviar.
5. No CRM, **Conectar planilha** → cole o link → escolha aba → mapeie colunas → salvar.
6. Novos leads aparecem em até 2 minutos.

## Recursos criados

- **3 tabelas:** `sheet_sync_configs`, `sheet_processed_rows`, `sheet_sync_logs`.
- **2 Edge Functions:** `sync-google-sheets` (cron), `sync-google-sheets-meta` (UI helper).
- **1 cron job:** `sync-google-sheets` rodando a cada 2 minutos via pg_cron + pg_net.
- **2 secrets:** `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`.

## Decisões arquiteturais

- **Single Service Account, multi-tenant.** Uma SA serve todas as organizações do Kairoz. Isolamento entre tenants é feito por `organization_id` + RLS na tabela `sheet_sync_configs`.
- **Sem persistência de tokens.** O JWT é assinado em runtime e o access_token (válido 1h) fica em cache de memória do worker. Cold-start pega ~50ms para gerar.
- **Hash de campos-chave normalizados** (telefone + email + nome). Edição de outras colunas não duplica o lead. PRIMARY KEY composta `(config_id, row_hash)` em `sheet_processed_rows` garante idempotência sob retry.
- **Cap por sync:** 6 configs/tick × 1 read/config a cada 2 min = ~3 reads/min, dentro da quota Sheets API de 300/min/projeto.
- **Atribuição configurável** por planilha: "quem conectou" (default), "roleta de leads" ou "coluna específica da planilha".
- **Locale BR:** parsers para telefone, moeda (`R$ 1.234,56`) e data (`01/05/2026`).
- **Circuit breaker:** após 3 erros consecutivos, a config é desativada automaticamente.

## Onde olhar se algo der errado

- **Logs do cron:** Supabase Dashboard → Database → Cron Jobs → `sync-google-sheets`.
- **Logs por config:** o próprio CRM mostra histórico de sincronização (botão de alerta no card da planilha).
- **Logs da Edge Function:** Supabase Dashboard → Functions → `sync-google-sheets` → Logs.

## Erros comuns

| Sintoma | Causa | Resolução |
|---|---|---|
| `Sem permissão. Confirme que a planilha foi compartilhada...` | Usuário não compartilhou a planilha com o email da SA | Compartilhar com permissão de Visualização |
| `Falha ao obter token SA: 401 invalid_grant` | Private key incorreta no secret | Re-extrair do JSON original e re-aplicar `npx supabase secrets set` |
| `GOOGLE_SA_EMAIL não configurado` | Secret ausente | Aplicar Step 4 deste documento |
| `Sheets API 429` | Quota excedida (300 reads/min/projeto) | Esperar 1 min; em escala, reduzir cap por config ou subir intervalo |

## Rollback completo

```bash
# Apagar cron e tabelas
npx supabase db query --linked <<EOF
SELECT cron.unschedule('sync-google-sheets');
DROP TABLE IF EXISTS public.sheet_sync_logs CASCADE;
DROP TABLE IF EXISTS public.sheet_processed_rows CASCADE;
DROP TABLE IF EXISTS public.sheet_sync_configs CASCADE;
EOF

# Apagar Edge Functions
npx supabase functions delete sync-google-sheets --project-ref uxttihjsxfowursjyult
npx supabase functions delete sync-google-sheets-meta --project-ref uxttihjsxfowursjyult

# Apagar secrets
npx supabase secrets unset GOOGLE_SA_EMAIL --project-ref uxttihjsxfowursjyult
npx supabase secrets unset GOOGLE_SA_PRIVATE_KEY --project-ref uxttihjsxfowursjyult
```

Calendar continua intacto.
