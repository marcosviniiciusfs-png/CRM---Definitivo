# Runbook de migração blue/green

[Visão geral](README.md) · [Acessos e decisões](ACCESS_CHECKLIST.md) · [Gate de compatibilidade](COMPATIBILITY_GATE.md)

## Objetivo e limites

Migrar exclusivamente o checkout `CRM---Definitivo` e o projeto Supabase `uxttihjsxfowursjyult` do gerenciado para o Supabase self-hosted na Hostinger, sem replay de migrations locais e sem perda de dados durante o corte. A origem permanece intacta como rollback até o aceite. Qualquer divergência de checkout ou project ref deve falhar fechado.

Premissas provisórias:

- frontend continua na Vercel;
- API pública nova: `https://api.kairozcrm.com.br`;
- destino: Ubuntu 24.04 LTS + Docker Compose oficial Supabase `self-hosted/v0.8.0` + PostgreSQL 17;
- autenticação de usuários é preservada, mas novas chaves JWT forçarão novo login;
- RPO do corte: zero enquanto as escritas estiverem congeladas;
- HA não faz parte deste KVM único.

## Portões de segurança

Não executar o go-live se qualquer portão falhar:

1. A contenção e a rotação coordenada descritas em [SECURITY_INCIDENT.md](SECURITY_INCIDENT.md) não estão aprovadas e preparadas.
2. O inventário real da origem não foi capturado ou não foi recapturado imediatamente antes do freeze final.
3. O disco livre no destino é menor que `2 × banco + Storage efetivamente migrado + 30 GB`.
4. O gate estrutural de Auth/Storage descrito em [COMPATIBILITY_GATE.md](COMPATIBILITY_GATE.md) não passou no green limpo.
5. O ensaio não restaurou em transação única ou apresentou erros não classificados.
6. Contagens de tabelas/Auth/Storage diferem sem explicação.
7. Login, RLS multi-tenant, Realtime, upload e webhooks não passaram.
8. A chave de criptografia de integrações não foi validada.
9. Não existe backup off-site restaurável do destino, segunda chave Restic testada fora do VPS e checklist de DR aprovado.
10. Vercel/DNS/integrações não têm operador e rollback prontos.
11. Há broadcast, importação ou redistribuição longa em execução.

## Fase A — descoberta somente leitura

1. Confirmar commit/deploy efetivo do frontend e hashes das funções implantadas.
2. Executar `sql/source-inventory.sql` na origem e guardar o resultado sanitizado.
3. Registrar:
   - versão e tamanho do PostgreSQL;
   - tamanho por schema/tabela/índice;
   - extensões e versões;
   - RLS/policies, triggers, funções e publicações Realtime;
   - contagem exata por tabela e `auth.users`;
   - buckets, objetos e bytes;
   - jobs ativos, sem registrar o conteúdo de `command`;
   - sessões, locks e transações longas.
4. Consultar Auth/SMTP/providers no Dashboard.
5. Baixar ou comparar as Edge Functions implantadas. O Git local não é prova do deploy.
6. Medir latência dos usuários e confirmar datacenter Hostinger.

Saída: manifesto da origem, estimativa de disco e previsão de janela.

Baseline live sanitizado já observado:

- PostgreSQL `17.6.1.113`, com 3.030.076.563 bytes;
- 344 usuários em Auth;
- 96 Edge Functions inventariadas;
- `activity-attachments`: 7 objetos / 845.196 bytes, privado;
- `avatars`: 82 / 31.466.567 bytes, público, limite 5.242.880 bytes;
- `chat-media`: 134.783 / 67.395.693.105 bytes, público e aprovado para descarte somente no destino;
- `team-avatars`: 5 / 3.029.997 bytes, público;
- cron ativo: `send-scheduled-reminders` a cada minuto,
  `auto-redistribute-leads` a cada cinco minutos e `sync-google-sheets` a cada
  dois minutos. O conteúdo de `cron.job.command` não integra este documento.

Como a origem permanece online até a janela, diferenças legítimas no inventário
final exigem atualizar e reaprovar os gates exatos antes do restore; nunca
afrouxar as contagens durante o corte.

## Fase B — provisionamento do green

