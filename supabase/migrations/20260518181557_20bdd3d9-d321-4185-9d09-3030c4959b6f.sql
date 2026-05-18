-- Extensões para agendamento
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Campos novos no robo_campanhas
ALTER TABLE public.robo_campanhas
  ADD COLUMN IF NOT EXISTS mensagens jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS proxima_execucao timestamptz,
  ADD COLUMN IF NOT EXISTS total_enviados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_erro text;

-- Trigger updated_at se ainda não existir
DROP TRIGGER IF EXISTS robo_campanhas_set_updated_at ON public.robo_campanhas;
CREATE TRIGGER robo_campanhas_set_updated_at
BEFORE UPDATE ON public.robo_campanhas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();