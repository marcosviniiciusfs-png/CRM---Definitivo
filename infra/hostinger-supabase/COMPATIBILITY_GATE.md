# Gate de compatibilidade: Supabase gerenciado -> self-hosted

[Visão geral](README.md) · [Runbook](RUNBOOK.md) · [Acessos e decisões](ACCESS_CHECKLIST.md)

Inventário observado em 2026-08-29, sempre limitado ao projeto do CRM `uxttihjsxfowursjyult`:

| Componente | Origem gerenciada | Destino oficial pinado |
|---|---:|---:|
| PostgreSQL | 17.6.1.113 | 17.6.1.136 |
| Auth / GoTrue | v2.195.0 | v2.189.0 |
| Storage API | v1.71.0 | v1.60.4 |
| Release self-hosted | n/a | `self-hosted/v0.8.0` |

`self-hosted/v0.8.0` era o maior tag oficial `self-hosted/v*` publicado no
repositório Supabase na data do inventário. As imagens desse release são
testadas em conjunto. Não substituir Auth ou Storage isoladamente: a própria
documentação oficial informa que combinações individuais não têm garantia de
compatibilidade.

## Por que o restore fica bloqueado até o ensaio

O PostgreSQL principal está alinhado no major 17, mas Auth e Storage da
plataforma estão à frente do release self-hosted. O dump pode, portanto, conter
tabelas ou colunas ainda ausentes no destino. Exemplos documentados pela
Supabase incluem `auth.oauth_clients`, `storage.buckets_vectors`,
`storage.vector_indexes` e colunas novas em `auth.flow_state`.

O script `04-restore-target.sh` inicializa apenas o banco, Auth e Storage de um
green limpo e executa `check-service-copy-compatibility.py` antes do marcador de
restore. O gate:

- lê somente cabeçalhos `COPY` de `auth` e `storage`;
- compara tabelas e colunas com o catálogo real do destino;
- registra apenas nomes estruturais e contagens, nunca o conteúdo das linhas;
- grava `/opt/crm-supabase/.crm-compatibility-report` com modo `0600`;
- bloqueia também divergências em blocos vazios, para exigir decisão explícita;
- não altera a origem.

Esse teste estrutural é necessário, mas não substitui o restore completo de
ensaio. Tipos, extensões, funções e comportamento dos serviços ainda precisam
passar pelo ensaio e pelos smoke tests.

## Backport controlado do Storage até a migration 64

A imagem pinada `supabase/storage-api:v1.60.4` inicializa o schema somente até
a migration 60, enquanto a origem observada está na 64. O restore aplica, antes
dos dados, as migrations oficiais 61, 62, 63 e 64 copiadas byte a byte do tag
`supabase/storage@v1.70.7` (commit
`2a7e36f5cd0aa55949df8d6b73cc7695a57f6766`). Não há upgrade isolado da
imagem durante o corte.

O `04-restore-target.sh`:

- valida o SHA-256 dos quatro arquivos oficiais antes de tocar o catálogo;
- exige a migration 60 como baseline e recusa schema acima da 64;
- executa Auth + 61-64 + validações numa única transação;
- registra em `storage.migrations` os hashes calculados conforme
  `postgres-migrations` 5.3.0, permitindo um upgrade futuro validar o histórico;
- testa catálogo, nomes relativos da busca e normalização dos parâmetros que
  fecham a injeção SQL de `storage.search_by_timestamp`;
- remove os dados sintetizados de teste com savepoint antes do commit.

O lote é idempotente e qualquer falha causa rollback automático. A reversão
após um commit bem-sucedido é recriar o green a partir do snapshot limpo; não
se faz downgrade manual do schema reservado `storage`.

## Critérios para liberar o restore final

1. Usar um green descartável criado a partir do snapshot limpo da VPS.
2. Confirmar hashes do dump e passar pelo gate estrutural.
3. Executar o restore completo transacional com `ON_ERROR_STOP`.
4. Validar Auth, RLS/PostgREST, Realtime, Storage e as 96 Edge Functions.
5. Confirmar que `chat-media` existe vazio no destino e que nenhum objeto
   histórico foi copiado.
6. Medir duração e registrar qualquer transformação aplicada ao dump.
7. Descartar o banco ensaiado e restaurar o snapshot green limpo antes do corte.

## Se o gate bloquear

- Não comentar blocos `COPY` automaticamente.
- Não ignorar bloco com linhas sem demonstrar como os dados serão preservados.
- Preferir um release oficial conjunto que contenha os schemas necessários.
- Se a divergência for de recurso não utilizado e o bloco estiver vazio,
  documentar a exceção e testá-la somente no green de ensaio.
- Se houver dados ou colunas novas, aplicar apenas migração compatível baseada
  nas migrations oficiais do serviço e repetir o ensaio do zero.

## Fontes oficiais

- [Restore da plataforma para self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Supabase self-hosted com Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Atualização do self-hosted](https://supabase.com/docs/guides/self-hosting/updating)
- [Self-hosted com PostgreSQL 17](https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17)
- [Migrations oficiais do Storage no tag v1.70.7](https://github.com/supabase/storage/tree/2a7e36f5cd0aa55949df8d6b73cc7695a57f6766/migrations/tenant)
