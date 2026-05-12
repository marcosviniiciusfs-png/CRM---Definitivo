-- ============================================================
-- channel_access_control_test.sql
-- Acceptance test for RLS-based channel access control.
-- Runs inside a single transaction that ROLLS BACK at the end
-- so no data is left in production.
--
-- Returns a result set with pass/fail per assertion.
-- A status = 'FAIL' means a bug in Task 1 or Task 2.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1.  Insert auth.users (trigger handle_new_user needs email)
-- ─────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, is_sso_user, is_anonymous)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@testacme.test',  false, false),
  ('22222222-2222-2222-2222-222222222222', 'admin@testacme.test',  false, false),
  ('33333333-3333-3333-3333-333333333333', 'm1@testacme.test',     false, false),
  ('44444444-4444-4444-4444-444444444444', 'm2@testacme.test',     false, false)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2.  Organization
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.organizations (name)
VALUES ('TestAcme');

CREATE TEMP TABLE t_org AS
SELECT id AS org_id FROM public.organizations WHERE name = 'TestAcme' LIMIT 1;

-- ─────────────────────────────────────────────────────────────
-- 3.  Organization members
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT org_id, '11111111-1111-1111-1111-111111111111', 'owner'  FROM t_org;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT org_id, '22222222-2222-2222-2222-222222222222', 'admin'  FROM t_org;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT org_id, '33333333-3333-3333-3333-333333333333', 'member' FROM t_org;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT org_id, '44444444-4444-4444-4444-444444444444', 'member' FROM t_org;

-- ─────────────────────────────────────────────────────────────
-- 4.  WhatsApp instances (channels CA and CB)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.whatsapp_instances (id, user_id, organization_id, instance_name, status)
SELECT 'aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', org_id, 'CA', 'CONNECTED'
FROM t_org;

INSERT INTO public.whatsapp_instances (id, user_id, organization_id, instance_name, status)
SELECT 'bbbb2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', org_id, 'CB', 'CONNECTED'
FROM t_org;

-- ─────────────────────────────────────────────────────────────
-- 5.  Channel members: M1 -> CA, M2 -> CB
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.whatsapp_channel_members (whatsapp_instance_id, user_id, organization_id)
SELECT 'aaaa1111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', org_id
FROM t_org;

INSERT INTO public.whatsapp_channel_members (whatsapp_instance_id, user_id, organization_id)
SELECT 'bbbb2222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', org_id
FROM t_org;

-- ─────────────────────────────────────────────────────────────
-- 6.  Leads
--   L_CA     : channel CA, no responsavel
--   L_CB     : channel CB, no responsavel
--   L_NULL   : no channel
--   L_M1RESP : channel CB, M1 is responsavel
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.leads (id, organization_id, telefone_lead, nome_lead, whatsapp_instance_id, responsavel_user_id)
SELECT 'cccc1111-1111-1111-1111-111111111111', org_id, '+5511000000001', 'Lead CA',     'aaaa1111-1111-1111-1111-111111111111', NULL
FROM t_org;

INSERT INTO public.leads (id, organization_id, telefone_lead, nome_lead, whatsapp_instance_id, responsavel_user_id)
SELECT 'cccc2222-2222-2222-2222-222222222222', org_id, '+5511000000002', 'Lead CB',     'bbbb2222-2222-2222-2222-222222222222', NULL
FROM t_org;

INSERT INTO public.leads (id, organization_id, telefone_lead, nome_lead, whatsapp_instance_id, responsavel_user_id)
SELECT 'cccc3333-3333-3333-3333-333333333333', org_id, '+5511000000003', 'Lead NULL',   NULL,                                   NULL
FROM t_org;

INSERT INTO public.leads (id, organization_id, telefone_lead, nome_lead, whatsapp_instance_id, responsavel_user_id)
SELECT 'cccc4444-4444-4444-4444-444444444444', org_id, '+5511000000004', 'Lead M1Resp', 'bbbb2222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'
FROM t_org;

-- ─────────────────────────────────────────────────────────────
-- 7.  Group messages: G_CA on CA, G_CB on CB
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.mensagens_grupo (organization_id, whatsapp_instance_id, group_id, corpo_mensagem, direcao)
SELECT org_id, 'aaaa1111-1111-1111-1111-111111111111', 'group-ca@g.us', 'Hello CA', 'ENTRADA'
FROM t_org;

INSERT INTO public.mensagens_grupo (organization_id, whatsapp_instance_id, group_id, corpo_mensagem, direcao)
SELECT org_id, 'bbbb2222-2222-2222-2222-222222222222', 'group-cb@g.us', 'Hello CB', 'ENTRADA'
FROM t_org;

