CREATE TABLE public.whatsapp_sent_messages_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  instance_name text NOT NULL,
  phone text NOT NULL,
  message_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX whatsapp_sent_messages_log_msg_idx ON public.whatsapp_sent_messages_log (message_id);
CREATE INDEX whatsapp_sent_messages_log_created_idx ON public.whatsapp_sent_messages_log (created_at);

GRANT ALL ON public.whatsapp_sent_messages_log TO service_role;
ALTER TABLE public.whatsapp_sent_messages_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view sent messages log"
  ON public.whatsapp_sent_messages_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.whatsapp_paused_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  phone text NOT NULL,
  paused_until timestamptz NOT NULL,
  reason text NOT NULL DEFAULT 'manual_human_message',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, phone)
);

GRANT SELECT ON public.whatsapp_paused_contacts TO authenticated;
GRANT ALL ON public.whatsapp_paused_contacts TO service_role;
ALTER TABLE public.whatsapp_paused_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Portfolio members can view paused contacts"
  ON public.whatsapp_paused_contacts FOR SELECT TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER update_whatsapp_paused_contacts_updated_at
  BEFORE UPDATE ON public.whatsapp_paused_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();