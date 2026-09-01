# Migração do Kairoz CRM para Hostinger KVM 4

> Incidente de segurança: antes do cutover, executar o plano de contenção e rotação em [SECURITY_INCIDENT.md](SECURITY_INCIDENT.md). O destino não deve reutilizar as credenciais expostas no histórico público.

Este diretório contém a preparação executável para migrar exclusivamente o checkout `CRM---Definitivo` e o projeto Supabase `uxttihjsxfowursjyult` para um VPS Hostinger KVM 4. O frontend permanece na Vercel e passa a consumir `https://api.kairozcrm.com.br`. Qualquer divergência de checkout ou project ref deve falhar fechado.

> Estado atual: inventário live sanitizado capturado e automações preparadas; nenhuma credencial foi incluída e nenhuma alteração foi feita na produção.

Após o aceite, a operação passa integralmente para a VPS. A origem gerenciada permanece congelada e preservada por prazo indeterminado como cópia fria de rollback, sem cron, callbacks, webhooks ou novas gravações. O corte atual usa explicitamente o modo [`managed-source-cold`](MANAGED_SOURCE_COLD_MODE.md): backup e manutenção Restic ficam desativados, enquanto healthcheck e retenção continuam ativos. Como a origem não receberá as mudanças feitas depois de `T0`, não existe backup recorrente dos novos dados da VPS neste modo; esse risco foi aceito para o go-live atual.

## Decisão de arquitetura

O CRM não usa apenas PostgreSQL. Ele depende de Auth, PostgREST/RLS, Realtime, Storage, Edge Functions, `pg_cron` e `pg_net`. O destino precisa ser uma stack Supabase self-hosted completa.

```text
Usuários
   |
   v
Vercel: www.kairozcrm.com.br
   |
   v
Hostinger DNS: api.kairozcrm.com.br
   |
   v
Caddy :443 (TLS automático)
   |
   v
Supabase self-hosted v0.8.0
   |-- Auth
   |-- PostgREST + RLS
   |-- Realtime/WebSocket
   |-- Storage
   |-- 96 Edge Functions inventariadas
   `-- PostgreSQL 17
          |
          |-- healthcheck e retenção de chat-media
          `-- sem backup recorrente no modo atual
```

### Versões fixadas

- Supabase self-hosted: `self-hosted/v0.8.0`
- Objeto da tag oficial: `e1af732589cd468edb49500ebc04e4367d4c56ad`
- Commit efetivo da release: `241bb11c0627f2981746d37033f57dbfa81d29b0`
- PostgreSQL do compose oficial: `17.6.1.136`
- PostgreSQL observado na origem: `17.6.1.113`
- Supabase CLI preparada: `2.116.0`
- Imagem de dump da CLI: `supabase/postgres:17.6.1.165`, fixada pelo digest multi-arquitetura em `versions.conf`

Auth e Storage na origem gerenciada (`v2.195.0` e `v1.71.0`) estão à frente das imagens do release self-hosted (`v2.189.0` e `v1.60.4`). Por isso, o ensaio e o gate estrutural descrito em [COMPATIBILITY_GATE.md](COMPATIBILITY_GATE.md) são obrigatórios antes de qualquer restore final.

O primeiro `02-prepare-stack.sh` faz o pull e grava atomicamente `.crm-image-manifest` com image IDs e RepoDigests. Reexecuções apenas validam as imagens locais contra esse manifesto e nunca fazem pull. Se uma imagem estiver ausente, divergir ou o primeiro preparo tiver sido interrompido, restaurar o snapshot green limpo ou reprovisionar um green novo e aprovar um novo manifesto; não apagar ou substituir o manifesto no destino atual.

Não atualizar imagens ou o tag no meio da migração. Atualizações entram apenas depois do período de estabilização e de um backup restaurável.

## Capacidade do KVM 4

Na data do planejamento, o plano oferece 4 vCPU, 16 GB RAM, 200 GB NVMe e 16 TB de tráfego. A recomendação oficial do Supabase para uma carga pequena/média é 4 CPU, 8 GB+ e 80 GB+ de SSD. A capacidade de RAM é adequada; o go-live depende de confirmar que:

- banco + índices + Storage + WAL + folga usam no máximo 60% do disco;
- existe ao menos 2x o tamanho do banco livre durante restore/upgrade;
- backups saem do VPS para um repositório off-site;
- a carga real cabe em 4 vCPU no ensaio.

Um único KVM 4 não oferece alta disponibilidade. Falha do host/VPS causa indisponibilidade até restauração ou reprovisionamento.

