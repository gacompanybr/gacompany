-- Portfolios (clientes/BMs)
CREATE TABLE public.portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  theme JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contas de anúncio (Google Ads sub-accounts)
CREATE TABLE public.ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'google_ads',
  customer_id TEXT NOT NULL,
  login_customer_id TEXT,
  currency TEXT DEFAULT 'BRL',
  result_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, customer_id)
);

-- Campanhas
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id UUID NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  channel_type TEXT,
  budget_amount NUMERIC(14,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, external_id)
);

-- Métricas diárias por campanha
CREATE TABLE public.campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  conversions NUMERIC(14,2) NOT NULL DEFAULT 0,
  conversions_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  ctr NUMERIC(8,4),
  avg_cpc NUMERIC(10,2),
  cost_per_conversion NUMERIC(10,2),
  reach BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, date)
);

CREATE INDEX idx_campaign_metrics_date ON public.campaign_metrics(date);
CREATE INDEX idx_campaign_metrics_campaign_date ON public.campaign_metrics(campaign_id, date);
CREATE INDEX idx_campaigns_account ON public.campaigns(ad_account_id);
CREATE INDEX idx_ad_accounts_portfolio ON public.ad_accounts(portfolio_id);

-- Logs de sincronização
CREATE TABLE public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id UUID REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  rows_synced INTEGER DEFAULT 0,
  error_message TEXT,
  date_from DATE,
  date_to DATE
);

-- Função updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_portfolios_updated BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ad_accounts_updated BEFORE UPDATE ON public.ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Leitura pública (painel interno sem auth por enquanto)
CREATE POLICY "Public read portfolios" ON public.portfolios FOR SELECT USING (true);
CREATE POLICY "Public read ad_accounts" ON public.ad_accounts FOR SELECT USING (true);
CREATE POLICY "Public read campaigns" ON public.campaigns FOR SELECT USING (true);
CREATE POLICY "Public read campaign_metrics" ON public.campaign_metrics FOR SELECT USING (true);
CREATE POLICY "Public read sync_logs" ON public.sync_logs FOR SELECT USING (true);

-- Escrita: somente service role (edge functions). Sem policies = bloqueado para anon/authenticated.

-- Seeds
INSERT INTO public.portfolios (name, slug, logo_url) VALUES
  ('BM - Vila Gym', 'vila-gym', NULL),
  ('Lopes Saúde e Odontologia', 'lopes-saude', NULL);

INSERT INTO public.ad_accounts (portfolio_id, name, platform, customer_id, login_customer_id, result_description)
SELECT id, 'Lopes Saúde - Google Ads', 'google_ads', '8429518986', '5892113746',
       'Conversões geradas no Google Ads'
FROM public.portfolios WHERE slug = 'lopes-saude';