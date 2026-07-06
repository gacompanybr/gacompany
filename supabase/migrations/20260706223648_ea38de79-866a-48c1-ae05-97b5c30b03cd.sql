ALTER TABLE public.scrapper_product_history
ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();