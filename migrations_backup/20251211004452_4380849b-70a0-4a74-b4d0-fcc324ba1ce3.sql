-- Habilitar extensão pgcrypto para criptografia
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recriar funções de criptografia usando a extensão corretamente
CREATE OR REPLACE FUNCTION public.encrypt_oauth_token(plain_token text, encryption_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF plain_token IS NULL OR plain_token = '' THEN
    RETURN NULL;
  END IF;
  -- Usar AES-256 via pgp_sym_encrypt
  RETURN encode(extensions.pgp_sym_encrypt(plain_token::bytea, encryption_key, 'cipher-algo=aes256'), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_oauth_token(encrypted_token text, encryption_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN
    RETURN NULL;
  END IF;
  -- Descriptografar usando pgp_sym_decrypt
  RETURN convert_from(extensions.pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key), 'UTF8');
EXCEPTION
  WHEN OTHERS THEN
    -- Se falhar a descriptografia (token antigo não criptografado), retornar como está
    RETURN encrypted_token;
END;
$$;