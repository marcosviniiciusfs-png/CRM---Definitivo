# Corte final em um comando

O orquestrador [Invoke-CrmProductionCutover.ps1](./Invoke-CrmProductionCutover.ps1)
está fixado exclusivamente no checkout `CRM---Definitivo`, projeto Supabase
`uxttihjsxfowursjyult`, VPS `103.199.185.97`, API
`https://api.kairozcrm.com.br` e projeto Vercel
`kairozs-projects/crm-definitivo`. Essas identidades não são parâmetros.

## Preflight sem alteração remota

```powershell
./infra/hostinger-supabase/Invoke-CrmProductionCutover.ps1 -Preflight
```

Esse modo compila o frontend localmente e faz somente leituras da Vercel, DNS,
HTTPS e VPS. Ele exige que as chaves Meta, Evolution e migração já
estejam nos arquivos protegidos do servidor. O corte atual usa o modo explícito
`managed-source-cold`; portanto, não exige repositório ou chaves Restic e não
afirma que exista backup recorrente dos novos dados da VPS. Google, Mercado Pago e Resend
ficam fora do corte. `sync-google-sheets` permanece inativa.

Para o Storage, o preflight valida Node.js 20+, o import local do
`@supabase/supabase-js` fixado no lockfile e a presença, no `migration.env`
protegido da VPS, de `SOURCE_SUPABASE_URL`, `SOURCE_SERVICE_ROLE_KEY`,
`TARGET_SUPABASE_URL` e `TARGET_SERVICE_ROLE_KEY`. Credenciais S3 não são
necessárias para o comando automático.

O gate remoto também executa `11-freeze-source.sh --preflight`: ele prova a
conexão TLS, identidade do banco, privilégios de freeze/rollback, `pg_cron` e
filas pendentes sem alterar a origem. No comando confirmado, a release auditada
é sincronizada atomicamente antes desse gate, permitindo o corte em um comando
mesmo quando a VPS ainda está com a versão anterior do kit.
O `-Preflight` isolado pressupõe que essa mesma release já esteja em
`/opt/crm-migration-kit`; se ainda não estiver, use o comando confirmado, que
sincroniza a release antes de executar o mesmo gate e para antes da manutenção
caso qualquer leitura falhe.

O preflight também exige o `FACEBOOK_WEBHOOK_VERIFY_TOKEN` histórico. No corte,
esse token é testado contra o callback blue antes de qualquer mudança; a Meta
é então testada contra o callback green, inventariada e alterada com snapshot.
Se o token não for o histórico, a virada falha antes do `POST` à Meta.

Antes da janela, prepare e implante o oráculo one-time descrito em
[META_TOKEN_REWRAP.md](./META_TOKEN_REWRAP.md). O preflight exige exatamente a
Function `meta-token-rewrap` ativa com `verify_jwt=false`, os dois secrets
temporários no projeto managed e o bearer `0600` na VPS. O
`GOOGLE_CALENDAR_ENCRYPTION_KEY` existe na VPS somente durante o rewrap dos
tokens Meta históricos; isso não reativa Google Calendar nem qualquer cron
Google e a chave é removida antes de iniciar as Functions.

O handoff `0600` também registra somente os digests retornados pela API managed.
O preflight compara esses digests com os dois artefatos temporários atuais; o
cleanup recusa apagar qualquer secret rotacionado ou sem essa proveniência.

## Comando de produção

Depois de `PREFLIGHT PASS`:

```powershell
./infra/hostinger-supabase/Invoke-CrmProductionCutover.ps1 `
  -Confirm PODE_COLOCAR_EM_PRODUCAO