1. Instalar Ubuntu limpo.
2. Aplicar o firewall Hostinger antes de expor o VPS: SSH, 80 e 443 apenas.
3. Executar `scripts/01-bootstrap-host.sh`.
4. Criar o registro A de `api.kairozcrm.com.br` para o IP do VPS.
5. Copiar este diretório para `/opt/crm-migration-kit` e copiar também `supabase/functions/` do mesmo commit para `/opt/crm-migration-kit/app-functions/`. Sem argumento explícito, `05-deploy-functions.sh` usa esse diretório.
6. Executar `scripts/02-prepare-stack.sh`.
   Na primeira execução, o preparo faz o pull e grava atomicamente
   `/opt/crm-supabase/.crm-image-manifest` com a referência, o image ID e todos
   os `RepoDigests` obtidos por `docker image inspect`. Reexecuções nunca fazem
   pull: exigem todas as imagens locais e comparam IDs e RepoDigests com o
   manifesto. Ausência ou divergência e preparo anterior interrompido falham
   fechados. Para alterar ou recuperar imagens, restaurar o snapshot green
   limpo ou reprovisionar um green novo, executar o preparo uma vez e aprovar o
   novo manifesto; não apagar ou substituir o manifesto no destino atual. Calcular
   o SHA-256 desse arquivo e preservar uma cópia fora da VPS junto ao registro
   da mudança; ele documenta exatamente os bytes obtidos sem fingir que digests
   desconhecidos estavam fixados antecipadamente.
7. Preencher no servidor:
   - `/opt/crm-supabase/.env`;
   - `/opt/crm-supabase/functions.env`;
   - `/etc/crm-supabase/backup.env`.
8. Validar que nenhum placeholder permanece.
9. Baixar no Dashboard o certificado CA do banco de origem para o caminho protegido indicado por `SOURCE_DB_SSL_ROOT_CERT`; registrar o host exato em `SOURCE_EXPECTED_DB_HOST`. Export, freeze e unfreeze exigem TLS `verify-full`.
10. Subir Caddy + Supabase e confirmar TLS, serviços healthy e portas públicas.
11. Confirmar externamente que 5432, 6543 e 8000 estão fechadas.
12. Com o green ainda vazio e toda a configuração validada, criar e nomear um snapshot Hostinger `green-clean-pre-rehearsal`. Não restaurar esse snapshot sem confirmar que dumps necessários estão fora do VPS ou serão recriados.

## Fase C — ensaio completo

O ensaio não pode disparar mensagens, e-mails, cobranças, cron ou webhooks reais.

1. Manter o serviço `functions` parado durante o ensaio, ou fornecer apenas credenciais de sandbox. Não existe uma variável genérica capaz de impedir efeitos externos em todas as funções.
2. Executar `scripts/03-export-source.sh rehearsal`.
   A Supabase CLI 2.116.0 não propaga `PGSSLMODE/PGSSLROOTCERT` ao container de `pg_dump`. Por isso o script usa `--dry-run` apenas com endpoint fictício para obter os filtros oficiais e executa o template sob CA montado + `verify-full`; a URI e a senha reais não entram em argv ou logs. Qualquer divergência do template, host, porta, CA ou versão falha fechado.
3. Conferir SHA-256 e permissões dos artefatos.
4. Executar `scripts/04-restore-target.sh <diretório-do-export>` em destino limpo.
   O restore aplica `sql/disable-restored-cron.sql` dentro da mesma transação do dump; nenhum job antigo nem request pendente do `pg_net` pode disparar entre restore e pós-restore.
5. Com todos os serviços exceto `db` parados, executar
   `scripts/06-discard-chat-media-target.sh` com a confirmação explícita exigida
   pelo próprio script. Ele aceita somente 134.783 objetos/67.395.693.105 bytes
   (ou zero após um commit anterior), remove os metadados em transação, preserva
   o bucket público `chat-media` e grava marcador vinculado ao restore. O script
   usa apenas o container PostgreSQL do destino e nunca conecta na origem.
6. Executar `scripts/05-deploy-functions.sh --start-infrastructure`. Isso sobe a
   API interna necessária ao Storage, mantendo `functions` parado.
