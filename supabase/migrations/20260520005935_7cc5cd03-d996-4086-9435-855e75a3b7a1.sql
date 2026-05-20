
-- 1) Novos campos em robo_campanhas
ALTER TABLE public.robo_campanhas
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'ecommerce',
  ADD COLUMN IF NOT EXISTS marketplace text,
  ADD COLUMN IF NOT EXISTS n8n_datatable_id text,
  ADD COLUMN IF NOT EXISTS n8n_datatable_name text,
  ADD COLUMN IF NOT EXISTS n8n_workflow_id text,
  ADD COLUMN IF NOT EXISTS planilha_url text,
  ADD COLUMN IF NOT EXISTS scrapper_job_id uuid,
  ADD COLUMN IF NOT EXISTS message_template text;

-- Constraint suave: valores válidos
ALTER TABLE public.robo_campanhas
  DROP CONSTRAINT IF EXISTS robo_campanhas_campaign_type_check;
ALTER TABLE public.robo_campanhas
  ADD CONSTRAINT robo_campanhas_campaign_type_check
  CHECK (campaign_type IN ('disparo','ecommerce'));

ALTER TABLE public.robo_campanhas
  DROP CONSTRAINT IF EXISTS robo_campanhas_marketplace_check;
ALTER TABLE public.robo_campanhas
  ADD CONSTRAINT robo_campanhas_marketplace_check
  CHECK (marketplace IS NULL OR marketplace IN ('shopee','mercadolivre','amazon'));

-- 2) Bucket de Storage para CSVs de disparo
INSERT INTO storage.buckets (id, name, public)
VALUES ('disparo-csvs', 'disparo-csvs', false)
ON CONFLICT (id) DO NOTHING;

-- Policies: usuários com acesso ao portfólio podem ler/escrever
-- Estrutura de path: <portfolio_id>/<filename>
CREATE POLICY "Portfolio access read disparo-csvs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'disparo-csvs'
    AND public.has_portfolio_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Portfolio access insert disparo-csvs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'disparo-csvs'
    AND public.has_portfolio_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Portfolio access update disparo-csvs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'disparo-csvs'
    AND public.has_portfolio_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Portfolio access delete disparo-csvs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'disparo-csvs'
    AND public.has_portfolio_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
