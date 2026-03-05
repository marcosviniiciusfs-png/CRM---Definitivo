-- ============================================================
-- BOOTSTRAP: Cria o primeiro administrador do painel
-- Email: mateusabcck@gmail.com
-- Senha: (deve ser definida manualmente via função abaixo)
-- ============================================================

-- Garantir que pgcrypto existe
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Inserir o primeiro admin (mateusabcck@gmail.com) caso não exista.
-- A senha inicial é: Kairoz@2026 (deve ser alterada depois via painel)
-- ALTERE ESTE VALOR ANTES DE RODAR EM PRODUÇÃO
DO $$
DECLARE
  v_initial_password TEXT := 'Kairoz@2026';
  v_hash TEXT;
BEGIN
  -- Só insere se ainda não existir admin nenhum
  IF NOT EXISTS (SELECT 1 FROM public.admin_credentials LIMIT 1) THEN
    v_hash := crypt(v_initial_password, gen_salt('bf', 10));
    INSERT INTO public.admin_credentials (email, password_hash)
    VALUES ('mateusabcck@gmail.com', v_hash);
    
    RAISE NOTICE 'Admin inicial criado: mateusabcck@gmail.com / Kairoz@2026';
    RAISE NOTICE 'IMPORTANTE: Altere a senha pelo painel admin após o primeiro login!';
  ELSE
    RAISE NOTICE 'Admin já existe. Nenhum admin inicial foi criado.';
  END IF;
END $$;
