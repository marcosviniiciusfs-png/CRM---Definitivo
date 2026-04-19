-- Add 'failed' to broadcast status check constraint
ALTER TABLE broadcasts DROP CONSTRAINT broadcasts_status_check;
ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_status_check
  CHECK (status IN ('draft', 'sending', 'completed', 'cancelled', 'failed'));