### Inventário live e dimensionamento do corte

Inventário sanitizado da origem `uxttihjsxfowursjyult` (recapturar no freeze
final, pois a origem continua ativa até a janela):

| Componente | Objetos/usuários | Bytes | Decisão no destino |
| --- | ---: | ---: | --- |
| PostgreSQL | - | 3.030.076.563 | restaurar integralmente |
| Auth | 344 usuários | - | preservar e validar contagem |
| `activity-attachments` privado | 7 | 845.196 | copiar |
| `avatars` público, limite 5.242.880 | 82 | 31.466.567 | copiar e preservar configuração |
| `chat-media` público | 134.783 | 67.395.693.105 | não copiar; preservar bucket vazio |
| `team-avatars` público | 5 | 3.029.997 | copiar |

O Storage efetivamente migrado soma 94 objetos e 35.341.760 bytes
(aproximadamente 35 MB decimais/33,7 MiB). A exclusão aprovada de `chat-media`
evita transferir 67.395.693.105 bytes. O dump do banco ainda contém os
metadados históricos; eles são removidos em transação somente no destino, após
o restore, com contagem exata e confirmação explícita. A origem nunca é limpa.

No corte automático, `scripts/copy-storage.mjs` copia e verifica esses buckets
pela API oficial do Supabase Storage. O orquestrador roda o Node.js na
workstation, recebe as duas URLs e as duas `service_role` pelo canal SSH a partir
do `migration.env` protegido da VPS e as entrega somente pelo ambiente do
processo filho. Nenhum valor secreto vai para arquivo local, argumento de
processo ou log. O preflight exige Node.js 20+ e a dependência
`@supabase/supabase-js` fixada pelo lockfile. Credenciais S3 não são requisito
do fluxo automático; `06-sync-storage-rclone.sh` permanece apenas como opção
manual de contingência, a ser preparada e validada separadamente.

Depois do go-live, `chat-media` continua público e aceita uploads novos, mas
esses objetos são temporários: `13-chat-media-retention.sh` seleciona por SQL
**somente leitura** os nomes cujo `COALESCE(updated_at, created_at)` já passou de
sete dias e solicita a exclusão física + metadado exclusivamente à Storage API.
O worker roda a cada hora, com jitter de até cinco minutos. Em operação normal,
a janela nominal é sete dias mais até aproximadamente 70 minutos; 75 minutos é
o limiar operacional de alerta, não uma garantia absoluta. A
API é acessada apenas pela rede Docker interna em `api-gw:8000`, que não pode
ter porta publicada, e a `SERVICE_ROLE_KEY` é lida do `.env` root-owned sem ir
para argv ou logs. Lotes têm 250 objetos (máximo aceito: 1.000) e cada execução
para em 2.000; logs e healthcheck expõem somente contagens agregadas.

O timer é instalado desabilitado. Ele só pode ser armado após o cutover, por
confirmação explícita, quando `.crm-last-restore`,
`.crm-chat-media-discarded` e o novo marcador de ativação apontarem para o mesmo
restore. Sem esse marcador, o healthcheck não exige timer nem último sucesso.
O instalador mantém tanto a retenção quanto o healthcheck automático de produção
inativos até essa autorização; uma verificação manual falha se encontrar o timer
de retenção ligado sem marcador. Uma colisão com backup apenas adia a rodada;
sucesso antigo e backlog persistente
são detectados nas próximas verificações. Nada nessa rotina conecta ou escreve
na origem gerenciada.

O inventário também encontrou três jobs ativos: `send-scheduled-reminders`
(`* * * * *`), `auto-redistribute-leads` (`*/5 * * * *`) e
`sync-google-sheets` (`*/2 * * * *`). O pós-restore recria os três com endpoint
interno e segredo no Vault, mas mantém todos inativos. A liberação é allowlisted,
confirmada e feita um job por vez; `sync-google-sheets` possui um gate adicional
até sua função recuperada ser auditada e implantada.

Com esse escopo, o gate conservador `2 × banco + Storage migrado + 30 GB`
exige aproximadamente 36,1 GB livres. O filesystem do KVM observado tinha
aproximadamente 179 GB livres, portanto há margem ampla para dump, restore,
WAL e staging. O ensaio continua obrigatório para medir CPU, I/O e duração.

## Conteúdo

