ALTER TABLE public.whatsapp_contact_preferences ADD COLUMN scheduled_followup_at timestamptz, ADD COLUMN scheduled_followup_status text CHECK (scheduled_followup_status IN ('pending', 'processing', 'sent', 'failed')), ADD COLUMN scheduled_followup_token uuid;
CREATE INDEX contact_followup_due_idx ON public.whatsapp_contact_preferences (scheduled_followup_at) WHERE scheduled_followup_status = 'pending';
CREATE OR REPLACE FUNCTION public.enforce_contact_followup_preferences() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.customer_status = 'course_purchased' THEN NEW.followup_disabled := true; END IF;
  IF NEW.followup_disabled THEN
    NEW.scheduled_followup_at := NULL;
    NEW.scheduled_followup_status := NULL;
    NEW.scheduled_followup_token := NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.invalidated_before := CASE WHEN NEW.followup_disabled OR NEW.scheduled_followup_at IS NOT NULL THEN clock_timestamp() ELSE NULL END;
    IF NEW.scheduled_followup_at IS NOT NULL THEN
      IF NEW.scheduled_followup_at <= clock_timestamp() THEN RAISE EXCEPTION 'Choose a future follow-up date'; END IF;
      NEW.scheduled_followup_status := 'pending';
      NEW.scheduled_followup_token := gen_random_uuid();
    END IF;
  ELSE
    IF OLD.scheduled_followup_at IS DISTINCT FROM NEW.scheduled_followup_at THEN
      IF NEW.scheduled_followup_at IS NOT NULL THEN
        IF NEW.scheduled_followup_at <= clock_timestamp() THEN RAISE EXCEPTION 'Choose a future follow-up date'; END IF;
        NEW.scheduled_followup_status := 'pending';
        NEW.scheduled_followup_token := gen_random_uuid();
      ELSE
        NEW.scheduled_followup_status := NULL;
        NEW.scheduled_followup_token := NULL;
      END IF;
    END IF;
    IF OLD.followup_disabled IS DISTINCT FROM NEW.followup_disabled OR OLD.customer_status IS DISTINCT FROM NEW.customer_status OR OLD.scheduled_followup_at IS DISTINCT FROM NEW.scheduled_followup_at OR OLD.scheduled_followup_status IS DISTINCT FROM NEW.scheduled_followup_status THEN
      NEW.invalidated_before := clock_timestamp();
    ELSE
      NEW.invalidated_before := OLD.invalidated_before;
    END IF;
    IF current_user IN ('authenticated', 'anon') AND OLD.scheduled_followup_at IS NOT DISTINCT FROM NEW.scheduled_followup_at THEN
      NEW.scheduled_followup_status := OLD.scheduled_followup_status;
      NEW.scheduled_followup_token := OLD.scheduled_followup_token;
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;