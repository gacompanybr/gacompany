ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS crm_leads_created_at_idx ON public.crm_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS crm_leads_status_idx ON public.crm_leads(status);
ALTER TABLE public.crm_leads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_leads;

CREATE OR REPLACE FUNCTION public.notify_new_crm_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE detalhe text;
BEGIN
  SELECT f->'values'->>0 INTO detalhe FROM jsonb_array_elements(COALESCE(NEW.meta_field_data,'[]'::jsonb)) f
   WHERE lower(f->>'name') LIKE '%fatura%' LIMIT 1;
  INSERT INTO public.notifications(user_id,type,title,body,data,dedupe_key)
  SELECT DISTINCT ujr.user_id,'new_lead','Novo LEAD',
    NEW.nome || COALESCE(' — ' || detalhe, ''),
    jsonb_build_object('lead_id',NEW.id,'path','/paineladmin'),
    'lead:'||NEW.id::text||':'||ujr.user_id::text
  FROM public.user_job_roles ujr JOIN public.job_roles jr ON jr.id=ujr.job_role_id
  WHERE jr.key='ceo'
  ON CONFLICT (user_id,dedupe_key) DO NOTHING;
  PERFORM net.http_post(
    url := 'https://ouarszsnukpjbvsymmts.supabase.co/functions/v1/push-notifications',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YXJzenNudWtwamJ2c3ltbXRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNDE0OTQsImV4cCI6MjA5MjgxNzQ5NH0.-FvC0DRwmma3Nm-7W74YFeFX21oC4k-QZXOPOyb_6ls'),
    body := jsonb_build_object('source','new_lead'));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_new_crm_lead ON public.crm_leads;
CREATE TRIGGER trg_notify_new_crm_lead AFTER INSERT ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.notify_new_crm_lead();