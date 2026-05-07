-- Add campaign date and type fields
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS advertising_channel_type text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

-- Keywords table
CREATE TABLE IF NOT EXISTS public.campaign_keywords (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL,
  ad_group_id text,
  criterion_id text NOT NULL,
  keyword_text text NOT NULL,
  match_type text,
  date date NOT NULL,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  conversions numeric NOT NULL DEFAULT 0,
  ctr numeric,
  avg_cpc numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, criterion_id, date)
);

CREATE INDEX IF NOT EXISTS idx_campaign_keywords_campaign_date
  ON public.campaign_keywords (campaign_id, date);

ALTER TABLE public.campaign_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read keywords by portfolio access"
  ON public.campaign_keywords
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    JOIN public.ad_accounts a ON a.id = c.ad_account_id
    WHERE c.id = campaign_keywords.campaign_id
      AND public.has_portfolio_access(auth.uid(), a.portfolio_id)
  ));

-- Search terms table
CREATE TABLE IF NOT EXISTS public.campaign_search_terms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL,
  search_term text NOT NULL,
  date date NOT NULL,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  conversions numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, search_term, date)
);

CREATE INDEX IF NOT EXISTS idx_campaign_search_terms_campaign_date
  ON public.campaign_search_terms (campaign_id, date);

ALTER TABLE public.campaign_search_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read search terms by portfolio access"
  ON public.campaign_search_terms
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    JOIN public.ad_accounts a ON a.id = c.ad_account_id
    WHERE c.id = campaign_search_terms.campaign_id
      AND public.has_portfolio_access(auth.uid(), a.portfolio_id)
  ));