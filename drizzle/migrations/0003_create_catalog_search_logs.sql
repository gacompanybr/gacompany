CREATE TABLE public.catalog_search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  agent_id uuid,
  telefone text,
  consulta text NOT NULL,
  consulta_normalizada text,
  camada text,
  total_encontrado integer NOT NULL DEFAULT 0,
  retornados integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX catalog_search_logs_portfolio_created_idx
  ON public.catalog_search_logs (portfolio_id, created_at DESC);

GRANT SELECT ON public.catalog_search_logs TO authenticated;
GRANT ALL ON public.catalog_search_logs TO service_role;

ALTER TABLE public.catalog_search_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalog search logs select"
  ON public.catalog_search_logs FOR SELECT TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));