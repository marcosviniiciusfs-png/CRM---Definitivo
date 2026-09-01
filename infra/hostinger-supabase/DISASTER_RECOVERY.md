# Disaster recovery e backups do CRM

## Objetivo e limites

> Estado do corte atual: o modo aprovado é
> [`managed-source-cold`](MANAGED_SOURCE_COLD_MODE.md). Ainda não existe backup
> recorrente/off-site dos novos dados da VPS; portanto, as metas normais abaixo
> são o estado futuro desejado, não uma proteção já implantada. Até a migração
> para `restic-offsite`, uma perda da VPS pode perder tudo o que mudou após
> `T0`.

Este procedimento recupera o Supabase self-hosted do CRM quando o KVM, o disco ou a instalação deixa de ser utilizável. Ele parte de um host Ubuntu limpo e de um snapshot Restic off-site. A restauração deve ocorrer primeiro em um destino isolado; nunca restaurar diretamente por cima do único ambiente ainda disponível.

Este desenho não é alta disponibilidade e não oferece PITR. Enquanto não houver arquivamento contínuo de WAL e um destino testado para ele, qualquer dado confirmado depois do último backup concluído pode ser perdido.

| Objetivo | Meta operacional | Condição |
| --- | --- | --- |
| RPO durante o cutover | zero | somente enquanto o freeze da origem estiver validado e nenhum produtor puder escrever |
| RPO normal | até 7 horas | timer de 6h, atraso aleatório de até 10min e até 50min de duração; duração maior já viola a meta |
| Alerta de backup vencido | 8 horas | `MAX_BACKUP_AGE_HOURS=8`; investigar antes de completar uma segunda janela perdida |
| RTO | até 4 horas | provisório até um teste integral medir provisionamento, download, restore, validação e virada |

O RTO não é promessa até o ensaio integral caber em quatro horas com o volume real. Se download ou Storage excederem o orçamento, aumentar capacidade, manter um green de recuperação ou revisar formalmente a meta.

No corte inicial, o inventário live possui PostgreSQL com 3.030.076.563 bytes e
Storage com 67.431.034.865 bytes. Por decisão explícita, os 134.783 objetos
históricos de `chat-media` (67.395.693.105 bytes) não são migrados. O destino
preserva esse bucket público vazio e copia somente 94 objetos/35.341.760 bytes
dos outros três buckets. Depois do go-live, os uploads novos de `chat-media`
entrarão normalmente nos backups depois que `restic-offsite` for implantado;
no modo atual eles não possuem cópia recorrente. A retenção automática de
sete dias limita o conjunto corrente, sem jamais voltar à origem.

O Supabase gerenciado antigo permanece congelado por prazo indeterminado como
cópia fria do estado em `T0`. Ele pode apoiar um rollback para esse ponto, mas
não replica as escritas posteriores da VPS e não conta para o RPO normal. Os
backups coordenados, criptografados e off-site do destino continuam sendo o
estado recomendado, mas sua ausência foi aceita temporariamente para este
go-live e deve permanecer explícita nos markers e no healthcheck.

## Conteúdo do conjunto de recuperação

`scripts/09-backup.sh` cria um dump lógico consistente do PostgreSQL e envia ao Restic, no mesmo snapshot, os itens abaixo:

| Componente | Artefato | Uso na recuperação |
| --- | --- | --- |
| Banco | `postgres.dump` em formato custom | schemas, tabelas, dados, ACLs e extensões vistas pelo `pg_dump` |
| Roles | `roles.sql` | roles e atributos do cluster; contém material sensível e fica criptografado/off-line |
| Vault | `pgsodium_root.key` | obrigatório para descriptografar valores preservados pelo pgsodium/Vault |
| Storage | `/opt/crm-supabase/volumes/storage` | blobs do backend `file`, incluindo novos uploads de `chat-media` feitos após o cutover; deve ser reconciliado com `storage.objects` |
| Stack | `.crm-supabase-commit`, compose files, `runtime` e volumes de configuração | recriar exatamente a release fixada |
| Edge Functions | `functions.env` e `volumes/functions` | código implantado e secrets de runtime |
| Secrets da plataforma | `/opt/crm-supabase/.env` | JWT, senhas internas, SMTP, S3 e demais configurações |
| Estado da retenção | `.crm-chat-media-retention-enabled` e `retention/chat-media.last-success` quando existentes | evidência ligada ao restore; restaurar para auditoria, nunca usar para iniciar o timer no laboratório |
| Evidência | `SHA256SUMS`, tag `crm-supabase` e tag do `backup_id` | selecionar e validar o conjunto exato |

