-- Preview do impacto da exclusão de um colaborador.
-- Retorna contadores que o front mostra no AlertDialog antes da confirmação.
-- SECURITY DEFINER porque o owner precisa ler counts em tabelas com RLS restrito.
-- A checagem de auth.uid() = owner garante que apenas owners chamam.

CREATE OR REPLACE FUNCTION public.preview_organization_member_deletion(
  p_member_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_user_id uuid;
  v_target_role text;
  v_member_name text;
  v_active_leads int;
  v_closed_leads int;
  v_teams_as_leader int;
  v_roulettes_in int;
  v_closed_stage_ids uuid[];
BEGIN
  -- 1. Caller deve ser owner da org
  SELECT role INTO v_caller_role
  FROM public.organization_members
  WHERE user_id = auth.uid() AND organization_id = p_organization_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Apenas o owner pode excluir colaboradores' USING ERRCODE = '42501';
  END IF;

  -- 2. Buscar membro alvo
  SELECT om.user_id, om.role,
         COALESCE(p.full_name, om.display_name, om.email, 'Colaborador')
    INTO v_target_user_id, v_target_role, v_member_name
  FROM public.organization_members om
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  WHERE om.id = p_member_id AND om.organization_id = p_organization_id;

  IF v_target_user_id IS NULL AND v_target_role IS NULL THEN
    RAISE EXCEPTION 'Membro não encontrado nesta organização' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Não permitir excluir owner
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Não é permitido excluir o proprietário' USING ERRCODE = '42501';
  END IF;

  -- 4. Calcular contadores (só se há user_id; convite pendente retorna zeros)
  IF v_target_user_id IS NOT NULL THEN
    -- estágios won/lost
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_closed_stage_ids
    FROM public.funnel_stages
    WHERE stage_type IN ('won', 'lost');

    -- leads ativos
    SELECT COUNT(*) INTO v_active_leads
    FROM public.leads
    WHERE responsavel_user_id = v_target_user_id
      AND organization_id = p_organization_id
      AND (funnel_stage_id IS NULL OR NOT (funnel_stage_id = ANY(v_closed_stage_ids)));

    -- leads fechados (won/lost)
    SELECT COUNT(*) INTO v_closed_leads
    FROM public.leads
    WHERE responsavel_user_id = v_target_user_id
      AND organization_id = p_organization_id
      AND funnel_stage_id = ANY(v_closed_stage_ids);

    -- equipes onde é líder
    SELECT COUNT(*) INTO v_teams_as_leader
    FROM public.teams
    WHERE leader_id = v_target_user_id AND organization_id = p_organization_id;

    -- roletas em que aparece em eligible_agents (text[])
    SELECT COUNT(*) INTO v_roulettes_in
    FROM public.lead_distribution_configs
    WHERE organization_id = p_organization_id
      AND v_target_user_id::text = ANY(eligible_agents);
  ELSE
    v_active_leads := 0;
    v_closed_leads := 0;
    v_teams_as_leader := 0;
    v_roulettes_in := 0;
  END IF;

  RETURN jsonb_build_object(
    'member_name', v_member_name,
    'active_leads', v_active_leads,
    'closed_leads', v_closed_leads,
    'teams_as_leader', v_teams_as_leader,
    'roulettes_in', v_roulettes_in,
    'has_auth_user', v_target_user_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_organization_member_deletion(uuid, uuid) TO authenticated;
