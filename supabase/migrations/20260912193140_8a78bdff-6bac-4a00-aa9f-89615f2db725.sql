CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO task_row FROM public.tasks WHERE id = NEW.task_id;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    INSERT INTO public.notifications(user_id,type,title,body,data,dedupe_key)
    VALUES (NEW.user_id,'task_assigned','Tarefa atribuída a você',task_row.titulo,jsonb_build_object('task_id',NEW.task_id), 'assigned:'||NEW.task_id::text||':'||NEW.user_id::text)
    ON CONFLICT (user_id,dedupe_key) DO NOTHING;
  END IF;

  PERFORM net.http_post(
    url := 'https://ouarszsnukpjbvsymmts.supabase.co/functions/v1/push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzIiwicmVmIjoib3VhcnN6c251a3BqYnZzeW1tdHMiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3NzI0MTQ5NCwiZXhwIjoyMDkyODE3NDk0fQ.-FvC0DRwmma3Nm-7W74YFeFX21oC4k-QZXOPOyb_6ls'
    ),
    body := jsonb_build_object('source', 'task_assignment')
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM PUBLIC, anon, authenticated;