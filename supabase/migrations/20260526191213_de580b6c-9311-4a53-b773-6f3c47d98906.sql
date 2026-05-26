
CREATE TABLE public.mercadolivre_integracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  ml_user_id text NOT NULL,
  nickname text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  status text NOT NULL DEFAULT 'active',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, ml_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mercadolivre_integracoes TO authenticated;
GRANT ALL ON public.mercadolivre_integracoes TO service_role;

ALTER TABLE public.mercadolivre_integracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage mercadolivre_integracoes"
ON public.mercadolivre_integracoes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Read mercadolivre_integracoes by portfolio access"
ON public.mercadolivre_integracoes FOR SELECT TO authenticated
USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Insert mercadolivre_integracoes by portfolio access"
ON public.mercadolivre_integracoes FOR INSERT TO authenticated
WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Update mercadolivre_integracoes by portfolio access"
ON public.mercadolivre_integracoes FOR UPDATE TO authenticated
USING (public.has_portfolio_access(auth.uid(), portfolio_id))
WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Delete mercadolivre_integracoes by portfolio access"
ON public.mercadolivre_integracoes FOR DELETE TO authenticated
USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER update_mercadolivre_integracoes_updated_at
BEFORE UPDATE ON public.mercadolivre_integracoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
