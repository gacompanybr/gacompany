CREATE TABLE public.whatsapp_order_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
 agent_id uuid NOT NULL REFERENCES public.whatsapp_agents(id) ON DELETE CASCADE,
 phone text NOT NULL,
 order_key text NOT NULL,
 group_id text,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','accepted','delivered','failed','uncertain')),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 message_id text,
 error text,
 attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(agent_id,phone,order_key)
);
GRANT SELECT ON public.whatsapp_order_reports TO authenticated;
GRANT ALL ON public.whatsapp_order_reports TO service_role;
ALTER TABLE public.whatsapp_order_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Portfolio members read order reports" ON public.whatsapp_order_reports FOR SELECT TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE INDEX whatsapp_order_reports_recent ON public.whatsapp_order_reports(portfolio_id,created_at DESC);