7. Copiar somente os três buckets preservados de Storage. O baseline do ensaio
   foi 94 objetos / 35.341.760 bytes; o corte recaptura e verifica o inventário
   final dinamicamente:
   - caminho automático: `scripts/copy-storage.mjs --verify`, executado pelo
     orquestrador **na workstation do operador**, na raiz deste checkout
     `CRM---Definitivo`;
   - o preflight valida Node.js 20+ e importa o `@supabase/supabase-js` já fixado
     por `package-lock.json`. Se for preciso reconstruir as dependências antes da
     janela, usar `npm ci` nessa workstation a partir do lockfile revisado, nunca
     `npm install -g` nem instalar dependências durante o corte;
   - o orquestrador lê da VPS `SOURCE_SUPABASE_URL`,
     `SOURCE_SERVICE_ROLE_KEY`, `TARGET_SUPABASE_URL` e
     `TARGET_SERVICE_ROLE_KEY` sem persistir os valores localmente. As chaves são
     entregues apenas no ambiente do processo Node; não aparecem em argv ou logs;
   - contingência manual opcional: `scripts/06-sync-storage-rclone.sh`, somente
     se credenciais S3 temporárias tiverem sido preparadas e o caminho ensaiado.
     Ele não participa do comando automático.
   O copiador automático exclui `chat-media`, recusa sua seleção explícita, exige
   o bucket configurado e vazio no destino e falha se a verificação apontar
   qualquer divergência.
8. Executar `scripts/07-post-restore.sh` apenas no destino. O script aplica
   `sql/post-restore.sql`, deixa os três jobs inativos e mantém o gate global
   de `pg_cron` fechado.
9. Gerar manifesto do destino e comparar com a origem. A única divergência
   aprovada é `chat-media`: bucket/configuração presentes, zero objetos/bytes.
10. Criar um preview Vercel usando URL/chave do green.
11. Executar todos os testes de aceite abaixo.
12. Cronometrar export, restore, descarte, Storage, inicialização e validação.
13. Preservar resultados e dumps necessários fora do VPS e restaurar o snapshot `green-clean-pre-rehearsal` antes de preparar o restore final. Confirmar que `.crm-last-restore` não existe e que o banco está vazio; `04-restore-target.sh` recusa green reutilizado.

## Fase D — preparação do corte

Até 24 horas antes:

- congelar deploys, migrations e mudanças de configuração;
- registrar tag/commit e imagens Docker;
- confirmar que a cópia integral pela API dos três buckets preservados após a
  restauração do snapshot limpo cabe na janela medida; `chat-media` não participa
  da cópia e precisa terminar criado e vazio;
- cadastrar os novos redirects/callbacks sem remover os antigos;
- preparar release Vercel nova e rollback para a release anterior;
- confirmar comportamento de retry de Evolution, Meta, formulários e Mercado Pago;
- confirmar que o snapshot `green-clean-pre-rehearsal` foi restaurado e revalidar secrets, DNS/TLS e saúde; não usar o banco ensaiado como destino final;
- no modo `restic-offsite`, concluir um restore integral fora do diretório de produção usando somente a chave de recuperação e marcar `DR_CHECKLIST.md`; para o corte atual, registrar a exceção `managed-source-cold` e seu risco conforme [MANAGED_SOURCE_COLD_MODE.md](MANAGED_SOURCE_COLD_MODE.md);
- definir início `T0`, operadores e canal de comunicação.

Janela planejada = tempo medido no ensaio + 50% de margem. Se o ensaio não foi medido, não estimar no escuro.

### Matriz de callbacks a alterar

| Sistema | Endpoint novo | Observação |
| --- | --- | --- |
| Supabase Auth / Google login | `https://api.kairozcrm.com.br/auth/v1/callback` | manter também os redirects do frontend na allow-list |
| Google Calendar OAuth | `/functions/v1/google-calendar-oauth-callback` | atualizar no Google Cloud |
| Meta OAuth | `/functions/v1/facebook-oauth-callback` | atualizar no Meta Developers |
| Meta Leads webhook | `/functions/v1/facebook-leads-webhook` | validar challenge e evento assinado |
| Evolution | funções `whatsapp-message-webhook`, `whatsapp-qr-webhook` e `whatsapp-status-webhook` | reaplicar em **todas** as instâncias a URL nova e o header `x-api-key: EVOLUTION_WEBHOOK_SECRET`; alterar apenas `webhook_url` no banco não muda o provedor |
| Mercado Pago | `/functions/v1/mercadopago-webhook` | alterar com janela/retry controlados |
| Formulários externos | `/functions/v1/form-webhook/<token>` | inventariar cada URL já publicada; não confiar apenas nas novas URLs geradas pelo frontend |