```

O fluxo captura o deploy blue, publica manutenção, congela a origem, exporta o
snapshot final, arquiva o ensaio, restaura um green limpo, descarta somente o
histórico de `chat-media`, copia e verifica os outros buckets pela API do
Supabase Storage, valida o backend fechado,
vira Evolution e Meta, ativa e observa somente os dois crons aprovados, arma a
retenção de sete dias e só então libera o frontend. `frontend_live` é a
fronteira irreversível e fica no penúltimo estágio.

Antes do run, o orquestrador exige a aprovação persistente e protegida
`/etc/crm-supabase/managed-source-cold-approved`, root/`0600`, ligada ao projeto
`uxttihjsxfowursjyult` e ao modo `managed-source-cold`. Ela não depende do run
ou do restore. Com esse modo, os timers de backup e manutenção Restic
ficam desativados; healthcheck e retenção ficam ativos. O marcador final de
produção registra também `recurring_backup=disabled`. Consulte
[MANAGED_SOURCE_COLD_MODE.md](./MANAGED_SOURCE_COLD_MODE.md).

A cópia é executada por `scripts/copy-storage.mjs --verify` na workstation. As
duas URLs e as duas `service_role` são lidas do arquivo protegido na VPS pelo
canal SSH, permanecem somente em memória durante o handoff e são entregues pelo
ambiente do processo Node; não são gravadas em arquivo, passadas em argv ou
impressas. O script exclui
`chat-media`, exige esse bucket vazio no destino, faz `upsert` dos paths
preservados e só conclui com exit code zero e verificação sem falhas. As 94
mídias do ensaio são referência de capacidade, não uma contagem hardcoded para
o corte final. `06-sync-storage-rclone.sh` fica disponível somente como
contingência manual previamente configurada e não exige que o corte automático
tenha credenciais S3.

Antes de virar o primeiro callback, o orquestrador captura o WAL LSN do green.
Callbacks e crons também podem gerar escrita ou efeito externo mesmo com a tela
em manutenção. Por isso, dali até `frontend_live`, o rollback automático só é
permitido se o WAL continuar exatamente no LSN capturado; qualquer avanço mantém
a manutenção e exige reconciliação, em vez de abandonar leads/mensagens no green.

Depois do restore final, o corte recaptura as contagens de ciphertexts com
`17-rewrap-meta-tokens.sh --inventory`, exige `invalid=0`, executa dry-run e
rewrap transacional com os números recapturados e valida o marcador contra o
hash daquele restore. Nenhum default do ensaio é aceito. Antes de iniciar as
Edge Functions da VPS, o bearer, a Function temporária e a cópia managed da
chave Meta são removidos e a ausência é novamente inventariada.
Antes da remoção, o fluxo recomputa sem imprimir valores os SHA-256 das duas
chaves e valida as novas métricas do marker (`meta_valid=N`, `fallback_valid=0`).
A remoção do fallback tem marker remoto retomável; o start das Functions e a
liberação final exigem a chave Meta vinculada e a ausência exata do fallback.

A contagem final de `auth.users` é extraída do dump congelado e passada ao gate
como `expected_auth_users`. Checkpoints não contêm secrets. A `ANON_KEY` percorre
VPS → memória → stdin da Vercel sem arquivo local, log ou argumento de processo.
A chave pública blue atual é reidentificada no bundle pelo `ref/role/issuer` e
guardada somente como blob DPAPI vinculado ao usuário Windows. Isso permite
restaurar transacionalmente URL, chave e modo de manutenção; o blob é apagado
após sucesso ou rollback concluído.

## Retomada

Cada etapa possui checkpoint em `.crm-cutover-state/<RUN_ID>` e ponteiros root
na VPS em `/var/backups/crm-supabase/orchestrator/<RUN_ID>`. Após uma falha
corrigível, use o mesmo id impresso:

```powershell
./infra/hostinger-supabase/Invoke-CrmProductionCutover.ps1 `
  -Confirm PODE_COLOCAR_EM_PRODUCAO `
  -ResumeRunId <RUN_ID>
```

Não inicie outro run depois do freeze ou do reset do green.
O orquestrador mantém locks local e remoto; depois que o lease remoto é criado,
uma falha de preflight deve ser retomada com o mesmo `RUN_ID`, nunca com outro.
Se qualquer ação de rollback chegar a iniciar, o run fica permanentemente na
direção de rollback: `-ResumeRunId` é recusado e somente `-Rollback` pode
convergir as subetapas restantes.
Os fingerprints SHA-256 do kit, das 96 Functions e das fontes do frontend são
capturados no começo e revalidados antes/depois da sincronização e de cada
deploy; alterar a release no meio do mesmo run é recusado.
Se a conexão cair exatamente durante uma virada de callback, a retomada recupera
o snapshot `APPLIED` pelo marcador persistente e seu checksum. Sem uma prova
única de conclusão, ela para em manutenção e não presume que Meta/Evolution
foram restaurados.

## Rollback antes de liberar escrita no green

```powershell
./infra/hostinger-supabase/Invoke-CrmProductionCutover.ps1 `
  -Rollback -RunId <RUN_ID> `
  -ConfirmRollback VOLTAR_PARA_SUPABASE
```

O rollback restaura primeiro Meta e Evolution pelos snapshots, depois o estado
exato de escrita/cron da origem, restaura o trio de envs blue da Vercel e por
último promove o deploy blue capturado. Cada subetapa tem checkpoint retomável.
Se algum worker target chegou a iniciar, o rollback fecha `pg_cron`, drena
`pg_net`, desativa os timers de retenção/health, arquiva seu marcador e para
Functions/API green antes da comparação WAL final e da reabertura da origem.
O rollback também revoga o oráculo Meta temporário antes de reabrir a origem.
As subetapas independentes continuam sendo tentadas e mantêm checkpoints mesmo
se uma delas falhar; porém a origem só é reaberta e o blue só é promovido quando
oráculo, callbacks e workers tiverem convergido. Em caso contrário, o lease e o
alias atual são preservados para uma retomada segura.
Ele é recusado após `frontend_live` ou se a promoção green chegou a iniciar,
pois nesse ponto podem existir escritas no green e voltar exige reconciliação
com RPO/RTO próprios.

Qualquer falha anterior à janela de callbacks/crons dispara rollback global
automático. Durante essa janela ele ainda tenta o rollback se a prova de WAL
mostrar zero escrita; depois da promoção green ele é recusado. O erro original
é preservado. Se a ausência de divergência não puder ser provada, o fluxo falha
fechado e mantém a manutenção. Após sucesso, o Supabase gerenciado permanece
congelado indefinidamente como cópia fria de rollback.

## Fontes da automação Meta

O estágio Meta segue o contrato oficial `/APP_ID/subscriptions`: captura a
subscription `page`, preserva todos os fields atuais (incluindo `leadgen`) e usa
o challenge de verificação antes de aplicar/rollback. Referências:

- [sample oficial Meta Lead Ads](https://github.com/fbsamples/lead-ads-webhook-sample/blob/main/postman/FB%20Lead%20Ads%20%28Part%201%20-%20The%20Webhook%29.postman_collection.json)
- [documentação Meta de Webhooks](https://developers.facebook.com/docs/graph-api/webhooks/)