- [RUNBOOK.md](RUNBOOK.md): sequência de ensaio, corte, aceite e rollback.
- [COMPATIBILITY_GATE.md](COMPATIBILITY_GATE.md): divergências managed/self-host e gate obrigatório antes do restore.
- [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md): backup coordenado, escrow independente, restore integral e RPO/RTO.
- [MANAGED_SOURCE_COLD_MODE.md](MANAGED_SOURCE_COLD_MODE.md): exceção aprovada para o corte atual, timers e evidências que impedem fingir backup recorrente.
- [DR_CHECKLIST.md](DR_CHECKLIST.md): prontidão, ensaio trimestral e execução de desastre.
- [ACCESS_CHECKLIST.md](ACCESS_CHECKLIST.md): acessos e decisões necessários antes da execução.
- [META_TOKEN_REWRAP.md](META_TOKEN_REWRAP.md): rewrap temporário e transacional dos tokens Meta sem expor plaintext.
- `config/`: override Docker, tuning conservador e modelos de variáveis.
- `scripts/`: bootstrap, instalação, export, restore, Storage, backup, smoke tests e freeze/unfreeze reversível da origem.
- `sql/`: inventário, configuração pós-restore e comparação.
- `runtime/`: gateway de Edge Functions com política JWT por função.
- `systemd/`: timers de backup, health check e retenção horária de `chat-media`.

## Ordem de execução quando os acessos chegarem

1. Preencher [ACCESS_CHECKLIST.md](ACCESS_CHECKLIST.md) sem registrar senhas no Git ou no chat.
2. Executar inventário somente leitura na origem.
3. Provisionar e endurecer o KVM 4.
4. Criar `api.kairozcrm.com.br` apontando para o IP do VPS.
5. Copiar o kit e `supabase/functions/` para `/opt/crm-migration-kit/app-functions/`, instalar a stack isolada e preencher os arquivos secretos no servidor.
6. Para o corte atual, validar o modo `managed-source-cold` conforme [MANAGED_SOURCE_COLD_MODE.md](MANAGED_SOURCE_COLD_MODE.md). Não habilitar os timers de backup/manutenção nem declarar RPO recorrente. Restic, segunda chave e [DR_CHECKLIST.md](DR_CHECKLIST.md) voltam a ser obrigatórios antes de mudar para `restic-offsite`.
7. Fazer um ensaio completo de dump/restore, descarte target-only de `chat-media`
   e cópia/verificação dos três buckets preservados pela mesma API usada no
   corte automático.
8. Executar os testes funcionais e medir a duração real.
9. Restaurar o snapshot de green limpo criado antes do ensaio e revalidar o ambiente; o restore final não reutiliza o banco ensaiado.
10. Agendar a janela com a duração do ensaio + 50% de margem.
11. Ensaiar `11-freeze-source.sh`/`12-unfreeze-source.sh` antes da janela; no Supabase gerenciado, a role disponível pode não conseguir alterar o banco ou encerrar sessões internas protegidas.
12. Executar o cutover conforme [RUNBOOK.md](RUNBOOK.md).

## Regras de segurança

- Não colar senhas, chaves privadas, connection strings ou service-role keys no chat.
- Nesta implantação, a autenticação SSH por senha permanece habilitada para `root` e `hurtz` por decisão explícita do responsável; chaves SSH continuam preferenciais. Proteger com UFW e Fail2ban e nunca registrar a senha no repositório ou na documentação.
- Manter somente 22 (restrito quando possível), 80 e 443 no firewall Hostinger.
- Não publicar 5432, 6543, 8000 ou o socket Docker.
- Nunca executar `reset.sh` ou `docker compose down -v` na instalação de produção.
- Todo artefato de dump deve ficar com modo `0600`, hash SHA-256 e cópia criptografada off-site.
- A senha operacional do Restic no VPS não é escrow. Manter uma segunda chave e acesso de recuperação testados fora do VPS e do próprio bucket.
- O export da origem nunca envia a URI real à CLI ou ao Docker: a CLI fixada gera os filtros com endpoint fictício e a execução usa CA montado + libpq `verify-full`.

## Fontes técnicas

- [Supabase self-hosted com Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Restore da plataforma para self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Cópia opcional de Storage via S3/rclone](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3)
- [Remoção de objetos pela Storage API](https://supabase.com/docs/guides/storage/management/delete-objects)
- [Proxy HTTPS oficial](https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https)
- [SSL do PostgreSQL no Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement)
- [Múltiplas chaves Restic](https://restic.readthedocs.io/en/stable/070_encryption.html)
- [Hostinger KVM 4](https://www.hostinger.com/br/servidor-vps)
