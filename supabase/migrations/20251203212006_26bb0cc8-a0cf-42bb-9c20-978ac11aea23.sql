-- Add button click sound preference to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS button_click_sound_enabled boolean DEFAULT true;