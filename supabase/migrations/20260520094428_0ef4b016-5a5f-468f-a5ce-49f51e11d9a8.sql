ALTER TABLE public.scrapper_jobs
  ADD COLUMN IF NOT EXISTS n8n_workflow_id text,
  ADD COLUMN IF NOT EXISTS intervalo_horas integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS data_table_name text;