CREATE TABLE public.whatsapp_contact_preferences (
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  phone text NOT NULL CHECK (phone ~ '^[0-9]{8,15}$'),
  followup_disabled boolean NOT NULL DEFAULT false,
  customer_status text NOT NULL DEFAULT 'lead' CHECK (customer_status IN ('lead', 'course_purchased')),
  invalidated_before timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (portfolio_id, phone)
);
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_contact_preferences TO authenticated;
GRANT ALL ON public.whatsapp_contact_preferences TO service_role;
ALTER TABLE public.whatsapp_contact_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Portfolio members read contact preferences" ON public.whatsapp_contact_preferences FOR SELECT TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Portfolio members insert contact preferences" ON public.whatsapp_contact_preferences FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Portfolio members update contact preferences" ON public.whatsapp_contact_preferences FOR UPDATE TO authenticated USING (public.has_portfolio_access(auth.uid(), portfolio_id)) WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE OR REPLACE FUNCTION public.enforce_contact_followup_preferences() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.customer_status = 'course_purchased' THEN NEW.followup_disabled := true; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.invalidated_before := CASE WHEN NEW.followup_disabled THEN clock_timestamp() ELSE NULL END;
  ELSE
    IF OLD.followup_disabled IS DISTINCT FROM NEW.followup_disabled OR OLD.customer_status IS DISTINCT FROM NEW.customer_status THEN
      NEW.invalidated_before := clock_timestamp();
    ELSE
      NEW.invalidated_before := OLD.invalidated_before;
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_contact_followup_preferences BEFORE INSERT OR UPDATE ON public.whatsapp_contact_preferences FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_followup_preferences();