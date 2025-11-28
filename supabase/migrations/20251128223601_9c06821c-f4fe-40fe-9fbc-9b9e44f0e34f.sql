-- Criar funil padrão e suas etapas

-- Inserir etapas finais padrão (Ganho e Perdido) em todos os funis
CREATE OR REPLACE FUNCTION create_default_final_stages()
RETURNS TRIGGER AS $$
BEGIN
  -- Criar etapa "Ganho" (Won)
  INSERT INTO public.funnel_stages (
    funnel_id, name, description, color, icon, position, stage_type, is_final
  ) VALUES (
    NEW.id, 'Ganho', 'Negócio fechado com sucesso', '#10B981', '🎉', 998, 'won', true
  );
  
  -- Criar etapa "Perdido" (Lost)
  INSERT INTO public.funnel_stages (
    funnel_id, name, description, color, icon, position, stage_type, is_final
  ) VALUES (
    NEW.id, 'Perdido', 'Negócio não concretizado', '#EF4444', '❌', 999, 'lost', true
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para criar etapas finais automaticamente
DROP TRIGGER IF EXISTS create_final_stages_trigger ON public.sales_funnels;
CREATE TRIGGER create_final_stages_trigger
  AFTER INSERT ON public.sales_funnels
  FOR EACH ROW
  EXECUTE FUNCTION create_default_final_stages();

-- Criar funil padrão para cada organização que não tem
DO $$
DECLARE
  org RECORD;
  new_funnel_id UUID;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP
    -- Verificar se já existe funil padrão
    IF NOT EXISTS (
      SELECT 1 FROM public.sales_funnels 
      WHERE organization_id = org.id AND is_default = true
    ) THEN
      -- Criar funil padrão
      INSERT INTO public.sales_funnels (
        organization_id, name, description, is_default, is_active
      ) VALUES (
        org.id, 'Funil Padrão', 'Funil padrão do sistema', true, true
      ) RETURNING id INTO new_funnel_id;
      
      -- Criar etapas padrão (as finais serão criadas pelo trigger)
      INSERT INTO public.funnel_stages (
        funnel_id, name, color, position, stage_type, is_final
      ) VALUES 
        (new_funnel_id, 'Novo Lead', '#3B82F6', 0, 'new', false),
        (new_funnel_id, 'Em Atendimento', '#F59E0B', 1, 'in_progress', false),
        (new_funnel_id, 'Proposta Enviada', '#8B5CF6', 2, 'proposal', false);
    END IF;
  END LOOP;
END $$;