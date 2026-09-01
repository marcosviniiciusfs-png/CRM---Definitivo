-- Execute como o ultimo arquivo do restore e dentro da mesma transacao que
-- carrega data.sql. Assim nenhum job antigo fica ativo entre o COMMIT do dump
-- e a aplicacao de post-restore.sql.

DO $disable_restored_cron$
DECLARE
  affected_rows bigint;
  restored_job record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    affected_rows := 0;
    FOR restored_job IN SELECT jobid FROM cron.job LOOP
      PERFORM cron.unschedule(restored_job.jobid);
      affected_rows := affected_rows + 1;
    END LOOP;
    RAISE NOTICE '% job(s) restaurado(s) foram removidos preventivamente', affected_rows;
  END IF;

  -- pg_net persiste requests. Nunca transportar uma fila antiga: ela pode
  -- ser despachada assim que o worker iniciar, mesmo com o cron desativado.
  IF to_regclass('net.http_request_queue') IS NOT NULL THEN
    EXECUTE 'DELETE FROM net.http_request_queue';
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '% request(s) pendente(s) do pg_net foram descartados', affected_rows;
  END IF;

  IF to_regclass('net._http_response') IS NOT NULL THEN
    EXECUTE 'DELETE FROM net._http_response';
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '% resposta(s) historica(s) do pg_net foram descartadas', affected_rows;
  END IF;

  -- O historico nao e necessario no destino e pode conter comandos/URLs
  -- antigos. O inventario da origem guarda apenas metadados sanitizados.
  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE 'DELETE FROM cron.job_run_details';
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '% registro(s) historico(s) do cron foram descartados', affected_rows;
  END IF;
END
$disable_restored_cron$;
