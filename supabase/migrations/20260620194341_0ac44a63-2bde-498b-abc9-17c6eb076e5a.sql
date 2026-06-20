
-- Campanhas SDR
CREATE TABLE public.sdr_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','finished')),
  rate_per_hour integer NOT NULL DEFAULT 30 CHECK (rate_per_hour BETWEEN 1 AND 500),
  total_leads integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sdr_campaigns TO authenticated;
GRANT ALL ON public.sdr_campaigns TO service_role;
ALTER TABLE public.sdr_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por portfólio - select"
  ON public.sdr_campaigns FOR SELECT TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Acesso por portfólio - insert"
  ON public.sdr_campaigns FOR INSERT TO authenticated
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Acesso por portfólio - update"
  ON public.sdr_campaigns FOR UPDATE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id))
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Acesso por portfólio - delete"
  ON public.sdr_campaigns FOR DELETE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER set_updated_at_sdr_campaigns
  BEFORE UPDATE ON public.sdr_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Leads SDR
CREATE TABLE public.sdr_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.sdr_campaigns(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  telefone text NOT NULL,
  nome text,
  nome_resolvido text,
  nicho text NOT NULL,
  instagram text,
  motivo_contato text NOT NULL,
  enviado boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviado','respondeu','reuniao_confirmada','rejeitou','ia_detectada','aguardando_humano','sem_resposta')),
  follow_up_count integer NOT NULL DEFAULT 0 CHECK (follow_up_count BETWEEN 0 AND 2),
  primeira_mensagem_em timestamptz,
  ultima_mensagem_em timestamptz,
  cooldown_ate timestamptz,
  mensagens_trocadas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sdr_leads_campaign_status ON public.sdr_leads(campaign_id, status);
CREATE INDEX idx_sdr_leads_portfolio_phone ON public.sdr_leads(portfolio_id, telefone);
CREATE INDEX idx_sdr_leads_phone_suffix ON public.sdr_leads(right(regexp_replace(telefone,'\D','','g'), 11));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sdr_leads TO authenticated;
GRANT ALL ON public.sdr_leads TO service_role;
ALTER TABLE public.sdr_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por portfólio - select"
  ON public.sdr_leads FOR SELECT TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Acesso por portfólio - insert"
  ON public.sdr_leads FOR INSERT TO authenticated
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Acesso por portfólio - update"
  ON public.sdr_leads FOR UPDATE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id))
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Acesso por portfólio - delete"
  ON public.sdr_leads FOR DELETE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER set_updated_at_sdr_leads
  BEFORE UPDATE ON public.sdr_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Marca conversas iniciadas pelo SDR
ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS sdr_lead_id uuid REFERENCES public.sdr_leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_sdr_lead ON public.whatsapp_conversas(sdr_lead_id);
