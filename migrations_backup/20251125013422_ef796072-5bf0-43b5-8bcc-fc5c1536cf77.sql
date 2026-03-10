-- Add notification preferences to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_sound_enabled BOOLEAN DEFAULT true;