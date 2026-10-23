-- lovable-cron-fallback-reviewed: Explicit one-minute recovery requirement; wake on enqueue and unschedule after drain, no permanent polling.
CREATE TABLE public.whatsapp_recovery_config (id boolean PRIMARY KEY DEFAULT true CHECK(id), callback_token uuid NOT NULL DEFAULT gen_random_uuid());
GRANT ALL ON public.whatsapp_recovery_config TO service_role;
ALTER TABLE public.whatsapp_recovery_config ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.wake_agent_recovery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid;
BEGIN
 IF TG_TABLE_NAME='whatsapp_conversas' THEN
 IF NEW.reply_state NOT IN ('received','processing','failed') OR NOT EXISTS(SELECT 1 FROM public.whatsapp_agents WHERE id=NEW.agent_id AND melhorias_enabled AND watchdog_enabled AND status='active') THEN RETURN NEW; END IF;
 ELSE
 IF NEW.status<>'pending' THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO public.whatsapp_recovery_config(id) VALUES(true) ON CONFLICT DO NOTHING;
 SELECT callback_token INTO t FROM public.whatsapp_recovery_config WHERE id=true;
 PERFORM pg_advisory_xact_lock(hashtext('agent-recovery-schedule'));
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='agent-recovery-while-pending') THEN
 PERFORM cron.schedule('agent-recovery-while-pending','* * * * *',format($job$SELECT net.http_post(url:='https://ouarszsnukpjbvsymmts.supabase.co/functions/v1/whatsapp-reply-watchdog',headers:=jsonb_build_object('Content-Type','application/json','X-Agent-Recovery-Key',%L),body:='{}'::jsonb);$job$,t::text));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.wake_agent_recovery() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wake_reply_recovery AFTER INSERT OR UPDATE OF reply_state ON public.whatsapp_conversas FOR EACH ROW WHEN (NEW.reply_state IN ('received','processing','failed')) EXECUTE FUNCTION public.wake_agent_recovery();
CREATE TRIGGER wake_handoff_recovery AFTER INSERT OR UPDATE OF status ON public.whatsapp_handoffs FOR EACH ROW WHEN(NEW.status='pending') EXECUTE FUNCTION public.wake_agent_recovery();
CREATE OR REPLACE FUNCTION public.drain_agent_recovery() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('agent-recovery-schedule'));
 IF NOT EXISTS(SELECT 1 FROM public.whatsapp_conversas c JOIN public.whatsapp_agents a ON a.id=c.agent_id WHERE c.reply_state IN ('received','processing','failed','sending') AND c.created_at>now()-interval '6 hours' AND c.recovered_at IS NULL AND a.melhorias_enabled AND a.watchdog_enabled AND a.status='active') AND NOT EXISTS(SELECT 1 FROM public.whatsapp_handoffs h JOIN public.whatsapp_agents a ON a.id=h.agent_id WHERE h.status='pending' AND h.attempts<5 AND a.melhorias_enabled AND a.handoff_enabled) THEN
 FOR j IN SELECT jobid FROM cron.job WHERE jobname='agent-recovery-while-pending' LOOP PERFORM cron.unschedule(j); END LOOP;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.drain_agent_recovery() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drain_agent_recovery() TO service_role;
CREATE TABLE public.whatsapp_agent_alerts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid NOT NULL, agent_id uuid NOT NULL, dedupe_key text NOT NULL UNIQUE, reason text NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.whatsapp_agent_alerts TO authenticated;
GRANT ALL ON public.whatsapp_agent_alerts TO service_role;
ALTER TABLE public.whatsapp_agent_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alerts_portfolio_read ON public.whatsapp_agent_alerts FOR SELECT TO authenticated USING(public.has_portfolio_access(auth.uid(),portfolio_id));