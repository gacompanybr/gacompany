-- Garante extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento antigo (se existir) para evitar duplicidade
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sdr-worker-1min') THEN
    PERFORM cron.unschedule('sdr-worker-1min');
  END IF;
END $$;

-- Recria o agendamento: chama a edge function sdr-worker a cada minuto
SELECT cron.schedule(
  'sdr-worker-1min',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url:='https://ouarszsnukpjbvsymmts.supabase.co/functions/v1/sdr-worker',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YXJzenNudWtwamJ2c3ltbXRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNDE0OTQsImV4cCI6MjA5MjgxNzQ5NH0.-FvC0DRwmma3Nm-7W74YFeFX21oC4k-QZXOPOyb_6ls"}'::jsonb,
    body:='{}'::jsonb
  );
  $cron$
);