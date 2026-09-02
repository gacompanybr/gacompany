-- ============ E-mail Marketing ============
CREATE TABLE IF NOT EXISTS public.email_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome_empresa text,
  nicho text,
  cidade text,
  telefone text,
  website text,
  endereco text,
  place_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_leads TO authenticated;
GRANT ALL ON public.email_leads TO service_role;
ALTER TABLE public.email_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_leads select" ON public.email_leads FOR SELECT TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "email_leads insert" ON public.email_leads FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "email_leads update" ON public.email_leads FOR UPDATE TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "email_leads delete" ON public.email_leads FOR DELETE TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TABLE IF NOT EXISTS public.email_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  nome text NOT NULL,
  assunto text NOT NULL,
  corpo text NOT NULL,
  link_url text,
  link_label text,
  remetente_nome text,
  remetente_email text,
  status text NOT NULL DEFAULT 'rascunho',
  total_contatos integer NOT NULL DEFAULT 0,
  enviados integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  lock_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campanhas TO authenticated;
GRANT ALL ON public.email_campanhas TO service_role;
ALTER TABLE public.email_campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_campanhas select" ON public.email_campanhas FOR SELECT TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "email_campanhas insert" ON public.email_campanhas FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "email_campanhas update" ON public.email_campanhas FOR UPDATE TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "email_campanhas delete" ON public.email_campanhas FOR DELETE TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TABLE IF NOT EXISTS public.email_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.email_campanhas(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome text,
  empresa text,
  variaveis jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  provider_id text,
  enviado_em timestamptz,
  aberto_em timestamptz,
  abertos integer NOT NULL DEFAULT 0,
  clicado_em timestamptz,
  cliques integer NOT NULL DEFAULT 0,
  respondido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, email)
);
CREATE INDEX IF NOT EXISTS email_destinatarios_pend_idx ON public.email_destinatarios (campanha_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_destinatarios TO authenticated;
GRANT ALL ON public.email_destinatarios TO service_role;
ALTER TABLE public.email_destinatarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_dest select" ON public.email_destinatarios FOR SELECT TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "email_dest insert" ON public.email_destinatarios FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "email_dest update" ON public.email_destinatarios FOR UPDATE TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "email_dest delete" ON public.email_destinatarios FOR DELETE TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER email_campanhas_updated_at BEFORE UPDATE ON public.email_campanhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ativa o módulo somente para a GA Company
UPDATE public.portfolios
SET servicos = (COALESCE(servicos, '[]'::jsonb) || '["email_marketing"]'::jsonb)
WHERE name ILIKE '%GA Company%'
  AND NOT (COALESCE(servicos, '[]'::jsonb) @> '["email_marketing"]'::jsonb);