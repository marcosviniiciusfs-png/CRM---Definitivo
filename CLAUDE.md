@.clauderules

# CRM Definitivo

## Contexto do projeto
Aplicação Vite/React com Supabase, Edge Functions e integrações de CRM. Consulte `README.md` e `DOCUMENTATION.md` para a visão geral; para alterações de banco, leia `MIGRATIONS_INDEX.md` e as migrations existentes. Configurações de Google Calendar estão em `GOOGLE_CALENDAR_SETUP.md`.

## Comandos
Use os scripts existentes em `package.json`: `npm run dev`, `npm run check` e `npm run preview`. Prefira `npm run check` para a validação integrada quando a tarefa pedir verificação.

## Alterações
- Confira `git status --short` e preserve alterações locais.
- Mantenha as Edge Functions e o frontend alinhados aos contratos e migrations atuais.
- Use `.env.example` como referência; nunca leia, imprima ou versione credenciais locais.
