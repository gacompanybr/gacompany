ALTER TABLE public.whatsapp_agents
  ADD COLUMN IF NOT EXISTS report_group_id text,
  ADD COLUMN IF NOT EXISTS report_group_name text;