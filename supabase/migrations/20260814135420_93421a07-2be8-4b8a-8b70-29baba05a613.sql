ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS imagens_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS aspect_ratio text NOT NULL DEFAULT '1:1';