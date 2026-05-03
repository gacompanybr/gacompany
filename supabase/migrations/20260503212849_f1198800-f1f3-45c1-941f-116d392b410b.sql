-- 1. Estender portfolios
ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS servicos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Tabela de acesso por usuário/portfolio
CREATE TABLE IF NOT EXISTS public.user_portfolio_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, portfolio_id)
);

ALTER TABLE public.user_portfolio_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage portfolio access"
  ON public.user_portfolio_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see own portfolio access"
  ON public.user_portfolio_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. Função SECURITY DEFINER para verificar acesso
CREATE OR REPLACE FUNCTION public.has_portfolio_access(_user_id UUID, _portfolio_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_portfolio_access
      WHERE user_id = _user_id AND portfolio_id = _portfolio_id
    );
$$;

-- 4. RLS portfolios: admin tudo, viewer só os que tem acesso
DROP POLICY IF EXISTS "Public read portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Admins read all portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Viewers read own portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Admins write portfolios" ON public.portfolios;

CREATE POLICY "Admins read all portfolios"
  ON public.portfolios FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read accessible portfolios"
  ON public.portfolios FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_portfolio_access
    WHERE user_id = auth.uid() AND portfolio_id = portfolios.id
  ));

CREATE POLICY "Admins insert portfolios"
  ON public.portfolios FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update portfolios"
  ON public.portfolios FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete portfolios"
  ON public.portfolios FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Restringir tabelas relacionadas (antes públicas) por acesso ao portfolio
-- ad_accounts
DROP POLICY IF EXISTS "Public read ad_accounts" ON public.ad_accounts;
CREATE POLICY "Read ad_accounts by portfolio access"
  ON public.ad_accounts FOR SELECT TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

-- campaigns (via ad_accounts -> portfolio)
DROP POLICY IF EXISTS "Public read campaigns" ON public.campaigns;
CREATE POLICY "Read campaigns by portfolio access"
  ON public.campaigns FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ad_accounts a
    WHERE a.id = campaigns.ad_account_id
      AND public.has_portfolio_access(auth.uid(), a.portfolio_id)
  ));

-- campaign_metrics (via campaigns -> ad_accounts)
DROP POLICY IF EXISTS "Public read campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "Read campaign_metrics by portfolio access"
  ON public.campaign_metrics FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    JOIN public.ad_accounts a ON a.id = c.ad_account_id
    WHERE c.id = campaign_metrics.campaign_id
      AND public.has_portfolio_access(auth.uid(), a.portfolio_id)
  ));

-- meta_integracoes
DROP POLICY IF EXISTS "Public read meta_integracoes safe fields" ON public.meta_integracoes;
CREATE POLICY "Read meta_integracoes by portfolio access"
  ON public.meta_integracoes FOR SELECT TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

-- meta_campanhas
DROP POLICY IF EXISTS "Public read meta_campanhas" ON public.meta_campanhas;
CREATE POLICY "Read meta_campanhas by portfolio access"
  ON public.meta_campanhas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.meta_integracoes m
    WHERE m.id = meta_campanhas.integration_id
      AND public.has_portfolio_access(auth.uid(), m.portfolio_id)
  ));

-- meta_metricas_campanhas
DROP POLICY IF EXISTS "Public read meta_metricas_campanhas" ON public.meta_metricas_campanhas;
CREATE POLICY "Read meta_metricas by portfolio access"
  ON public.meta_metricas_campanhas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.meta_integracoes m
    WHERE m.id = meta_metricas_campanhas.integration_id
      AND public.has_portfolio_access(auth.uid(), m.portfolio_id)
  ));

-- 6. Permitir admin listar todos os profiles e user_roles (para a aba Equipe)
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read all user_roles" ON public.user_roles;
CREATE POLICY "Admins read all user_roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));