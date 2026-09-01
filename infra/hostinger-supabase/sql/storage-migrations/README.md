# Backport oficial do Supabase Storage 61-64

Estes quatro arquivos sao copias byte a byte das migrations oficiais do
`supabase/storage` no tag `v1.70.7`, commit
`2a7e36f5cd0aa55949df8d6b73cc7695a57f6766`. Esse e o primeiro release
oficial que contem a migration 64 e nao inclui migrations posteriores.

Fontes fixadas:

- <https://github.com/supabase/storage/tree/2a7e36f5cd0aa55949df8d6b73cc7695a57f6766/migrations/tenant>
- `0061-mark-filename-immutable.sql`
- `0062-object-versioning-core.sql`
- `0063-fix-search-name-relative-to-prefix.sql`
- `0064-fix-search-by-timestamp-sqli.sql`

Os testes tambem recalculam os Git blob IDs oficiais (`473f19ac...`,
`76cf3f7f...`, `11c38a58...` e `e3689e05...`), alem do manifesto SHA-256.

Nao edite esses SQLs. `04-restore-target.sh` valida `SHA256SUMS`, executa-os em
ordem dentro de uma unica transacao junto com os guards locais e so entao
registra os hashes nativos do `postgres-migrations` em `storage.migrations`.

Uma falha antes do `COMMIT` desfaz todo o lote. Depois do `COMMIT`, o rollback
suportado para este green descartavel e recria-lo a partir do snapshot limpo e
repetir o restore; nao aplique uma migration reversa artesanal no schema
reservado `storage`.
