CREATE TABLE public.scrapper_product_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrapper_job_id uuid NOT NULL REFERENCES public.scrapper_jobs(id) ON DELETE CASCADE,
  table_id text,
  product_key text NOT NULL,
  productname text,
  offerlink text,
  link_compra text,
  price numeric,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scrapper_job_id, product_key)
);

GRANT ALL ON public.scrapper_product_history TO service_role;

ALTER TABLE public.scrapper_product_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX scrapper_product_history_job_seen_idx
  ON public.scrapper_product_history (scrapper_job_id, last_seen_at DESC);

CREATE TRIGGER update_scrapper_product_history_updated_at
  BEFORE UPDATE ON public.scrapper_product_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();