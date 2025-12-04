-- Corrigir search_path na função
CREATE OR REPLACE FUNCTION public.generate_commission_on_won()
RETURNS TRIGGER AS $$
DECLARE
  config_record RECORD;
  calc_commission NUMERIC(15,2);
BEGIN
  IF NEW.funnel_stage_id IS NOT NULL AND NEW.responsavel_user_id IS NOT NULL AND NEW.valor IS NOT NULL AND NEW.valor > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.funnel_stages 
      WHERE id = NEW.funnel_stage_id AND stage_type = 'won'
    ) THEN
      SELECT * INTO config_record 
      FROM public.commission_configs 
      WHERE organization_id = NEW.organization_id AND is_active = true;
      
      IF FOUND THEN
        IF config_record.commission_type = 'percentage' THEN
          calc_commission := NEW.valor * (config_record.commission_value / 100);
        ELSE
          calc_commission := config_record.commission_value;
        END IF;
        
        INSERT INTO public.commissions (
          organization_id, user_id, lead_id, sale_value, 
          commission_value, commission_type, commission_rate
        )
        SELECT 
          NEW.organization_id, NEW.responsavel_user_id, NEW.id, NEW.valor,
          calc_commission, config_record.commission_type, config_record.commission_value
        WHERE NOT EXISTS (
          SELECT 1 FROM public.commissions WHERE lead_id = NEW.id
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;