O Git remoto e o kit de migração continuam sendo dependências externas. Configurações de Vercel, DNS, Hostinger, OAuth e provedores de webhook também não são exportadas pelo Restic; seus acessos e valores recuperáveis devem constar do pacote de escrow.

## Consistência e classes de backup

O `pg_dump --format=custom` usa um snapshot transacional do banco. O dump de roles ocorre separadamente, e o Restic lê o filesystem de Storage depois do snapshot do banco. Portanto:

- o banco é logicamente consistente;
- roles alteradas durante a execução podem representar um instante diferente;
- banco, blobs e arquivos de configuração não formam um ponto atômico enquanto houver escrita;
- um backup agendado pode exigir reconciliação entre `storage.objects` e os blobs restaurados.

Backup e retenção compartilham o mesmo lock. Se houver colisão, a retenção não
altera objetos nem atualiza o último sucesso e tenta novamente na hora seguinte;
o backup mantém prioridade e o healthcheck detecta adiamentos persistentes.

Há duas classes operacionais:

1. **Backup agendado:** a cada seis horas, adequado ao RPO normal. No restore, objetos ausentes, excedentes ou modificados devem ser reconciliados antes da abertura.
2. **Backup coordenado:** obrigatório antes de cutover, upgrade destrutivo ou mudança grande. Colocar o frontend em manutenção, pausar webhooks/importações/broadcasts/cron, drenar `pg_cron` e `pg_net`, parar `functions`, `auth`, `rest`, `realtime` e `storage`, confirmar ausência de sessões produtoras e estabilidade de banco/Storage, executar o backup e somente então reabrir os produtores. O banco permanece disponível apenas ao operador do backup.

O script não consegue provar que todos os produtores externos foram pausados. A evidência do backup coordenado deve registrar operadores, início/fim UTC, contagens antes/depois e a confirmação de que não houve escrita.

## Escrow independente

O arquivo `/etc/crm-supabase/restic-password` é a chave operacional do timer e morrerá junto com o VPS em uma perda total. Uma cópia desse mesmo arquivo não é suficiente como controle independente.

Antes de habilitar os timers:

1. inicializar e validar o repositório com a senha operacional;
2. em uma sessão administrativa sem gravação de terminal e com `set +x`, executar `restic key add` usando a configuração protegida de backup;
3. criar uma segunda senha aleatória, diferente da operacional, diretamente no prompt do Restic;
4. executar `restic key list` e registrar o ID completo da segunda chave;
5. testar essa segunda chave a partir de uma estação limpa, sem o arquivo de senha operacional;
6. guardar a senha de recuperação fora do VPS e fora do bucket Restic, com dois custodiantes autorizados.

O pacote externo precisa conter, sem depender de nenhum arquivo que exista apenas no snapshot:

- senha da segunda chave Restic e seu key ID;
- `RESTIC_REPOSITORY`, endpoint, região e caminho do bucket;
- credencial S3 de recuperação ou procedimento de emissão por uma conta administrativa independente;
- acesso e recuperação de MFA do provedor do repositório;
- repositório Git, commit fixado, versão do kit e contato dos operadores;
- acesso Hostinger, DNS/registrador, Vercel e provedores OAuth/webhook;
- este runbook e o último `DR_CHECKLIST.md` assinado.

A senha de recuperação e a credencial de leitura do bucket não devem ficar no mesmo cofre lógico sem política de dupla autorização. O ID do registro externo e o key ID, que não são secretos, podem ser anotados em `backup.env`; as senhas nunca.

`scripts/install-systemd.sh` falha fechado se esses dois IDs ainda forem placeholders, se a segunda chave não aparecer em `restic key list`, se ela for a chave operacional corrente ou se houver menos de duas chaves. Esse gate prova a existência da chave; o teste em outra máquina é o que prova a recuperação da senha e do acesso S3.

O credential usado pelo backup precisa criar e remover objetos para `forget --prune`. Isso não é proteção contra comprometimento do próprio VPS. Para resistência a ransomware, habilitar versionamento/Object Lock ou replicação imutável em outra conta/provedor e testar a recuperação dessa cópia. Uma snapshot Hostinger não substitui o repositório off-site.

## Ativação de desastre

