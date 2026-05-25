CREATE TABLE public.social_media_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL,
  fb_user_id TEXT,
  fb_page_id TEXT,
  fb_page_name TEXT,
  ig_business_id TEXT,
  ig_username TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, fb_page_id)
);

ALTER TABLE public.social_media_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access social_media_integrations"
ON public.social_media_integrations FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Portfolio members view social_media_integrations"
ON public.social_media_integrations FOR SELECT
USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Portfolio members manage social_media_integrations"
ON public.social_media_integrations FOR INSERT
WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Portfolio members update social_media_integrations"
ON public.social_media_integrations FOR UPDATE
USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Portfolio members delete social_media_integrations"
ON public.social_media_integrations FOR DELETE
USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER set_social_media_integrations_updated_at
BEFORE UPDATE ON public.social_media_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_social_media_integrations_portfolio ON public.social_media_integrations(portfolio_id);