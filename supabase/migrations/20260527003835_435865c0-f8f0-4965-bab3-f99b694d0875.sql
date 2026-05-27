UPDATE public.scrapper_jobs
SET config = config
  || jsonb_build_object(
    'min_products', 10,
    'max_products', 150,
    'ml_pages', 10,
    'ml_keywords_per_run', 1,
    'ml_limit_per_page', 50,
    'ml_default_keyword', 'ofertas'
  )
WHERE id = 'f833c52f-ca80-494d-b952-3ad67ae304ae';