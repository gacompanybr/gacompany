CREATE TABLE IF NOT EXISTS public.robo_produtos_enviados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  robo_id uuid NOT NULL REFERENCES public.robo_campanhas(id) ON DELETE CASCADE,
  table_id text,
  row_id text,
  product_key text NOT NULL,
  productname text,
  offerlink text,
  link_compra text,
  image_url text,
  destino text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (robo_id, product_key)
);

GRANT SELECT ON public.robo_produtos_enviados TO authenticated;
GRANT ALL ON public.robo_produtos_enviados TO service_role;

ALTER TABLE public.robo_produtos_enviados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio users can view sent product history"
ON public.robo_produtos_enviados
FOR SELECT
TO authenticated
USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE INDEX IF NOT EXISTS idx_robo_produtos_enviados_robo_sent_at
ON public.robo_produtos_enviados (robo_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_robo_produtos_enviados_product_key
ON public.robo_produtos_enviados (product_key);
