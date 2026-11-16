-- Workspaces e vínculos são provisionados somente pelo fluxo administrativo.
-- Impede que um usuário autenticado sem organização invoque o RPC diretamente.
REVOKE ALL ON FUNCTION public.ensure_user_organization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_user_organization() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_user_organization() FROM authenticated;

-- Edge Functions administrativas continuam podendo usar o RPC com a service role.
GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO service_role;
