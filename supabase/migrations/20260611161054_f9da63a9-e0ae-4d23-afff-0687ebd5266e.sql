CREATE TABLE public.whatsapp_conversas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  contato_telefone TEXT NOT NULL,
  contato_nome TEXT,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  mensagem TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_conversas_lookup
  ON public.whatsapp_conversas (portfolio_id, contato_telefone, created_at DESC);

GRANT SELECT ON public.whatsapp_conversas TO authenticated;
GRANT ALL ON public.whatsapp_conversas TO service_role;

ALTER TABLE public.whatsapp_conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver conversas do portfólio"
ON public.whatsapp_conversas FOR SELECT
TO authenticated
USING (public.has_portfolio_access(auth.uid(), portfolio_id));