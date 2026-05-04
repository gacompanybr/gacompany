-- CRM Leads
CREATE TABLE public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  origem TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'novo',
  valor_estimado NUMERIC,
  observacoes TEXT,
  responsavel_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_leads_portfolio ON public.crm_leads(portfolio_id);
CREATE INDEX idx_crm_leads_status ON public.crm_leads(status);

CREATE TABLE public.crm_interacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_interacoes_lead ON public.crm_interacoes(lead_id);

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio access leads select" ON public.crm_leads FOR SELECT TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Portfolio access leads insert" ON public.crm_leads FOR INSERT TO authenticated
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Portfolio access leads update" ON public.crm_leads FOR UPDATE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id))
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Portfolio access leads delete" ON public.crm_leads FOR DELETE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Portfolio access interacoes select" ON public.crm_interacoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.id = crm_interacoes.lead_id AND public.has_portfolio_access(auth.uid(), l.portfolio_id)));
CREATE POLICY "Portfolio access interacoes insert" ON public.crm_interacoes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.id = crm_interacoes.lead_id AND public.has_portfolio_access(auth.uid(), l.portfolio_id)));
CREATE POLICY "Portfolio access interacoes delete" ON public.crm_interacoes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.id = crm_interacoes.lead_id AND public.has_portfolio_access(auth.uid(), l.portfolio_id)));

CREATE TRIGGER update_crm_leads_updated_at BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Social Posts
CREATE TABLE public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL DEFAULT '',
  legenda TEXT,
  hashtags TEXT,
  plataformas JSONB NOT NULL DEFAULT '[]'::jsonb,
  tipo TEXT NOT NULL DEFAULT 'post',
  status TEXT NOT NULL DEFAULT 'rascunho',
  data_agendada TIMESTAMPTZ,
  imagem_url TEXT,
  responsavel_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_posts_portfolio ON public.social_posts(portfolio_id);
CREATE INDEX idx_social_posts_data ON public.social_posts(data_agendada);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio access posts select" ON public.social_posts FOR SELECT TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Portfolio access posts insert" ON public.social_posts FOR INSERT TO authenticated
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Portfolio access posts update" ON public.social_posts FOR UPDATE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id))
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Portfolio access posts delete" ON public.social_posts FOR DELETE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER update_social_posts_updated_at BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();