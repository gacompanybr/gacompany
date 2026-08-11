CREATE TABLE public.whatsapp_agent_followups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  phone text NOT NULL,
  followups_sent integer NOT NULL DEFAULT 0,
  last_agent_message_at timestamp with time zone,
  last_followup_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, phone)
);

GRANT SELECT ON public.whatsapp_agent_followups TO authenticated;
GRANT ALL ON public.whatsapp_agent_followups TO service_role;

ALTER TABLE public.whatsapp_agent_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio members can view followups"
ON public.whatsapp_agent_followups
FOR SELECT
TO authenticated
USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER trg_whatsapp_agent_followups_updated_at
BEFORE UPDATE ON public.whatsapp_agent_followups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();