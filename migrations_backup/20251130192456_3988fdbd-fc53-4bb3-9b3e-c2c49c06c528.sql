-- Create production_blocks table
CREATE TABLE production_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  
  -- Métricas calculadas
  total_sales INTEGER DEFAULT 0,
  total_revenue NUMERIC(15,2) DEFAULT 0,
  total_cost NUMERIC(15,2) DEFAULT 0,
  total_profit NUMERIC(15,2) DEFAULT 0,
  
  -- Comparativo com mês anterior
  previous_month_profit NUMERIC(15,2),
  profit_change_value NUMERIC(15,2),
  profit_change_percentage NUMERIC(8,2),
  
  -- Detalhes
  notes TEXT,
  is_closed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(organization_id, month, year)
);

-- Enable RLS
ALTER TABLE production_blocks ENABLE ROW LEVEL SECURITY;

-- Deny public access
CREATE POLICY "Deny public access to production blocks"
  ON production_blocks
  FOR ALL
  USING (false);

-- Users can view production blocks from their organization
CREATE POLICY "Users can view production blocks from their organization"
  ON production_blocks
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Admins and owners can create production blocks
CREATE POLICY "Admins can create production blocks"
  ON production_blocks
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Admins and owners can update production blocks
CREATE POLICY "Admins can update production blocks"
  ON production_blocks
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Admins and owners can delete production blocks
CREATE POLICY "Admins can delete production blocks"
  ON production_blocks
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Create index for faster queries
CREATE INDEX idx_production_blocks_org_date ON production_blocks(organization_id, year DESC, month DESC);