
CREATE TABLE public.whatsapp_contact_names (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('informado_pelo_cliente','perfil_whatsapp')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, phone)
);

GRANT SELECT ON public.whatsapp_contact_names TO authenticated;
GRANT ALL ON public.whatsapp_contact_names TO service_role;

ALTER TABLE public.whatsapp_contact_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio members can view contact names"
  ON public.whatsapp_contact_names FOR SELECT
  TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE TRIGGER update_whatsapp_contact_names_updated_at
  BEFORE UPDATE ON public.whatsapp_contact_names
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_whatsapp_contact_names_lookup
  ON public.whatsapp_contact_names (portfolio_id, phone);