1. Declarar o incidente, abrir uma linha do tempo UTC e nomear comandante, operador de infraestrutura e responsável funcional.
2. Se algum ambiente ainda responder, colocá-lo em manutenção e bloquear produtores externos antes de investigar.
3. Preservar disco, logs e snapshot do ambiente danificado. Não executar `down -v`, reset ou restore in-place.
4. Determinar se houve comprometimento. Em caso positivo, considerar todos os secrets restaurados como expostos e preparar rotação antes de liberar tráfego.
5. Escolher por ID o último snapshot concluído antes do incidente; não usar `latest` sem conferir hora, host, paths e tags.
6. Calcular o intervalo de perda potencial entre a conclusão desse backup e a última escrita confirmada, e abrir fila de replay/reconciliação.

## Restauração em destino isolado

### 1. Recuperar e verificar o snapshot

1. Provisionar Ubuntu 24.04 limpo em um KVM separado.
2. Aplicar firewall antes de iniciar containers. Manter DNS fora do host, `functions` parado e saída para SMTP, pagamentos, Meta, Google, Evolution e webhooks bloqueada.
3. Recuperar o código e o kit no commit fixado. Não confiar em arquivos copiados do host comprometido.
4. Materializar a configuração do repositório e a senha de recuperação em arquivos root-owned `0600`, preferencialmente em tmpfs. Não colocar senha em argv, variáveis inline, histórico ou logs.
5. Usando somente a segunda chave, executar `restic key list`, `restic snapshots --tag crm-supabase` e `restic check`.
6. Restaurar o snapshot escolhido para um diretório vazio de staging, por exemplo:

   ```bash
   restic restore SNAPSHOT_ID --target /srv/crm-dr-restore
   ```

7. Localizar o diretório `/srv/crm-dr-restore/var/backups/crm-supabase/logical/BACKUP_ID` e executar `sha256sum --check SHA256SUMS` dentro dele.
8. Confirmar que o `BACKUP_ID` é a tag do snapshot escolhido e que `.crm-supabase-commit` coincide com `versions.conf`.

Não fazer restore Restic diretamente em `/`. O staging permite validar caminhos, ownership e diferenças antes de qualquer cópia.

### 2. Recriar configuração, chave e Storage

1. Executar o bootstrap e preparar uma stack green nova no commit fixado, sem subir serviços de aplicação.
2. Comparar, então copiar do staging os compose files, `.env`, `functions.env`, `runtime`, `volumes/functions`, configurações de `api/logs/pooler/proxy/snippets/db` e `.crm-supabase-commit`.
3. Restaurar `pgsodium_root.key` antes da primeira inicialização do banco restaurado. Aplicar ownership esperado pelo container e modo `0600`; nunca imprimir ou comparar seu conteúdo no terminal.
4. Com `storage` e `imgproxy` parados, restaurar `volumes/storage` preservando owner, group, modes e timestamps.
5. Manter os arquivos recuperados no staging até o aceite e a primeira nova cópia off-site.

Se o incidente envolver invasão, não reutilizar cegamente `.env` e `functions.env`: usar os arquivos apenas como inventário, rotacionar valores e manter compatibilidade temporária somente para os secrets criptográficos cuja troca inviabilizaria dados existentes.

### 3. Restaurar roles e banco

Esta etapa é destrutiva somente para o banco green isolado. Ela precisa ser ensaiada com a mesma imagem PostgreSQL antes de ser autorizada em desastre.

1. Iniciar apenas `db`; todos os demais serviços e o tráfego de saída continuam bloqueados.
2. Antes do restore, configurar `cron.database_name` para um database inexistente e reiniciar o container. Confirmar que nenhum worker de `pg_cron` executará jobs restaurados.
3. Aplicar `roles.sql` antes do archive. A stack limpa já contém roles Supabase; erros de `CREATE ROLE ... already exists` podem ser esperados, mas não se pode ignorar stderr inteiro. Aceitar somente duplicatas previamente catalogadas e falhar em qualquer outro erro.
4. Copiar `postgres.dump` para o container e executar `pg_restore` com `--clean --if-exists --single-transaction --exit-on-error` no database `postgres` vazio/baseline. Não usar `--no-owner` ou remover ACLs sem aprovação, pois isso muda RLS e privilégios.
5. Ainda sem egress, em uma transação administrativa, desativar todos os registros de `cron.job`, limpar/reconciliar `net.http_request_queue` e confirmar zero execução `running`.
6. Reiniciar somente o banco e validar extensões, owners, grants, constraints, sequências, `auth.users`, `storage.objects` e a capacidade de abrir os valores protegidos pelo pgsodium.

O dump de roles não é idempotente em uma stack já inicializada. O ensaio deve manter uma lista exata das duplicatas permitidas e o comando aprovado; improvisar filtros com `grep` durante um incidente pode remover atributos ou senhas de roles. Se o archive não restaurar em transação única, preservar o erro, descartar o green e recomeçar de um baseline limpo.

