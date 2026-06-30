
ALTER TABLE public.whatsapp_agents
  ADD COLUMN IF NOT EXISTS sdr_followup_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.sdr_leads DROP CONSTRAINT IF EXISTS sdr_leads_follow_up_count_check;
ALTER TABLE public.sdr_leads ADD CONSTRAINT sdr_leads_follow_up_count_check CHECK (follow_up_count >= 0 AND follow_up_count <= 3);
