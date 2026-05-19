CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL UNIQUE,
  instance_name text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read whatsapp_connections by portfolio access"
ON public.whatsapp_connections FOR SELECT TO authenticated
USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Insert whatsapp_connections by portfolio access"
ON public.whatsapp_connections FOR INSERT TO authenticated
WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Update whatsapp_connections by portfolio access"
ON public.whatsapp_connections FOR UPDATE TO authenticated
USING (public.has_portfolio_access(auth.uid(), portfolio_id))
WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Delete whatsapp_connections by portfolio access"
ON public.whatsapp_connections FOR DELETE TO authenticated
USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER update_whatsapp_connections_updated_at
BEFORE UPDATE ON public.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();