ALTER TABLE public.disparo_campanhas
  ADD COLUMN IF NOT EXISTS lote_tamanho integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pausa_lote_min integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS pausa_ate timestamptz NULL;