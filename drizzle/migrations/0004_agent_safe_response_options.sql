ALTER TABLE public.whatsapp_agents ADD COLUMN IF NOT EXISTS melhorias_enabled boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS catalog_multi_enabled boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS handoff_enabled boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS watchdog_enabled boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS fora_horario_modo text NOT NULL DEFAULT 'silencio' CHECK (fora_horario_modo IN ('silencio','responder')), ADD COLUMN IF NOT EXISTS pedir_nome text NOT NULL DEFAULT 'sempre' CHECK (pedir_nome IN ('sempre','no_fechamento','nunca')), ADD COLUMN IF NOT EXISTS report_profile text NOT NULL DEFAULT 'odonto' CHECK (report_profile IN ('odonto','generico')), ADD COLUMN IF NOT EXISTS mensagem_fallback text NOT NULL DEFAULT 'Já anotei o que você precisa. A equipe vai precisar confirmar essa informação para te responder certinho.', ADD COLUMN IF NOT EXISTS alert_number text, ADD COLUMN IF NOT EXISTS recovery_after_seconds integer NOT NULL DEFAULT 90 CHECK (recovery_after_seconds BETWEEN 90 AND 3600), ADD COLUMN IF NOT EXISTS ai_paused_reason text;
ALTER TABLE public.whatsapp_conversas ADD COLUMN IF NOT EXISTS agent_id uuid, ADD COLUMN IF NOT EXISTS reply_state text CHECK (reply_state IN ('received','processing','sending','replied','failed','uncertain','skipped_inactive','skipped_paused','skipped_hours','skipped_superseded','skipped_stop')), ADD COLUMN IF NOT EXISTS reply_state_reason text, ADD COLUMN IF NOT EXISTS processing_started_at timestamptz, ADD COLUMN IF NOT EXISTS reply_token uuid, ADD COLUMN IF NOT EXISTS send_targets jsonb, ADD COLUMN IF NOT EXISTS remote_jid text, ADD COLUMN IF NOT EXISTS fallback_used boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS reply_timings jsonb, ADD COLUMN IF NOT EXISTS recovered_at timestamptz;
CREATE INDEX IF NOT EXISTS whatsapp_conversas_reply_pending_idx ON public.whatsapp_conversas(reply_state, created_at) WHERE reply_state IN ('received','processing','failed','sending');
CREATE TABLE public.whatsapp_handoffs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE, agent_id uuid NOT NULL REFERENCES public.whatsapp_agents(id) ON DELETE CASCADE, phone text NOT NULL, tipo text NOT NULL, resumo text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, dedupe_key text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','accepted','uncertain','failed','attended')), attempts integer NOT NULL DEFAULT 0, error text, message_id text, fora_do_horario boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), claim_token uuid, next_attempt_at timestamptz NOT NULL DEFAULT now(), UNIQUE(agent_id, dedupe_key));
GRANT SELECT ON public.whatsapp_handoffs TO authenticated;
GRANT ALL ON public.whatsapp_handoffs TO service_role;
ALTER TABLE public.whatsapp_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY handoffs_portfolio_read ON public.whatsapp_handoffs FOR SELECT TO authenticated USING(public.has_portfolio_access(auth.uid(), portfolio_id));
CREATE INDEX handoffs_pending_idx ON public.whatsapp_handoffs(status, next_attempt_at);
CREATE OR REPLACE FUNCTION public.claim_agent_reply(_id uuid, _token uuid, _recovery boolean DEFAULT false) RETURNS SETOF public.whatsapp_conversas LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 RETURN QUERY UPDATE public.whatsapp_conversas c SET reply_state='processing', reply_token=_token, processing_started_at=clock_timestamp(), recovered_at=CASE WHEN _recovery THEN clock_timestamp() ELSE c.recovered_at END
 WHERE c.id=_id AND c.role='user' AND c.sdr_lead_id IS NULL
 AND (c.reply_state='received' OR (_recovery AND c.reply_state IN ('processing','failed') AND c.recovered_at IS NULL AND COALESCE(c.processing_started_at,c.created_at) < now()-interval '90 seconds'))
 AND c.created_at > now()-interval '6 hours'
 AND EXISTS(SELECT 1 FROM public.whatsapp_agents a WHERE a.id=c.agent_id AND a.status='active' AND a.melhorias_enabled AND (NOT _recovery OR a.watchdog_enabled))
 AND NOT EXISTS(SELECT 1 FROM public.whatsapp_conversas n WHERE n.portfolio_id=c.portfolio_id AND n.contato_telefone=c.contato_telefone AND n.created_at>c.created_at AND n.role IN ('assistant','human','user')) RETURNING c.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_agent_reply(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_reply(uuid,uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_agent_handoff(_id uuid, _token uuid) RETURNS SETOF public.whatsapp_handoffs LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.whatsapp_handoffs h SET status='sending', claim_token=_token, attempts=attempts+1, updated_at=clock_timestamp()
 WHERE h.id=_id AND h.status='pending' AND h.attempts<5 AND h.next_attempt_at<=now()
 AND EXISTS(SELECT 1 FROM public.whatsapp_agents a WHERE a.id=h.agent_id AND a.melhorias_enabled AND a.handoff_enabled AND a.report_profile='generico') RETURNING h.*;
$$;
REVOKE ALL ON FUNCTION public.claim_agent_handoff(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_handoff(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.manage_agent_handoff(_id uuid,_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h public.whatsapp_handoffs;
BEGIN
 SELECT * INTO h FROM public.whatsapp_handoffs WHERE id=_id FOR UPDATE;
 IF h.id IS NULL OR NOT public.has_portfolio_access(auth.uid(),h.portfolio_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
 IF _action='attended' THEN
  UPDATE public.whatsapp_handoffs SET status='attended', updated_at=now() WHERE id=_id AND status<>'sending';
 ELSIF _action='retry' AND h.status IN ('failed','pending') THEN
  UPDATE public.whatsapp_handoffs SET status='pending', attempts=0, error=NULL,next_attempt_at=now(),updated_at=now() WHERE id=_id;
 ELSE RAISE EXCEPTION 'Action not allowed; uncertain deliveries require manual verification'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.manage_agent_handoff(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_agent_handoff(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_agent_safe_options() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.portfolio_id='bab9656f-f264-4930-9483-c66733394364'::uuid AND (NEW.melhorias_enabled OR NEW.catalog_multi_enabled OR NEW.handoff_enabled OR NEW.watchdog_enabled OR NEW.report_profile<>'odonto' OR NEW.fora_horario_modo<>'silencio' OR NEW.pedir_nome<>'sempre') THEN RAISE EXCEPTION 'Lopes Saúde is protected from the new agent rollout'; END IF;
 IF TG_OP='UPDATE' AND current_user IN ('authenticated','anon') THEN NEW.ai_paused_reason:=OLD.ai_paused_reason; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_agent_safe_options BEFORE INSERT OR UPDATE ON public.whatsapp_agents FOR EACH ROW EXECUTE FUNCTION public.guard_agent_safe_options();