
-- Bug #5: Adicionar grant para service_role na função de tokens
GRANT EXECUTE ON FUNCTION public.get_facebook_token_by_integration(UUID) TO service_role;

-- Recarregar schema para garantir que a permissão entre em vigor
NOTIFY pgrst, 'reload schema';
