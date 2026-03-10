-- Função para criar funil padrão com todas as etapas quando uma organização é criada
CREATE OR REPLACE FUNCTION public.create_default_funnel_for_organization()
RETURNS TRIGGER AS $$
DECLARE
  new_funnel_id UUID;
BEGIN
  -- Criar funil padrão
  INSERT INTO public.sales_funnels (
    organization_id, name, description, is_default, is_active, icon
  ) VALUES (
    NEW.id, 'Funil Padrão', 'Funil padrão do sistema', true, true, 'Target'
  ) RETURNING id INTO new_funnel_id;
  
  -- Criar as 8 etapas + Perdido
  INSERT INTO public.funnel_stages (
    funnel_id, name, description, color, icon, position, stage_type, is_final
  ) VALUES 
    (new_funnel_id, 'Novo Lead', 'Leads recém-chegados', '#3B82F6', '📋', 0, 'custom', false),
    (new_funnel_id, 'Qualificação / Aquecido', 'Leads sendo qualificados', '#06B6D4', '🔥', 1, 'custom', false),
    (new_funnel_id, 'Agendamento Realizado', 'Reunião agendada', '#EAB308', '📅', 2, 'custom', false),
    (new_funnel_id, 'Reunião Feita', 'Reunião realizada com o lead', '#F97316', '🤝', 3, 'custom', false),
    (new_funnel_id, 'Proposta / Negociação', 'Proposta enviada, em negociação', '#8B5CF6', '📝', 4, 'custom', false),
    (new_funnel_id, 'Aprovação / Análise', 'Aguardando aprovação do cliente', '#6366F1', '🔍', 5, 'custom', false),
    (new_funnel_id, 'Venda Realizada', 'Negócio fechado com sucesso', '#10B981', '🎉', 6, 'won', true),
    (new_funnel_id, 'Pós-venda / Ativação', 'Cliente em processo de ativação', '#34D399', '✨', 7, 'custom', false),
    (new_funnel_id, 'Perdido', 'Negócio não concretizado', '#EF4444', '❌', 999, 'lost', true);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Remover trigger antigo que criava apenas etapas finais no sales_funnels
DROP TRIGGER IF EXISTS create_final_stages_trigger ON public.sales_funnels;

-- Criar novo trigger que executa quando nova organização é criada
DROP TRIGGER IF EXISTS create_default_funnel_trigger ON public.organizations;
CREATE TRIGGER create_default_funnel_trigger
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_funnel_for_organization();