Todos os caminhos da tabela usam a origem `https://api.kairozcrm.com.br`. Uma chamada recebida na URL antiga depois de `T0` deve ser bloqueada, encaminhada idempotentemente ou reconciliada; nunca deixada gravando silenciosamente na origem.

## Fase E — cutover

### E1. Congelamento

1. Registrar `T0` em UTC e horário de Brasília.
2. Publicar o build já preparado com `VITE_MAINTENANCE_MODE=true` na Vercel e confirmar externamente que as rotas operacionais estão bloqueadas.
3. Encerrar sessões operacionais e bloquear novas ações.
4. Pausar automações, broadcasts e importações na origem.
5. Pausar webhooks ou direcioná-los ao buffer durável. Fazer isso **antes** do freeze: uma Edge Function pode causar efeito externo antes de tentar gravar no banco.
6. Confirmar que contagens e `max(updated_at)` das tabelas críticas ficam estáveis por 60 segundos.
7. Executar, no host protegido que contém `/etc/crm-supabase/migration.env`:

   ```bash
   sudo /opt/crm-migration-kit/scripts/11-freeze-source.sh --confirm-freeze-source
   ```

   Guardar o caminho de estado emitido pelo script. Ele contém apenas identidade operacional e estado `jobid/active` do cron, fica com modo `0600` e é necessário para rollback. O script:

   - compara e desativa todos os jobs sob lock;
   - aguarda `cron.job_run_details` sem execução `running` e `net.http_request_queue` vazia;
   - define `default_transaction_read_only=on` no banco da origem;
   - encerra sessões cliente anteriores à mudança para que reconectem somente leitura;
   - valida TLS `verify-full` contra o CA/host esperados, propriedade do banco, permissão de sinalização, ausência de override por role, nova sessão read-only e cron inativo;
   - restaura automaticamente o estado anterior se uma etapa falhar.

8. Repetir a estabilidade por 60 segundos. Se ainda houver escrita, abortar o dump final, executar o unfreeze e localizar o produtor.

O freeze é um guardrail operacional, não uma barreira contra credenciais administrativas: `default_transaction_read_only` é um default de novas sessões e pode ser sobrescrito por um cliente privilegiado. Por isso manutenção, pausa dos produtores e ausência de operadores concorrentes continuam obrigatórias. No Supabase gerenciado, `ALTER DATABASE` ou `pg_terminate_backend` também podem ser recusados para roles/sessões internas protegidas; o script falha fechado nesse caso. Não improvisar permissões durante a janela: abrir chamado/usar o procedimento validado no ensaio.

### E2. Cópia final

1. Executar `scripts/03-export-source.sh final`.
2. Manter o destino fechado para usuários e restaurar o dump final no green comprovadamente limpo.
3. Executar o descarte target-only de `chat-media`, ainda com os demais serviços parados, e validar o marcador associado ao restore final.
4. Executar `scripts/05-deploy-functions.sh --start-infrastructure`; a infraestrutura sobe, mas `functions` continua parado.
5. Deixar o orquestrador executar `copy-storage.mjs --verify` pela API apenas
   para `activity-attachments`, `avatars` e `team-avatars`. A operação é
   idempotente por path (`upsert`) e a saída dinâmica, junto do exit code, deve
   comprovar zero falhas; não substituir esse gate por uma contagem fixa do
   ensaio. Como o snapshot limpo reverte os blobs do ensaio, a cópia final é
   integral. O caminho rclone é somente contingência manual previamente
   preparada, não uma dependência do corte automático.
6. Aplicar patches pós-restore e recriar os três jobs cron com a URL nova e `CRON_SECRET`, todos inativos.
7. Confirmar que as funções estão implantadas, mas mantê-las paradas até os testes fechados permitirem efeitos externos.

### E3. Validação fechada

1. Comparar manifestos e contagens.
2. Validar sequências, FKs, RLS, publicações e jobs.
3. Executar smoke tests da API e frontend preview.
4. Confirmar que logs não fazem requisições ao host Supabase antigo.
5. Realizar go/no-go antes de aceitar qualquer escrita real.

### E4. Virada

