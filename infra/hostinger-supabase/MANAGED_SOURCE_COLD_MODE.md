# Modo de backup `managed-source-cold`

Este é o modo de produção aprovado para o corte atual. O projeto Supabase
gerenciado fica congelado no ponto `T0` e preservado como cópia fria de
rollback. Ele **não** recebe os dados criados ou alterados na VPS depois do
corte e **não é um backup recorrente da VPS**.

Consequência aceita: enquanto não houver Restic/off-site ou outra replicação,
uma perda da VPS pode causar a perda de todos os dados confirmados depois de
`T0`. O modo não oferece PITR, RPO recorrente nem proteção contra perda total da
VPS. A origem gerenciada também não deve ser descongelada, receber callbacks,
executar cron ou voltar a aceitar gravações enquanto for a cópia fria.

## Contrato operacional

O nome canônico do modo é exatamente `managed-source-cold`. Nesse modo:

| Unidade systemd | Estado exigido |
| --- | --- |
| `crm-supabase-backup.timer` | `disabled` e inativa |
| `crm-supabase-maintenance.timer` | `disabled` e inativa |
| `crm-supabase-health.timer` | `enabled` e ativa |
| `crm-supabase-chat-media-retention.timer` | `enabled` e ativa após o gate de retenção |

O healthcheck continua validando containers, API, HTTPS, banco, cron, `pg_net`,
Storage, disco, inodes e a retenção de sete dias. Ele deve validar que os timers
de backup e manutenção permanecem desligados. Somente nesse modo ele deixa de
exigir dump local recente e snapshot Restic; sua linha final precisa informar
explicitamente `backup=managed-source-cold`, para que um `Healthcheck OK`
nunca seja interpretado como existência de backup recorrente.

## Evidência de aprovação

O instalador não pode inferir esse modo a partir de secrets Restic vazios ou de
uma falha do repositório. Antes do run, a autorização persistente do projeto é
gravada no marcador exato
`/etc/crm-supabase/managed-source-cold-approved`, que deve:

- ser arquivo regular, nunca symlink, pertencente a `root` e modo `0600`;
- registrar `status=approved` e `mode=managed-source-cold`;
- registrar `project_ref=uxttihjsxfowursjyult`;
- registrar `approved_at_utc` válido;
- ser rejeitado se pertencer a outro projeto ou modo.

O marcador é uma autorização persistente por projeto/modo e existe antes do
run; por isso, não contém nem depende de `run_id` ou restore. Ele autoriza apenas
o estado dos timers. Ele não prova que
exista backup da VPS e não pode ser descrito como snapshot, backup ou cópia
off-site.

O marcador final `.crm-production-cutover-complete` deve repetir e validar:

```text
backup_mode=managed-source-cold
recurring_backup=disabled
```

Assim, retomadas e auditorias não podem confundir esse corte com o modo
`restic-offsite`. Ao configurar um destino recorrente posteriormente, executar
um backup e um restore isolado completos antes de mudar ambos os marcadores e
habilitar os timers de backup/manutenção.
