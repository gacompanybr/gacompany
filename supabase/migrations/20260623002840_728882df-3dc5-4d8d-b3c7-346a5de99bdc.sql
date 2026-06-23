ALTER TABLE public.robo_campanhas
  DROP CONSTRAINT IF EXISTS robo_campanhas_marketplace_check;

ALTER TABLE public.robo_campanhas
  ADD CONSTRAINT robo_campanhas_marketplace_check
  CHECK (marketplace IS NULL OR marketplace = ANY (ARRAY['shopee'::text, 'mercadolivre'::text, 'amazon'::text, 'dup'::text]));