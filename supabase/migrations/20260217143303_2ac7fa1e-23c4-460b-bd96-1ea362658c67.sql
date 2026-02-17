
-- Limpar duplicatas existentes: manter apenas a sessão mais recente por usuário (sem logout)
DELETE FROM user_sessions
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM user_sessions
  WHERE logout_at IS NULL
  ORDER BY user_id, login_at DESC
)
AND logout_at IS NULL;

-- Função para limpeza de sessões antigas (mais de 30 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_user_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.user_sessions
  WHERE login_at < NOW() - INTERVAL '30 days';
END;
$$;
