ALTER TABLE public.whatsapp_agents ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.cobranca_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL UNIQUE REFERENCES public.portfolios(id) ON DELETE CASCADE,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  dia_vencimento int NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  sender_instance text NOT NULL,
  sender_portfolio_id uuid REFERENCES public.portfolios(id),
  contato_jid text NOT NULL,
  contato_telefone text NOT NULL,
  contato_nome text,
  mensagem_template text NOT NULL,
  ativo boolean NOT NULL DEFAULT false,
  last_sent_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranca_config TO authenticated;
GRANT ALL ON public.cobranca_config TO service_role;

ALTER TABLE public.cobranca_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por portfolio - select" ON public.cobranca_config
  FOR SELECT TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Acesso por portfolio - insert" ON public.cobranca_config
  FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Acesso por portfolio - update" ON public.cobranca_config
  FOR UPDATE TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Acesso por portfolio - delete" ON public.cobranca_config
  FOR DELETE TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER trg_cobranca_config_updated
  BEFORE UPDATE ON public.cobranca_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.cobranca_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid REFERENCES public.cobranca_config(id) ON DELETE CASCADE,
  portfolio_id uuid,
  valor numeric(12,2),
  contato_telefone text,
  mensagem text,
  origem text,
  status text,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cobranca_envios TO authenticated;
GRANT ALL ON public.cobranca_envios TO service_role;

ALTER TABLE public.cobranca_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por portfolio - select" ON public.cobranca_envios
  FOR SELECT TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));

SELECT cron.schedule(
  'cobranca-send-daily',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ouarszsnukpjbvsymmts.supabase.co/functions/v1/cobranca-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YXJzenNudWtwamJ2c3ltbXRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNDE0OTQsImV4cCI6MjA5MjgxNzQ5NH0.-FvC0DRwmma3Nm-7W74YFeFX21oC4k-QZXOPOyb_6ls'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);