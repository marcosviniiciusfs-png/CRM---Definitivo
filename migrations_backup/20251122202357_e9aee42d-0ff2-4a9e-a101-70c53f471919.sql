-- Add fields to store selected lead form
ALTER TABLE facebook_integrations 
ADD COLUMN selected_form_id text,
ADD COLUMN selected_form_name text;