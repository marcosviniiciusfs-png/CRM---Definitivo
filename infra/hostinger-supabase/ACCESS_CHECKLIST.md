# Checklist de acessos e decisões

[Visão geral](README.md) · [Runbook](RUNBOOK.md) · [Gate de compatibilidade](COMPATIBILITY_GATE.md)

O SSH do VPS, sozinho, não permite concluir esta migração. Marcar cada item antes do ensaio. Valores secretos devem ser transferidos por um cofre/arquivo criptografado e gravados apenas no servidor com modo `0600`.

## 1. Hostinger

- [x] IP público do KVM 4 confirmado.
- [ ] Datacenter/região escolhida (preferir a menor latência para os usuários no Brasil).
- [x] Ubuntu 24.04 LTS limpo, sem painel de hospedagem.
- [x] Usuário SSH com `sudo`, porta e chave pública cadastrada.
- [x] Autenticação SSH por senha mantida para `root` e `hurtz` por autorização explícita; acesso por chave permanece funcional e a senha não é registrada aqui.
- [ ] Acesso ao hPanel para firewall, snapshot e backup.
- [ ] Firewall Hostinger permite SSH, TCP 80 e TCP/UDP 443; nega o restante.
- [ ] Backup semanal confirmado; decidir se o adicional diário será habilitado.
- [ ] Autorização para criar snapshot antes de mudanças relevantes.

## 2. Supabase de origem

- [ ] Acesso Owner ao projeto de produção correto.
- [x] Project ref do CRM confirmado no Dashboard: `uxttihjsxfowursjyult`.
- [ ] Connection string direta ou session-pooler + senha do banco.
- [ ] Host exato da conexão e certificado CA do banco baixado do Dashboard; export/freeze/unfreeze usam `verify-full` e recusam URI com query/options.
- [ ] Personal Access Token da CLI.
- [ ] `service_role` da origem para inventário e cópia automática do Storage pela API.
- [ ] URL pública da origem e `service_role` do destino gravadas, junto das
  credenciais da origem, somente no arquivo protegido `migration.env` da VPS.
- [ ] Opcional: credenciais e região S3 temporárias somente se o procedimento
  manual de contingência com rclone for previamente escolhido. Elas não são
  exigidas pelo corte automático.
- [ ] Export/configuração atual de Auth: providers, redirect allow-list, SMTP e templates.
- [x] Contagem live sanitizada confirmada: 96 Edge Functions de produção ativas (mais o oráculo temporário de migração).
- [ ] Lista e hash final das 96 Edge Functions efetivamente implantadas, recapturados no freeze.
- [x] Baseline sanitizado dos três jobs ativos de `cron.job` capturado, sem comandos/tokens; recapturar schedules/flags no freeze final.
- [ ] Janela capaz de deixar `cron.job_run_details` sem execução `running` e `net.http_request_queue` vazia.

## 3. Secrets das Edge Functions

Os valores não são recuperáveis do Git e normalmente não podem ser lidos de volta do Supabase. Confirmar a fonte segura de cada um:

- [ ] `ADMIN_JWT_SECRET` (pode ser rotacionado; invalida sessão admin).
- [ ] `OAUTH_STATE_SECRET` novo e aleatório (não reutilizar segredo exposto).
- [ ] `CRON_SECRET` (pode ser rotacionado junto dos jobs).
- [ ] `EVOLUTION_API_URL`.
- [ ] `EVOLUTION_API_KEY`.
- [ ] `EVOLUTION_WEBHOOK_SECRET`.
- [ ] `FACEBOOK_APP_ID`.
- [ ] `FACEBOOK_APP_SECRET`.
- [ ] `FACEBOOK_WEBHOOK_VERIFY_TOKEN`.
- [ ] `GOOGLE_CLIENT_ID`.
- [ ] `GOOGLE_CLIENT_SECRET`.
- [ ] `META_TOKEN_ENCRYPTION_KEY` — usar o valor que criptografou os tokens Meta atuais ou exigir reconexão Facebook.
- [ ] `GOOGLE_CALENDAR_ENCRYPTION_KEY` — necessária somente se a integração Google for reativada; pode servir temporariamente como fallback de leitura de tokens Meta legados durante uma rotação.
- [ ] `MERCADOPAGO_ACCESS_TOKEN`.
- [ ] `MERCADOPAGO_WEBHOOK_SECRET`.
- [ ] `RESEND_API_KEY`.
- [ ] `SITE_URL=https://www.kairozcrm.com.br`.

