-- Add icon column to items table
ALTER TABLE items ADD COLUMN icon text;

COMMENT ON COLUMN items.icon IS 'Lucide icon name to represent the item';