-- Broadcast tables
CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'completed', 'cancelled')),
  total_contacts INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  delay_seconds INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS broadcast_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'error', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(broadcast_id, lead_id)
);

-- RLS
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_broadcasts" ON broadcasts
  FOR ALL USING (organization_id = (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "org_broadcast_contacts" ON broadcast_contacts
  FOR ALL USING (broadcast_id IN (
    SELECT id FROM broadcasts WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid() LIMIT 1
    )
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_broadcasts_org ON broadcasts(organization_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_broadcast ON broadcast_contacts(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_status ON broadcast_contacts(status);
