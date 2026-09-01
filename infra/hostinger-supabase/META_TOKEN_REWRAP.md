# Rewrap temporário dos tokens Meta

Este procedimento migra os ciphertexts Meta/Facebook que usam a chave atual do
Supabase gerenciado para a nova `META_TOKEN_ENCRYPTION_KEY` da VPS. Ele é
exclusivo do projeto `uxttihjsxfowursjyult` e não lê nem altera tabelas no
Supabase gerenciado: a Edge Function temporária atua somente sobre ciphertexts
enviados pelo destino.

O código deste diretório **não é implantado pelo deploy normal da VPS**. A
função temporária vive em um projeto Supabase CLI isolado sob
`managed-meta-rewrap/`, evitando incluí-la nas 96 funções de produção.

## Garantias e limites

- O endpoint aceita apenas `POST`, JSON, lotes de até 25 itens e os campos
  `encrypted_access_token` e `encrypted_page_access_token`.
- O hostname de `SUPABASE_URL` precisa corresponder exatamente ao project ref
  `uxttihjsxfowursjyult`.
- A autenticação usa um bearer hexadecimal aleatório, temporário, comparado em
  tempo constante. Ele nunca entra em argv ou logs.
- A função tenta a nova chave primeiro (idempotência), depois a chave managed
  legada. Ela devolve apenas um ciphertext novo ou um status sanitizado; nunca
  devolve ou registra plaintext.
- Para itens que o managed não lê, o helper local da VPS tenta o fallback
  histórico apenas em memória e os recriptografa imediatamente com a chave Meta.
  Nenhum token permanece sob o fallback depois do commit.
- Ciphertexts ilegíveis, plaintext acidental, `NULL` e vazio nunca são
  convertidos silenciosamente. O script do destino valida a cobertura completa
  antes de abrir a transação.
- O rehearsal anterior encontrou 102 slots não vazios: 84 sob a chave managed e
  18 sob o fallback histórico da VPS. Esses números são apenas evidência
  histórica: o corte não possui defaults e sempre recaptura o inventário do
  restore final.

## 1. Testar o código localmente

Na raiz de `CRM---Definitivo`:

```powershell
node --experimental-strip-types --test infra/hostinger-supabase/managed-meta-rewrap/supabase/functions/meta-token-rewrap/core.node.test.ts
& 'C:\Program Files\Git\bin\bash.exe' -n infra/hostinger-supabase/scripts/17-rewrap-meta-tokens.sh
```

Na VPS (ou em qualquer ambiente Python com `cryptography`), os testes do
staging/validação são executados sem conexão com banco ou rede:

```bash
python3 /opt/crm-migration-kit/scripts/rewrap-meta-token-artifacts.test.py
```

## 2. Handoff protegido dos dois secrets temporários

O helper abaixo:

1. confirma que os secrets temporários ainda não existem no managed;
2. lê `META_TOKEN_ENCRYPTION_KEY` da VPS sem mostrá-la;
3. cria `META_REWRAP_ONE_TIME_SECRET` com CSPRNG;
4. envia ambos ao projeto fixo usando um `.env` temporário com ACL exclusiva;
5. confirma os digests managed e grava o bearer com um marcador de proveniência
   (project ref + digests, nunca valores) em `/run/crm-meta-rewrap.env`,
   `root:root`/`0600`;
6. em qualquer falha após o `set`, remove e reinventaria os dois secrets antes
   de reportar o erro.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  infra/hostinger-supabase/managed-meta-rewrap/Prepare-ManagedMetaRewrap.ps1
```

O helper usa a CLI fixada em `supabase@2.116.0` e falha se o project ref, chave
SSH, chave Meta, função temporária pré-existente ou inventário de secrets não
corresponderem ao esperado. Ele nunca imprime valores. A sobrescrita do arquivo
temporário é best-effort; em SSD, a garantia principal é a ACL exclusiva e a
janela curta de existência.

## 3. Implantar somente a função temporária

Não usar `--prune` e não omitir o project ref:

```powershell
npx --yes supabase@2.116.0 functions deploy meta-token-rewrap `
  --project-ref uxttihjsxfowursjyult `
  --workdir infra/hostinger-supabase/managed-meta-rewrap `
  --no-verify-jwt `
  --use-api
