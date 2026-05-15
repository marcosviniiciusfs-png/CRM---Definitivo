-- ============================================================
-- FIX: RPC bulk_insert_leads para importacao via SECURITY DEFINER
-- ============================================================
-- Contexto: a policy leads_insert_v2 (com user_can_write_to_org, criada em
-- 20260513120000) funciona para a maioria dos usuarios — 968+ INSERTs
-- reais validados em producao — mas em casos especificos (ex.: usuario
-- vgconsorcioitz@gmail.com com 2 memberships) o WITH CHECK falha SEM
-- chegar a chamar a funcao (zero log entries). Causa nao identificada com
-- certeza, mas envolve algum estado de prepared statement / plan cache do
-- PostgREST que nao invalidou apos o reload de schema.
--
-- Solucao: criar uma RPC SECURITY DEFINER que verifica explicitamente a
-- membership do caller e insere os leads bypassando RLS. O frontend
-- (ImportLeadsModal.tsx) passa a chamar essa RPC em vez de
-- supabase.from('leads').insert(...). Defesa em profundidade: a RPC
-- sobrescreve organization_id em cada lead para a org verificada.

CREATE OR REPLACE FUNCTION public.bulk_insert_leads(
  p_organization_id uuid,
  p_leads jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_inserted int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id e obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF p_leads IS NULL OR jsonb_typeof(p_leads) <> 'array' THEN
    RAISE EXCEPTION 'p_leads deve ser um array jsonb' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = v_caller
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Voce nao e membro desta organizacao' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.leads (
    organization_id,
    nome_lead,
    telefone_lead,
    email,
    empresa,
    valor,
    source,
    funnel_id,
    funnel_stage_id,
    stage,
    additional_data,
    responsavel,
    responsavel_user_id,
    descricao_negocio
  )
  SELECT
    p_organization_id,
    elem->>'nome_lead',
    elem->>'telefone_lead',
    NULLIF(elem->>'email', ''),
    NULLIF(elem->>'empresa', ''),
    NULLIF(elem->>'valor', '')::numeric,
    COALESCE(NULLIF(elem->>'source', ''), 'Importação'),
    NULLIF(elem->>'funnel_id', '')::uuid,
    NULLIF(elem->>'funnel_stage_id', '')::uuid,
    NULLIF(elem->>'stage', ''),
    CASE
      WHEN elem ? 'additional_data' AND jsonb_typeof(elem->'additional_data') = 'object'
        THEN elem->'additional_data'
      ELSE NULL
    END,
    NULLIF(elem->>'responsavel', ''),
    NULLIF(elem->>'responsavel_user_id', '')::uuid,
    NULLIF(elem->>'descricao_negocio', '')
  FROM jsonb_array_elements(p_leads) AS elem
  WHERE elem->>'nome_lead'     IS NOT NULL
    AND elem->>'telefone_lead' IS NOT NULL;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_insert_leads(uuid, jsonb) TO authenticated;
