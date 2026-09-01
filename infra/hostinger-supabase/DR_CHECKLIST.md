# Checklist de disaster recovery

Usar junto de `DISASTER_RECOVERY.md`. Este arquivo contém apenas evidência operacional; nunca registrar senhas, URIs, tokens, comandos de `cron.job` ou dados pessoais.

> O corte atual está em `managed-source-cold`; esta checklist **não está
> concluída** e não deve ser usada para afirmar backup recorrente. Enquanto os
> itens Restic permanecerem abertos, backup/manutenção ficam desativados e o
> healthcheck deve expor `backup=managed-source-cold`. Consulte
> [MANAGED_SOURCE_COLD_MODE.md](MANAGED_SOURCE_COLD_MODE.md).

## Prontidão antes do go-live

- [ ] RPO normal de até 7h e RTO provisório de até 4h aprovados pelo responsável do negócio.
- [ ] Repositório Restic fica fora da Hostinger e em conta administrativa separada do VPS.
- [ ] Bucket tem versionamento/Object Lock ou réplica imutável; exceção e risco formalizados se indisponível.
- [ ] `09-backup.sh --init-repository` concluiu e criou o primeiro snapshot com as duas tags.
- [ ] Timer de backup de 6h, manutenção semanal e healthcheck estão ativos; a unidade de retenção foi instalada, mas segue desabilitada e sem marcador antes do pós-cutover.
- [ ] `MAX_BACKUP_AGE_HOURS=8` está configurado e o canal de alerta foi testado.
- [ ] Snapshot contém `.crm-supabase-commit`, `.env`, `functions.env`, Functions, configs, dump/roles, pgsodium e Storage.
- [ ] `SHA256SUMS` do último `backup_id` passa.
- [ ] Foi adicionada uma segunda chave Restic com senha diferente da operacional.
- [ ] A segunda chave foi testada fora do VPS, sem `/etc/crm-supabase/restic-password`.
- [ ] Key ID e referência não secreta do escrow estão registrados; a senha não está no servidor/repo.
- [ ] Dois custodiantes conseguem recuperar a senha, o endpoint e o acesso S3 de recuperação.
- [ ] O escrow inclui Hostinger, Git, DNS, Vercel, OAuth/webhooks, contatos e MFA recovery.
- [ ] Configurações externas não cobertas pelo Restic têm export/procedimento de reconstrução.
- [ ] Existe espaço para staging + restore + banco/Storage e margem de 30 GB; no corte inicial, o gate usa 3.030.076.563 bytes de DB e 35.341.760 bytes de Storage migrado, não os 67.395.693.105 bytes descartados de `chat-media`.

## Verificação recorrente

- [ ] Último `.complete` tem menos de 8h e corresponde a uma execução sem alerta.
- [ ] `restic snapshots --tag crm-supabase` mostra a tag do `backup_id` esperado.
- [ ] Retenção diária/semanal/mensal corresponde à política aprovada.
- [ ] Manutenção semanal terminou com `restic check` verde.
- [ ] Capacidade e custo do repositório não ameaçam a retenção.
- [ ] Mudanças recentes de versão, secrets, compose, Functions e Storage estão no snapshot seguinte.
- [ ] Após o cutover, o timer horário de `chat-media` está enabled/active, o último sucesso tem menos de 150min e pertence ao mesmo restore/descarte.
- [ ] Backlog agregado de `chat-media` tem no máximo 4.000 elegíveis e zero objeto além de sete dias + 75min; nenhum nome/path aparece nos logs ou alertas.
- [ ] Um backup coordenado foi feito antes de cada mudança destrutiva.
- [ ] Key ID de recuperação ainda aparece em `restic key list`.
- [ ] Acesso dos custodiantes e MFA recovery foram revistos no trimestre.

## Ensaio de restauração

- [ ] Ticket, escopo, snapshot ID, `backup_id`, operadores e horários UTC registrados.
- [ ] Teste iniciou em host/conta limpa sem arquivos do VPS de produção.
- [ ] Somente a segunda chave e o acesso S3 de recuperação foram usados.
- [ ] Egress a integrações e entrada pública permaneceram bloqueados.
- [ ] `restic check` passou; `--read-data` foi executado no teste trimestral.
- [ ] Restore ocorreu em staging vazio, nunca diretamente em `/`.
- [ ] `sha256sum --check SHA256SUMS` passou.
- [ ] Commit e imagens coincidem com a versão fixada.
- [ ] `pgsodium_root.key` foi restaurado antes do banco e não apareceu em logs.
- [ ] Roles foram aplicadas; somente duplicatas Supabase previamente catalogadas foram aceitas.
- [ ] Archive restaurou com `--single-transaction --exit-on-error` em green descartável.
- [ ] `pg_cron` ficou sem worker, jobs foram desativados e `pg_net` foi reconciliado antes de egress.
- [ ] Configuração, Edge Functions e secrets necessários foram restaurados/rotacionados.
- [ ] Blobs foram restaurados com ownership e reconciliados com `storage.objects`.
- [ ] Em DR pós-cutover, novos objetos de `chat-media` presentes no snapshot foram restaurados normalmente; o descarte único da migração não foi reaplicado.
- [ ] Timer de retenção permaneceu desabilitado durante todo o restore/aceite isolado e só foi rearmado explicitamente depois do go-live.
- [ ] Contagens, constraints, sequências, owners, grants, extensões e RLS passaram.
- [ ] Login/senha/refresh/recovery/MFA passaram.
- [ ] Upload/download público e privado passaram.
- [ ] Realtime e smoke tests passaram sem efeito externo.
- [ ] RPO real e duração de cada fase foram medidos; RTO total ficou dentro da meta.
- [ ] Lacunas, ações corretivas e próximo teste têm responsável e prazo.
- [ ] Secrets do laboratório foram destruídos ou rotacionados ao terminar.

## Incidente real

- [ ] Comandante e linha do tempo UTC abertos.
- [ ] Escritas, webhooks, cron, imports e broadcasts foram bloqueados.
- [ ] Ambiente afetado, discos e logs foram preservados; nenhum reset/down-volume foi executado.
- [ ] Comprometimento de secrets foi classificado e a rotação está preparada.
- [ ] Snapshot exato foi escolhido por ID/hora/tags; `latest` não foi aceito cegamente.
- [ ] Intervalo potencial de perda e fontes de replay foram registrados.
- [ ] Novo KVM foi endurecido antes de containers/DNS.
- [ ] Staging, hashes, commit e conteúdo do conjunto foram validados.
- [ ] Restore DB/roles/pgsodium/Storage/config concluiu em destino isolado.
- [ ] Reconciliação e testes funcionais passaram.
- [ ] Go/no-go e ponto de não retorno foram assinados.
- [ ] DNS/Vercel, integrações e cron foram liberados gradualmente.
- [ ] Retenção de `chat-media` foi rearmada somente após uploads novos serem aceitos no destino, com marcador ligado ao restore validado.
- [ ] Monitoramento de 60min não mostrou regressão crítica.
- [ ] Novo backup off-site restaurável foi confirmado após a virada.
- [ ] RPO/RTO reais, perdas, replay e post-mortem foram registrados.
