CREATE TABLE public.beacons_promocoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL UNIQUE REFERENCES public.portfolios(id) ON DELETE CASCADE,
  link TEXT,
  image_url TEXT,
  texto TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beacons_promocoes TO authenticated;
GRANT ALL ON public.beacons_promocoes TO service_role;

ALTER TABLE public.beacons_promocoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por portfolio - beacons_promocoes select"
  ON public.beacons_promocoes FOR SELECT TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Acesso por portfolio - beacons_promocoes insert"
  ON public.beacons_promocoes FOR INSERT TO authenticated
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Acesso por portfolio - beacons_promocoes update"
  ON public.beacons_promocoes FOR UPDATE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id))
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Acesso por portfolio - beacons_promocoes delete"
  ON public.beacons_promocoes FOR DELETE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER trg_beacons_promocoes_updated_at
  BEFORE UPDATE ON public.beacons_promocoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();