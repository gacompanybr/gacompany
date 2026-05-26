
-- Adiciona vínculo da integração ML ao Scrapper Job
ALTER TABLE public.mercadolivre_integracoes
  ADD COLUMN IF NOT EXISTS scrapper_job_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS mercadolivre_integracoes_scrapper_job_id_key
  ON public.mercadolivre_integracoes(scrapper_job_id)
  WHERE scrapper_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mercadolivre_integracoes_scrapper_job_id
  ON public.mercadolivre_integracoes(scrapper_job_id);

-- Trigger: ao apagar scrapper_job, apaga a integração ML vinculada
CREATE OR REPLACE FUNCTION public.cleanup_ml_on_scrapper_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.mercadolivre_integracoes
   WHERE scrapper_job_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_ml_on_scrapper_delete_trg ON public.scrapper_jobs;
CREATE TRIGGER cleanup_ml_on_scrapper_delete_trg
BEFORE DELETE ON public.scrapper_jobs
FOR EACH ROW EXECUTE FUNCTION public.cleanup_ml_on_scrapper_delete();
