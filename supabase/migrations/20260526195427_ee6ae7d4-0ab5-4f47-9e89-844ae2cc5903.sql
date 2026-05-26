
ALTER TABLE public.mercadolivre_integracoes
  ADD COLUMN IF NOT EXISTS robo_campanha_id uuid;

-- índice para lookup rápido por robô
CREATE INDEX IF NOT EXISTS idx_ml_integracoes_robo
  ON public.mercadolivre_integracoes(robo_campanha_id);

-- garante unicidade por robô (um robô = uma conexão ML)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ml_integracoes_robo
  ON public.mercadolivre_integracoes(robo_campanha_id)
  WHERE robo_campanha_id IS NOT NULL;

-- limpa a conexão quando o robô é excluído
CREATE OR REPLACE FUNCTION public.cleanup_ml_on_robo_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.mercadolivre_integracoes
   WHERE robo_campanha_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_ml_on_robo_delete ON public.robo_campanhas;
CREATE TRIGGER trg_cleanup_ml_on_robo_delete
BEFORE DELETE ON public.robo_campanhas
FOR EACH ROW EXECUTE FUNCTION public.cleanup_ml_on_robo_delete();
