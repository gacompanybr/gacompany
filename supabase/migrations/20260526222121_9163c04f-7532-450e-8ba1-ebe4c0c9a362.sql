CREATE UNIQUE INDEX IF NOT EXISTS mercadolivre_integracoes_scrapper_job_id_unique
ON public.mercadolivre_integracoes (scrapper_job_id)
WHERE scrapper_job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mercadolivre_integracoes_robo_campanha_id_unique
ON public.mercadolivre_integracoes (robo_campanha_id)
WHERE robo_campanha_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mercadolivre_integracoes_portfolio_ml_user_unique
ON public.mercadolivre_integracoes (portfolio_id, ml_user_id)
WHERE scrapper_job_id IS NULL AND robo_campanha_id IS NULL;