### 4. Reconciliar e validar

Antes de liberar qualquer efeito externo:

- comparar contagens e checksums das tabelas críticas com a evidência do backup;
- validar Auth: senha, refresh, recovery, identities e MFA;
- listar buckets/objetos/bytes e testar download/upload público e privado;
- comparar `storage.objects` com os blobs; não apagar órfãos até a análise terminar;
- validar RLS entre duas organizações, Realtime e sequências;
- iniciar Edge Functions apenas com integrações em sandbox/bloqueadas;
- revisar todas as configurações externas, callbacks e URLs;
- identificar eventos no intervalo de RPO e replayar apenas com idempotência;
- executar `scripts/08-smoke-test.sh` e os testes de aceite do `RUNBOOK.md`.

### Regra especial de `chat-media`

`scripts/06-discard-chat-media-target.sh` é uma ferramenta de migração única:
serve somente para remover do green os metadados históricos restaurados da
origem gerenciada, antes de qualquer escrita no destino. Ela exige o marcador
do restore, contagens exatas, todos os produtores parados e confirmação
explícita; não acessa nem altera a origem.

Não executar esse descarte ao restaurar um backup normal do Supabase
self-hosted. Depois do go-live, novos uploads de `chat-media` são temporários:
ficam no Restic enquanto presentes no snapshot e precisam ser restaurados e
reconciliados como qualquer outro blob, mas voltam a ficar sujeitos ao corte de
sete dias quando o novo ambiente entrar em produção. A exclusão recorrente usa
somente a Storage API; SQL serve apenas para selecionar/contar nomes elegíveis e
nunca faz `DELETE` em `storage.objects`.

Durante restore isolado, manter o timer
`crm-supabase-chat-media-retention.timer` desabilitado mesmo que o snapshot
contenha os marcadores anteriores. Depois do aceite e do novo go-live, executar
novamente `install-systemd.sh --enable-chat-media-retention` com a confirmação
documentada no `RUNBOOK.md`: o instalador regrava o marcador de ativação para a
rodada atual, e o healthcheck dá 60 minutos para aparecer um sucesso posterior
à reativação. Em um laboratório que repita o corte a partir do export original,
o bucket deve terminar existente, público e vazio antes da abertura, e a cópia
S3/API deve continuar recusando o histórico.

### 5. Voltar ao serviço

1. Obter go/no-go funcional e registrar o ponto de não retorno.
2. Rotacionar credenciais comprometidas e atualizar Vercel/provedores antes de abrir o host.
3. Liberar DNS/Vercel e integrações uma por vez; habilitar cron por job.
4. Depois de aceitar uploads novos no destino, rearmar explicitamente a retenção de `chat-media` para o restore validado; nunca ativá-la no laboratório isolado.
5. Monitorar continuamente por pelo menos 60 minutos.
6. Executar imediatamente um novo backup off-site, confirmar o snapshot e preservar o conjunto usado no incidente.
7. Registrar RPO real, RTO real, perdas/replays e ações corretivas.

## Testes de restauração

Executar um teste parcial mensal e um teste integral trimestral, além de repetir após mudança de versão PostgreSQL/Supabase, backend de Storage, política Restic ou secrets criptográficos.

O teste integral deve:

1. começar em máquina/conta diferente, sem arquivos do VPS;
2. usar apenas a segunda chave e o acesso S3 de recuperação;
3. escolher um snapshot aleatório retido, não apenas o mais recente;
4. executar `restic check --read-data` ao menos trimestralmente ou conforme custo aprovado;
5. restaurar DB, roles, pgsodium, Storage, config e Functions com egress bloqueado;
6. executar todos os testes de reconciliação e aplicação;
7. medir cada fase e comprovar RPO/RTO;
8. produzir evidência sem connection strings, secrets, SQL de jobs ou dados pessoais;
9. destruir/rotacionar com segurança os secrets materializados no laboratório.

Um `restic check` verde não substitui restore. Backup só é considerado restaurável depois de o serviço isolado subir e os testes de dados/Auth/Storage passarem.

## Fontes operacionais

- [Supabase: restore da plataforma para self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [PostgreSQL 17: pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
- [Restic: múltiplas chaves do repositório](https://restic.readthedocs.io/en/stable/070_encryption.html)
- [Restic: verificar integridade e consistência](https://restic.readthedocs.io/en/stable/045_working_with_repos.html#checking-integrity-and-consistency)
- [Restic: restaurar snapshots](https://restic.readthedocs.io/en/stable/050_restore.html)
