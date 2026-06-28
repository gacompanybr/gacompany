CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_portfolio_created
  ON public.whatsapp_conversas (portfolio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_sdr_lead
  ON public.whatsapp_conversas (sdr_lead_id, created_at DESC)
  WHERE sdr_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_telefone
  ON public.whatsapp_conversas (portfolio_id, contato_telefone);

CREATE INDEX IF NOT EXISTS idx_user_portfolio_access_lookup
  ON public.user_portfolio_access (user_id, portfolio_id);