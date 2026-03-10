-- Corrigir search_path warning na função create_default_final_stages
CREATE OR REPLACE FUNCTION public.create_default_final_stages()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.funnel_stages (
    funnel_id, name, description, color, icon, position, stage_type, is_final
  ) VALUES (
    NEW.id, 'Ganho', 'Negócio fechado com sucesso', '#10B981', '🎉', 998, 'won', true
  );
  
  INSERT INTO public.funnel_stages (
    funnel_id, name, description, color, icon, position, stage_type, is_final
  ) VALUES (
    NEW.id, 'Perdido', 'Negócio não concretizado', '#EF4444', '❌', 999, 'lost', true
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';