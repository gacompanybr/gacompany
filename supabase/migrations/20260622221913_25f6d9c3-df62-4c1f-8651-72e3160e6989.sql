ALTER TABLE public.scrapper_jobs ADD COLUMN IF NOT EXISTS grupo_origem_jid text NULL;

CREATE INDEX IF NOT EXISTS scrapper_jobs_dup_lookup
  ON public.scrapper_jobs (grupo_origem_jid)
  WHERE status = 'ativo' AND plataforma = 'dup';