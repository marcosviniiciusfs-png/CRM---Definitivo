-- Create ENUM type for meeting status
CREATE TYPE status_reuniao_type AS ENUM ('realizada', 'no_show');

-- Add column to leads table
ALTER TABLE leads
ADD COLUMN status_reuniao status_reuniao_type DEFAULT NULL;

-- Create index for performance
CREATE INDEX idx_leads_org_status_reuniao ON leads (organization_id, status_reuniao);

-- Add comment to explain the field
COMMENT ON COLUMN leads.status_reuniao IS 'Indica o status da reunião do lead: "realizada" para reuniões concluídas, "no_show" para ausências do lead';