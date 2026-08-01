ALTER TABLE public.robo_produtos_enviados ADD COLUMN IF NOT EXISTS name_key text;
CREATE INDEX IF NOT EXISTS robo_produtos_enviados_robo_name_key_idx
  ON public.robo_produtos_enviados (robo_id, name_key, sent_at DESC);