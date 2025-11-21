-- Create items table for production management
CREATE TABLE public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  item_type TEXT NOT NULL CHECK (item_type IN ('physical', 'service', 'digital')),
  sale_price NUMERIC NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  cost_price NUMERIC NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  profit_margin NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN cost_price > 0 THEN ((sale_price - cost_price) / cost_price * 100)
      ELSE 0
    END
  ) STORED,
  stock_quantity INTEGER CHECK (stock_quantity >= 0),
  duration TEXT,
  resource TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view items from their organization"
  ON public.items
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create items in their organization"
  ON public.items
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update items in their organization"
  ON public.items
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete items in their organization"
  ON public.items
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Deny public access to items"
  ON public.items
  FOR ALL
  USING (false);

-- Trigger to auto-set organization_id
CREATE OR REPLACE FUNCTION public.set_item_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.organization_id := public.get_user_organization_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_item_organization_trigger
  BEFORE INSERT ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_item_organization();

-- Trigger to update updated_at
CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_items_organization_id ON public.items(organization_id);
CREATE INDEX idx_items_item_type ON public.items(item_type);