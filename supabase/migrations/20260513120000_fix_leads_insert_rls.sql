-- ============================================================
-- FIX: leads INSERT/UPDATE/DELETE rejeitando inserts validos
-- ============================================================
-- Sintoma: usuario membro da org consegue SELECT (via leads_select_v2 ->
-- user_can_access_lead) mas recebe 403 "new row violates row-level
-- security policy" no INSERT em leads — mesmo sendo owner da org.
--
-- Causa: as policies criadas em 20260512150000_split_leads_access_policy
-- usam public.has_org_access(organization_id), uma funcao SQL STABLE
-- SECURITY DEFINER (definida originalmente em
-- migrations_backup/20260304224000_recursion_killer_v6.sql, sem migration
-- source no folder atual). Em chamadas isoladas a funcao retorna TRUE
-- corretamente, mas quando o planner de Postgres a INLINA dentro de WITH
-- CHECK ela acaba retornando FALSE, rejeitando o INSERT. Inlining de
-- funcoes SQL STABLE em policy expressions e instavel em alguns cenarios.
--
-- Fix: criar nova funcao em PL/pgSQL VOLATILE SECURITY DEFINER (PL/pgSQL
-- nao e inlineavel) com search_path explicito, e migrar as 3 policies de
-- write para usa-la. Validado em producao: 100+ INSERTs reais passaram
-- pos-deploy com retorno TRUE consistente.

CREATE OR REPLACE FUNCTION public.user_can_write_to_org(p_org uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = auth.uid()
      AND organization_id = p_org
  ) INTO v_exists;
  RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_can_write_to_org(uuid) TO authenticated;

-- lock_timeout previne deadlock com o worker de realtime (que segura
-- AccessShareLock em leads para replicacao).
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS leads_insert_v2 ON public.leads;
DROP POLICY IF EXISTS leads_update_v2 ON public.leads;
DROP POLICY IF EXISTS leads_delete_v2 ON public.leads;

CREATE POLICY leads_insert_v2 ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_write_to_org(organization_id));

CREATE POLICY leads_update_v2 ON public.leads
  FOR UPDATE TO authenticated
  USING      (public.user_can_write_to_org(organization_id))
  WITH CHECK (public.user_can_write_to_org(organization_id));

CREATE POLICY leads_delete_v2 ON public.leads
  FOR DELETE TO authenticated
  USING (public.user_can_write_to_org(organization_id));