```

O `verify_jwt=false` é intencional: o script da VPS não possui JWT do usuário e
o endpoint aplica seu próprio bearer one-time antes de ler chaves ou body.

## 4. Inventário obrigatório e somente leitura

Depois de sincronizar o kit local atualizado para `/opt/crm-migration-kit`, sem
iniciar as Edge Functions self-hosted, executar o oracle sem fornecer contagens:

```bash
sudo bash /opt/crm-migration-kit/scripts/17-rewrap-meta-tokens.sh --inventory
```

`--metrics-json` é um alias de `--inventory`. Em sucesso, stdout contém exatamente
uma linha tagueada, própria para o orquestrador, e nenhum ciphertext:

```text
CRM_META_REWRAP_METRICS={"nonempty":N,"meta_readable":M,"fallback_readable":F,"invalid":I}
```

O inventário não altera PostgreSQL nem grava staging persistente. O gate de
origem exige `I=0` e `M+F=N`. O orquestrador deve guardar somente essa linha
sanitizada e passar `N`, `M` e `F` explicitamente aos passos seguintes. O estado
proposto pelo dry-run precisa atingir `meta=N` e `fallback=0`.

## 5. Dry-run obrigatório na VPS

Usar exatamente as contagens recém-capturadas; a ausência de qualquer uma faz o
script falhar:

```bash
sudo bash /opt/crm-migration-kit/scripts/17-rewrap-meta-tokens.sh \
  --dry-run \
  --expected-nonempty N \
  --expected-meta-readable M \
  --expected-fallback-readable F
```

com `M + F = N`.

## 6. Aplicação transacional no destino

Durante manutenção, repetir com `--execute` e as mesmas contagens aprovadas:

```bash
sudo bash /opt/crm-migration-kit/scripts/17-rewrap-meta-tokens.sh \
  --execute \
  --expected-nonempty N \
  --expected-meta-readable M \
  --expected-fallback-readable F
```

O script:

1. captura os dois campos de cada linha em arquivos `0600` sob `/run`;
2. envia apenas ciphertexts ao endpoint em lotes;
3. recriptografa localmente os `F` valores históricos e valida que cada valor
   proposto abre somente pela chave Meta;
4. bloqueia `facebook_integration_tokens`, compara o snapshot e aplica tudo em
   uma única transação;
5. confirma dentro da transação que todos os slots equivalem ao staging;
6. recaptura o estado e valida criptograficamente `N/N` sob Meta e `0` sob o
   fallback;
7. destrói os artefatos com ciphertext e grava apenas métricas/hashes, incluindo
   os digests das duas chaves usadas, em
   `/var/lib/crm-migration/meta-token-rewrap-last-success` (`0600`).

Uma alteração concorrente, resposta incompleta, plaintext, token corrompido,
contagem inesperada ou falha de rede interrompe o processo. Antes do `COMMIT`, a
transação é revertida integralmente. A execução é idempotente: em uma repetição,
os 84 valores já migrados retornam como `already_current`.

## 7. Revogação imediata

Assim que o gate pós-commit passar, desabilitar o endpoint primeiro removendo o
bearer, depois excluir a função e a cópia temporária da chave Meta no managed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  infra/hostinger-supabase/managed-meta-rewrap/Remove-ManagedMetaRewrap.ps1
```

O helper é idempotente, usa a CLI fixada e não recebe nem imprime valores. Antes
de apagar algo, compara os digests atuais aos registrados pelo handoff; recusa
um artefato sem proveniência ou que tenha sido rotacionado por outro operador.
Depois revoga primeiro o bearer managed, exclui a função, remove somente a cópia
temporária de `META_TOKEN_ENCRYPTION_KEY`, verifica por nome que os três
artefatos sumiram e destrói `/run/crm-meta-rewrap.env` na VPS. Se uma etapa
posterior falhar, o endpoint já fica inerte e o helper pode ser repetido. A
`GOOGLE_CALENDAR_ENCRYPTION_KEY` original do managed não é alterada.

## Eliminação do fallback no destino

O commit converte tanto os tokens legíveis pelo managed quanto os tokens
históricos legíveis pelo fallback local. O marker final só é válido com
`meta_valid=N`, `fallback_valid=0`, `invalid=0` e hashes das chaves iguais aos de
`functions.env`. Depois desse gate, e como a integração Google está desativada,
`GOOGLE_CALENDAR_ENCRYPTION_KEY` pode ser removida da VPS antes de iniciar as
Functions. A chave Google original do Supabase managed não é alterada por este
procedimento e pode permanecer somente no ambiente de backup.
