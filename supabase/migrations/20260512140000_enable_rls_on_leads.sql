-- ============================================================
-- HOTFIX: Enable RLS on public.leads
-- ============================================================
-- Descoberto pelo teste de aceitacao em
-- supabase/tests/channel_access_control_test.sql:
-- a tabela `leads` estava com `rowsecurity = false`, deixando TODAS
-- as policies SELECT dormentes. Isso significa que o vazamento de
-- dados entre colaboradores era ainda pior do que a Spec descrevia
-- — qualquer authenticated user com query direta via supabase-js
-- recebia o conteudo inteiro da tabela, independentemente de policies.
--
-- mensagens_chat e mensagens_grupo ja estao com RLS habilitada.
-- Tambem forcamos RLS para garantir que mesmo conexoes via
-- service_role aplicariam policies se o role nao for o owner — mas
-- nesse projeto service_role bypassa, entao FORCE nao e essencial.
-- Mantemos so o ENABLE para nao quebrar webhooks/edges.

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
