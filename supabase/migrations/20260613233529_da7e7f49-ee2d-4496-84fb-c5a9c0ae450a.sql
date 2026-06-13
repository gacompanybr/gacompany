ALTER TABLE public.whatsapp_agents
  ADD COLUMN IF NOT EXISTS n8n_workflow_id text,
  ADD COLUMN IF NOT EXISTS n8n_webhook_path text;