-- ─────────────────────────────────────────────────────────────
-- 8.  SECURITY DEFINER runner that can write to temp table
--     regardless of the role switching below.
-- ─────────────────────────────────────────────────────────────

CREATE TEMP TABLE t_results (
  label        text,
  expected_val int,
  actual_val   int,
  status       text
);

GRANT INSERT, SELECT ON t_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.check_eq(p_label text, p_expected int, p_actual int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO t_results (label, expected_val, actual_val, status)
  VALUES (
    p_label,
    p_expected,
    p_actual,
    CASE WHEN p_expected = p_actual THEN 'PASS' ELSE 'FAIL' END
  );
END $$;

-- ─────────────────────────────────────────────────────────────
-- 9.  Switch to authenticated and run assertions per user
-- ─────────────────────────────────────────────────────────────
SET LOCAL role authenticated;

-- ── Owner (11111111) ──────────────────────────────────────────
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111"}';

SELECT pg_temp.check_eq(
  'Owner | leads',
  4,
  (SELECT count(*)::int FROM public.leads
   WHERE id IN (
     'cccc1111-1111-1111-1111-111111111111',
     'cccc2222-2222-2222-2222-222222222222',
     'cccc3333-3333-3333-3333-333333333333',
     'cccc4444-4444-4444-4444-444444444444'
   ))
);

SELECT pg_temp.check_eq(
  'Owner | mensagens_grupo',
  2,
  (SELECT count(*)::int FROM public.mensagens_grupo
   WHERE whatsapp_instance_id IN (
     'aaaa1111-1111-1111-1111-111111111111',
     'bbbb2222-2222-2222-2222-222222222222'
   ))
);

-- ── Admin (22222222) — no channel memberships ─────────────────
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222"}';

SELECT pg_temp.check_eq(
  'Admin | leads',
  1,
  (SELECT count(*)::int FROM public.leads
   WHERE id IN (
     'cccc1111-1111-1111-1111-111111111111',
     'cccc2222-2222-2222-2222-222222222222',
     'cccc3333-3333-3333-3333-333333333333',
     'cccc4444-4444-4444-4444-444444444444'
   ))
);

SELECT pg_temp.check_eq(
  'Admin | mensagens_grupo',
  0,
  (SELECT count(*)::int FROM public.mensagens_grupo
   WHERE whatsapp_instance_id IN (
     'aaaa1111-1111-1111-1111-111111111111',
     'bbbb2222-2222-2222-2222-222222222222'
   ))
);

-- ── M1 (33333333) — member of CA only ─────────────────────────
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333"}';

SELECT pg_temp.check_eq(
  'M1 | leads',
  3,
  (SELECT count(*)::int FROM public.leads
   WHERE id IN (
     'cccc1111-1111-1111-1111-111111111111',
     'cccc2222-2222-2222-2222-222222222222',
     'cccc3333-3333-3333-3333-333333333333',
     'cccc4444-4444-4444-4444-444444444444'
   ))
);

SELECT pg_temp.check_eq(
  'M1 | mensagens_grupo',
  1,
  (SELECT count(*)::int FROM public.mensagens_grupo
   WHERE whatsapp_instance_id IN (
     'aaaa1111-1111-1111-1111-111111111111',
     'bbbb2222-2222-2222-2222-222222222222'
   ))
);

-- ── M2 (44444444) — member of CB only ─────────────────────────
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444"}';

SELECT pg_temp.check_eq(
  'M2 | leads',
  3,
  (SELECT count(*)::int FROM public.leads
   WHERE id IN (
     'cccc1111-1111-1111-1111-111111111111',
     'cccc2222-2222-2222-2222-222222222222',
     'cccc3333-3333-3333-3333-333333333333',
     'cccc4444-4444-4444-4444-444444444444'
   ))
);

SELECT pg_temp.check_eq(
  'M2 | mensagens_grupo',
  1,
  (SELECT count(*)::int FROM public.mensagens_grupo
   WHERE whatsapp_instance_id IN (
     'aaaa1111-1111-1111-1111-111111111111',
     'bbbb2222-2222-2222-2222-222222222222'
   ))
);

-- ─────────────────────────────────────────────────────────────
-- 10. Return results
-- ─────────────────────────────────────────────────────────────
SELECT * FROM t_results ORDER BY label;

-- ─────────────────────────────────────────────────────────────
-- 11. Rollback — no prod data left
-- ─────────────────────────────────────────────────────────────
ROLLBACK;
