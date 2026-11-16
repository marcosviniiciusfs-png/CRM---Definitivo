-- Fase 6 do plano docs/superpowers/plans/2026-11-16-kairoz-consorcio.md: entrar como usuário, para suporte.
--
-- - impersonation_logs: cada vez que um super admin (papel super_admin em user_roles) entra na conta
--   de alguém. Só a Edge Function impersonate-user grava (service role). Super admins leem.
-- - end_impersonation(): o próprio super admin marca o fim do acesso, uma vez só.
--
-- O painel de admin com senha própria (admin_credentials/admin_sessions) não participa disso.

CREATE TABLE IF NOT EXISTS public.impersonation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),
  CHECK (actor_user_id <> target_user_id),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_impersonation_logs_actor ON public.impersonation_logs (actor_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_target ON public.impersonation_logs (target_user_id, started_at DESC);

ALTER TABLE public.impersonation_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.impersonation_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.impersonation_logs TO authenticated;
GRANT ALL ON public.impersonation_logs TO service_role;

-- Confere user_roles direto (mesmo padrão de announcements), sem depender de outras funções de papel.
DROP POLICY IF EXISTS "Super admins leem os acessos de suporte" ON public.impersonation_logs;
CREATE POLICY "Super admins leem os acessos de suporte"
  ON public.impersonation_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'super_admin'
    )
  );
-- Sem políticas de escrita: INSERT só pela service role (Edge Function); fim só por end_impersonation().

CREATE OR REPLACE FUNCTION public.end_impersonation(p_log_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.impersonation_logs
     SET ended_at = now()
   WHERE id = p_log_id
     AND actor_user_id = auth.uid()
     AND ended_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  -- false quando já tinha terminado ou não é de quem chamou (não revela qual dos dois).
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.end_impersonation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_impersonation(uuid) TO authenticated, service_role;
