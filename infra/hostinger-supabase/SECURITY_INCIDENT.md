# Contenção de credenciais antes da migração

## Estado confirmado

- O repositório remoto está público.
- Arquivos com credenciais reais existiram no histórico desde, no mínimo, 10/03/2026.
- O histórico incluiu chaves de banco/Supabase, integrações, credenciais de usuário e material da Vercel.
- Uma variável secreta foi prefixada com `VITE_`; ela deve ser considerada publicada no bundle do navegador e em artefatos de build.
- Os valores não são reproduzidos neste documento.

Toda credencial encontrada no histórico deve ser tratada como comprometida. Apagar o arquivo do branch atual ou tornar o repositório privado não revoga cópias, caches ou clones existentes.

## Contenção imediata

1. Tornar o repositório privado para impedir novas leituras anônimas.
2. Manter `.claude/settings.local.json`, `.env*`, arquivos de secrets e artefatos de migração fora do Git.
3. Remover a credencial secreta do namespace `VITE_*` e do código cliente.
4. Preparar todos os valores substitutos antes da rotação coordenada, para reduzir indisponibilidade.
5. Revisar logs desde 10/03/2026 no Supabase, Vercel, Evolution, Meta, Google e Mercado Pago.

## Ordem de rotação coordenada

1. Senhas de usuários expostas; revogar sessões relacionadas.
2. Senha direta do PostgreSQL e tokens pessoais/de CLI.
3. Evolution API key e webhook secret.
4. Meta/Facebook app secret e verify token.
5. Google OAuth client secret.
6. Mercado Pago access token e webhook secret.
7. Resend/SMTP e outros provedores encontrados no inventário real.
8. Tokens da Vercel e variáveis de ambiente comprometidas.
9. Supabase JWT signing material, chaves `anon`/`service_role` e sessões, com atualização atômica do frontend, funções e jobs.

### Convex proxy

- A implementação remota legada continha material semelhante a credencial na
  URL do webhook e uma credencial de autorização no código-fonte.
- Nenhum desses valores foi copiado para o repositório. O proxy local aceita
  somente `CONVEX_WEBHOOK_URL` e `CONVEX_WEBHOOK_TOKEN` via ambiente.
- Ambos os valores legados devem ser revogados/rotacionados antes de habilitar
  o proxy no destino. Não reutilizar o segmento antigo da URL nem o token
  antigo, mesmo que o repositório seja tornado privado.
- A URL substituta deve usar HTTPS e não pode conter credenciais HTTP
  `user:password@`. O arquivo de exemplo contém apenas placeholders.

A rotação do signing material do Supabase pode invalidar sessões e chaves derivadas. Ela deve ser ensaiada e executada junto com a atualização das variáveis e um redeploy da Vercel.

## Destino Hostinger

- Gerar novos secrets pelo procedimento oficial da versão self-hosted fixada.
- Nunca copiar JWT signing secret, `anon`, `service_role`, senha de banco ou secrets de integrações que vazaram.
- Preservar `META_TOKEN_ENCRYPTION_KEY` somente se a varredura completa provar que ela não apareceu no histórico. Se tiver vazado, reconectar o Facebook para recriptografar os tokens. `GOOGLE_CALENDAR_ENCRYPTION_KEY` fica restrita ao Google, salvo fallback temporário durante a rotação Meta.
- Aplicar a mesma regra a `GOOGLE_SHEETS_ENCRYPTION_KEY`: preservar somente
  se não tiver vazado; caso contrário, reautorizar as integrações Sheets e
  substituir os tokens criptografados.
- Não executar migrations históricas de bootstrap de administradores; o destino nasce do dump real do banco.
- Manter `.env`, `functions.env`, `backup.env` e `migration.env` com modo `0600` no servidor.

## Limpeza do histórico

Executar somente depois das rotações:

1. Inventariar todos os caminhos e padrões comprometidos em todos os refs.
2. Criar um backup administrativo do repositório remoto.
3. Reescrever o histórico com `git filter-repo` ou ferramenta equivalente.
4. Force-push coordenado de branches e tags.
5. Invalidar caches/artefatos e orientar todos os colaboradores a reclonar.
6. Fazer nova varredura de secrets no histórico reescrito e no build publicado.

Essa operação altera hashes de commits e não será feita automaticamente pelo kit de migração.
