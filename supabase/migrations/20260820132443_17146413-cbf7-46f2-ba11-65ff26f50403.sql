-- 1) Limpa o histórico interno do pg_net (log técnico, não é dado do app)
TRUNCATE net._http_response;

-- 2) Retenção automática: mantém só os últimos 30 minutos
CREATE OR REPLACE FUNCTION public.purge_pgnet_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, net
AS $$
  DELETE FROM net._http_response WHERE created < now() - interval '30 minutes';
$$;

SELECT cron.schedule('purge-pgnet-hourly', '7 * * * *', $$SELECT public.purge_pgnet_history()$$);

-- 3) Espaça os workers de 1min para 2min (mesma funcionalidade, metade da escrita)
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'robo-worker-every-minute'), schedule => '*/2 * * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'disparo-worker-every-minute'), schedule => '*/2 * * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'sdr-worker-1min'), schedule => '*/2 * * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'social-scheduler-every-minute'), schedule => '*/2 * * * *');