## 4. Frontend e DNS

- [ ] Acesso ao projeto e time corretos na Vercel.
- [ ] Permissão para editar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (receberá a `ANON_KEY` JWT nova do destino no primeiro corte).
- [ ] Permissão para criar preview, promover deploy e reverter ao deploy anterior.
- [ ] Build de manutenção validado com `VITE_MAINTENANCE_MODE=true` e procedimento de promoção/reversão ensaiado.
- [ ] Acesso DNS à zona `kairozcrm.com.br` (hoje em nameservers Hostinger).
- [ ] Registro `api.kairozcrm.com.br` livre e pronto para A/AAAA.
- [ ] Deploy atual da Vercel e commit registrados para rollback.

## 5. Integrações externas

- [ ] Evolution API: acesso administrativo e lista de todas as instâncias/webhooks.
- [ ] Meta Developers: app, OAuth redirects, callback do webhook e verify token.
- [ ] Google Cloud: cliente OAuth do login e cliente OAuth do Calendar.
- [ ] Mercado Pago: webhook, secret e ambiente de teste.
- [ ] Resend/SMTP: host, porta, usuário, senha e remetente validados.
- [ ] Responsável por cada integração disponível durante a janela.

## 6. Decisões operacionais

- [ ] Janela aprovada.
- [ ] Responsável pelo go/no-go e pelo aceite funcional.
- [ ] RPO/RTO aprovados. Proposta inicial: RPO zero no corte; depois, até 7h (timer + atraso + duração) até PITR contínuo; RTO de até 4h, condicionado ao ensaio integral.
- [ ] Estratégia de buffer/retry dos webhooks aprovada.
- [x] Origem será mantida congelada por prazo indeterminado como cópia fria de rollback, sem receber novas gravações; ela não substitui os backups atuais da VPS.
- [x] Descarte exclusivo do destino aprovado para 134.783 objetos/67.395.693.105 bytes históricos de `chat-media`; o bucket será preservado vazio e novos uploads continuarão habilitados.
- [x] Retenção target-only aprovada para uploads novos de `chat-media`: corte em sete dias pela Storage API, executor horário e alerta se ultrapassar a margem operacional de 75 minutos; origem intocada.
- [ ] Política de rotação dos secrets históricos aprovada.
- [ ] Repositório off-site S3 compatível definido para backup criptografado.
- [ ] Bucket fica fora da conta/infra do VPS e possui versionamento/Object Lock ou réplica imutável; risco aprovado se não houver.
- [ ] Segunda chave Restic, com senha diferente da operacional, criada e testada fora do VPS.
- [ ] Escrow externo contém senha de recuperação, acesso S3 independente, endpoint/região, MFA recovery e acessos de Hostinger/Git/DNS/Vercel.
- [ ] Dois custodiantes e dupla autorização definidos; secrets não serão armazenados no Git, chat, VPS ou próprio bucket.
- [ ] `DISASTER_RECOVERY.md` revisado e `DR_CHECKLIST.md` de prontidão concluído.

## 7. GitHub e incidente de credenciais

- [ ] Permissão administrativa no repositório.
- [ ] Repositório tornado privado como contenção imediata.
- [ ] Novas credenciais preparadas para todos os valores listados em `SECURITY_INCIDENT.md`.
- [ ] Janela de rotação alinhada com Supabase, Vercel e integrações.
- [ ] Responsáveis avisados de que a futura limpeza de histórico exigirá reclone.
