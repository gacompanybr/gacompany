CREATE TABLE public.whatsapp_report_dedupe (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL,
  phone TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, phone, trigger_type)
);
GRANT ALL ON public.whatsapp_report_dedupe TO service_role;
ALTER TABLE public.whatsapp_report_dedupe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.whatsapp_report_dedupe FOR ALL USING (false) WITH CHECK (false);
CREATE INDEX idx_wa_report_dedupe_lookup ON public.whatsapp_report_dedupe (portfolio_id, phone, trigger_type, last_sent_at DESC);