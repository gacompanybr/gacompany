ALTER TABLE public.sdr_leads DROP CONSTRAINT IF EXISTS sdr_leads_status_check;
ALTER TABLE public.sdr_leads ADD CONSTRAINT sdr_leads_status_check
  CHECK (status = ANY (ARRAY['pendente','enviando','enviado','respondeu','reuniao_confirmada','rejeitou','ia_detectada','aguardando_humano','sem_resposta','invalido']));