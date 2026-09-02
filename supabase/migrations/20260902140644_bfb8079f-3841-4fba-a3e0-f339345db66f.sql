-- lovable-cron-fallback-reviewed: 288 runs/day; o worker envia em lotes de 20 e-mails por execução e precisa acordar sozinho para continuar campanhas longas; não há evento de banco que dispare o próximo lote.
SELECT cron.schedule(
  'email-campaign-send-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ouarszsnukpjbvsymmts.supabase.co/functions/v1/email-campaign-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YXJzenNudWtwamJ2c3ltbXRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNDE0OTQsImV4cCI6MjA5MjgxNzQ5NH0.-FvC0DRwmma3Nm-7W74YFeFX21oC4k-QZXOPOyb_6ls'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);