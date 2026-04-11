-- ============================================================
-- FIX: Permitir user_id NULL na tabela subscriptions temporariamente
--
-- Problema: Auth Hook configurado no dashboard está tentando
-- inserir subscriptions com user_id NULL quando um novo usuário
-- é criado via admin.createUser()
--
-- Solução: Tornar user_id nullable e adicionar trigger para
-- preencher o user_id quando disponível
-- ============================================================

-- Remover constraint NOT NULL de user_id
ALTER TABLE public.subscriptions
ALTER COLUMN user_id DROP NOT NULL;

-- Adicionar coluna para rastrear pending_user_email
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS pending_user_email TEXT;

-- Criar índice para busca por email pendente
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_email
ON public.subscriptions(pending_user_email)
WHERE pending_user_email IS NOT NULL;

-- Função para atualizar user_id quando o usuário for criado
CREATE OR REPLACE FUNCTION public.update_subscription_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se o novo usuário tem email, atualizar subscriptions pendentes
  IF NEW.email IS NOT NULL THEN
    UPDATE public.subscriptions
    SET user_id = NEW.id,
        pending_user_email = NULL
    WHERE pending_user_email = NEW.email
      AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Criar trigger após insert em auth.users
DROP TRIGGER IF EXISTS trigger_update_subscription_user_id ON auth.users;
CREATE TRIGGER trigger_update_subscription_user_id
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_subscription_user_id();

-- Conceder permissões
GRANT EXECUTE ON FUNCTION public.update_subscription_user_id() TO supabase_auth_admin;

NOTIFY pgrst, 'reload schema';