1. Atualizar callbacks/webhooks externos para `api.kairozcrm.com.br`.
   Na Evolution, conferir por API cada instância: URL, eventos habilitados e o
   header secreto `x-api-key`; sem esse header os handlers do destino falham
   fechado com HTTP 401.
2. Reproduzir o buffer com idempotência e conferir duplicatas.
3. Publicar/promover a release Vercel com:
   - `VITE_SUPABASE_URL=https://api.kairozcrm.com.br`;
   - `VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY JWT do destino>`.
   - `VITE_MAINTENANCE_MODE=false`.
   O nome da variável do frontend é histórico. Neste CRM, usar a `ANON_KEY` JWT gerada no destino mantém compatibilidade com a validação das Edge Functions; não usar a chave opaca `sb_publishable_*` no primeiro corte.
4. Habilitar cron no destino, um job por vez. Cada invocacao aceita exatamente
   um nome da allowlist e recusa nomes adicionais ou desconhecidos:

   ```bash
   sudo env CONFIRM_ENABLE_CRON=YES \
     /opt/crm-migration-kit/scripts/07-post-restore.sh \
     --enable-cron send-scheduled-reminders

   sudo env EXPECTED_CRON_LAUNCH_STATE=on \
     EXPECTED_ACTIVE_CRON_JOBS=send-scheduled-reminders \
     /opt/crm-migration-kit/scripts/10-healthcheck.sh
   ```

   Observar pelo menos um ciclo, validar resultado e efeitos externos, e so
   entao liberar o segundo job:

   ```bash
   sudo env CONFIRM_ENABLE_CRON=YES \
     /opt/crm-migration-kit/scripts/07-post-restore.sh \
     --enable-cron auto-redistribute-leads
   ```

   Depois de validar o segundo job, recuperar, auditar e implantar a função
   `sync-google-sheets`. Sua ativação exige, além da confirmação comum, o gate
   explícito `CONFIRM_SYNC_GOOGLE_SHEETS_VALIDATED=YES`. Observar ao menos dois
   ciclos de dois minutos e então executar o healthcheck com os três nomes. Só
   depois disso o default pós-cutover do healthcheck espera três jobs ativos.
5. Remover manutenção.
6. Confirmar no destino que um novo upload real de `chat-media` funciona. Não
   reimportar nenhum objeto histórico e não alterar a origem.
7. Somente agora, no pós-cutover, armar a retenção de sete dias no modo aprovado `managed-source-cold`:

   ```bash
   sudo env \
     CONFIRM_ENABLE_CHAT_MEDIA_RETENTION=YES_ENABLE_7_DAY_CHAT_MEDIA_RETENTION_ON_TARGET \
     /opt/crm-migration-kit/scripts/install-systemd.sh \
     --enable-chat-media-retention
   ```

   O instalador lê a `SERVICE_ROLE_KEY` diretamente do `.env` protegido, valida
   que restore, descarte histórico e ativação pertencem ao mesmo manifesto e
   não inicia a stack. A primeira rodada ocorre em até 20 minutos; depois, o
   timer roda a cada hora com jitter de até cinco minutos. Confirmar que o timer
   está enabled/active e, após a primeira rodada, executar o healthcheck. Essa
   confirmação também arma o timer automático de healthcheck de produção. Antes
   dela, ambos os timers permanecem inativos; uma verificação manual falha se
   encontrar retenção habilitada sem o marcador de autorização.
   O mesmo gate exige o marcador persistente
   `/etc/crm-supabase/managed-source-cold-approved`, root/`0600`, anti-symlink,
   ligado ao projeto `uxttihjsxfowursjyult` e ao modo, sem depender do run ou restore,
   mantém `crm-supabase-backup.timer` e
   `crm-supabase-maintenance.timer` desativados e informa
   `backup=managed-source-cold` no healthcheck. Isso preserva a saúde e a
   retenção sem representar a origem congelada como backup recorrente da VPS.
8. Monitorar erros, CPU, RAM, disco, conexões, Realtime e webhooks continuamente por 60 minutos.

## Testes de aceite

### Banco e isolamento

- [ ] Todas as contagens por tabela coincidem.
- [ ] `auth.users`, identities e fatores MFA coincidem.
- [ ] Os quatro buckets e suas configurações coincidem; os três preservados
  somam 94 objetos/35.341.760 bytes e `chat-media` existe público, vazio, aceita
  um novo upload controlado no destino e volta a zero após remover esse objeto de teste.
