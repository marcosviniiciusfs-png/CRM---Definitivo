-- Função para atualizar metas de equipe quando leads são marcados como ganhos
CREATE OR REPLACE FUNCTION public.update_team_goals_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  user_team_id UUID;
  lead_value NUMERIC;
BEGIN
  -- Apenas processar se o lead foi movido para um stage do tipo 'won'
  IF NEW.funnel_stage_id IS NOT NULL AND NEW.responsavel_user_id IS NOT NULL THEN
    -- Verificar se o novo stage é do tipo 'won'
    IF EXISTS (
      SELECT 1 FROM public.funnel_stages 
      WHERE id = NEW.funnel_stage_id AND stage_type = 'won'
    ) THEN
      -- Verificar se o stage anterior NÃO era 'won' (evitar duplicação)
      IF OLD.funnel_stage_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.funnel_stages 
        WHERE id = OLD.funnel_stage_id AND stage_type = 'won'
      ) THEN
        -- Buscar a equipe do responsável
        SELECT team_id INTO user_team_id
        FROM public.team_members
        WHERE user_id = NEW.responsavel_user_id
        LIMIT 1;
        
        -- Se o usuário pertence a uma equipe, atualizar as metas
        IF user_team_id IS NOT NULL THEN
          lead_value := COALESCE(NEW.valor, 0);
          
          -- Atualizar metas ativas da equipe dentro do período
          UPDATE public.team_goals
          SET 
            current_value = CASE 
              WHEN goal_type = 'sales_count' THEN current_value + 1
              WHEN goal_type = 'revenue' THEN current_value + lead_value
              WHEN goal_type = 'leads_converted' THEN current_value + 1
              ELSE current_value
            END,
            updated_at = NOW()
          WHERE team_id = user_team_id
            AND CURRENT_DATE BETWEEN start_date AND end_date;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trigger_update_team_goals_on_sale ON public.leads;

-- Criar trigger para atualizar metas quando leads forem atualizados
CREATE TRIGGER trigger_update_team_goals_on_sale
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_team_goals_on_sale();

-- Habilitar realtime para team_goals
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_goals;