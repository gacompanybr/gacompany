ALTER TABLE public.scrapper_jobs
  ADD COLUMN IF NOT EXISTS n8n_datatable_id text;