- [ ] Extensões, triggers, funções, grants, RLS e policies estão presentes.
- [ ] `supabase_realtime` contém todas as tabelas esperadas.
- [ ] Nenhuma FK órfã ou constraint inválida.
- [ ] Usuário da organização A não consegue ler/escrever dados da organização B.

### Aplicação

- [ ] Login por senha, logout, refresh e recuperação de senha.
- [ ] Login Google e login administrativo.
- [ ] Troca de organização.
- [ ] Leads, pipeline, funis, roleta, Kanban e tarefas.
- [ ] Realtime de leads, mensagens, tarefas e permissões.
- [ ] Upload/download em bucket público e privado; novas signed URLs são geradas no destino. Tokens de signed URLs antigas não são portáveis.
- [ ] WhatsApp: status, receber, enviar texto, mídia e grupo.
- [ ] Meta: verify webhook, OAuth e lead de teste.
- [ ] Google Calendar: OAuth, listar/criar/editar/excluir evento.
- [ ] Form webhook e Mercado Pago em teste controlado.
- [ ] E-mail de recuperação/convite.
- [ ] Dois ciclos de cada um dos três jobs, nas frequências 1/5/2 minutos, sem duplicidade.
- [ ] Zero referência funcional ao host Supabase antigo.

## Rollback

### Antes de liberar escritas no green

Rollback simples:

1. Não remover manutenção.
2. Com manutenção e webhooks ainda pausados, restaurar a origem com o diretório exato emitido no freeze:

   ```bash
   sudo /opt/crm-migration-kit/scripts/12-unfreeze-source.sh \
     --confirm-unfreeze-source /var/backups/crm-supabase/cutover-state/<timestamp>-source-freeze
   ```

3. Confirmar que uma nova conexão está gravável e que o script restaurou exatamente os flags `active` originais de `pg_cron`.
4. Restaurar o deploy Vercel anterior.
5. Reabrir webhooks/produtores externos de forma controlada.
6. Confirmar login e processamento no blue.
7. Esvaziar/reprocessar o buffer para a origem.
8. Registrar causa e manter o green para diagnóstico.

Se o unfreeze emitir `RECOVERY_REQUIRED`, não reabrir Vercel ou webhooks. Preservar o diretório de estado e restaurar manualmente primeiro o default do banco, depois forçar reconexão dos serviços e por último os flags de cron. Nunca apagar o artefato de freeze durante a janela.

Como nenhuma escrita real entrou no green, não há divergência.

### Depois de liberar escritas no green

Não existe rollback instantâneo com RPO zero. É necessário:

1. recolocar manutenção;
2. congelar o green;
3. identificar todas as mudanças desde `T0`;
4. reconciliar/replayar no blue com idempotência;
5. validar contagens e só então voltar Vercel/webhooks.

Depois do ponto de escrita, preferir correção para frente. O responsável pelo go/no-go deve reconhecer esse ponto de não retorno.

## Pós-corte

- manter a origem congelada e preservada por prazo indeterminado como cópia fria
  de rollback; não reativar cron, callbacks, webhooks ou escritas e não cancelar
  o projeto sem autorização explícita;
- tratar essa origem apenas como fotografia de `T0`: ela não recebe as mudanças
  futuras da VPS. No modo atual `managed-source-cold`, os dados posteriores ao
  corte ficam sem backup recorrente e podem ser perdidos com a VPS;
- monitorar 24 horas e revisar logs diariamente por 7 dias;
- confirmar em cada healthcheck que `backup=managed-source-cold` e que os
  timers de backup/manutenção continuam desativados, até existir um backup
  off-site restaurado e testado;
- confirmar que o timer horário de `chat-media` segue ativo, que o último
  sucesso tem menos de 150 minutos, que o backlog elegível não passa de 4.000
  objetos e que nenhum objeto excede sete dias + 75 minutos;
- fazer teste de restauração na primeira semana e seguir a cadência mensal/trimestral de `DISASTER_RECOVERY.md`;
- confirmar que a rotação coordenada dos secrets expostos foi concluída e então sanear o histórico Git;
- sanear timestamps duplicados das migrations antes da próxima `db push`;
- implementar PITR/WAL contínuo antes de aceitar RPO menor que 6 horas;
- avaliar um segundo nó/serviço gerenciado se o negócio exigir HA.
