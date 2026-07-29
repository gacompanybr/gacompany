CREATE TABLE public.leads_incompletos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id uuid NOT NULL,
  phone text NOT NULL,
  trigger_type text NOT NULL,
  motivo_falha text NOT NULL,
  nome_capturado text,
  unidade_capturada text,
  motivo_capturado text,
  contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.leads_incompletos TO authenticated;
GRANT ALL ON public.leads_incompletos TO service_role;

ALTER TABLE public.leads_incompletos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio members can view incomplete leads"
ON public.leads_incompletos FOR SELECT TO authenticated
USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE INDEX idx_leads_incompletos_portfolio_created ON public.leads_incompletos (portfolio_id, created_at DESC);