CREATE OR REPLACE VIEW public.meta_integracoes_public 
WITH (security_invoker = true) AS
SELECT 
  id,
  portfolio_id,
  nome_portfolio,
  nome_conta_anuncio,
  ad_account_id,
  status,
  ultima_atualizacao,
  created_at,
  updated_at
FROM public.meta_integracoes;

GRANT SELECT ON public.meta_integracoes_public TO anon, authenticated;

-- Permitir leitura pública via a view (security_invoker respeita RLS, então adicionamos policy)
CREATE POLICY "Public read meta_integracoes safe fields"
ON public.meta_integracoes
FOR SELECT
TO anon, authenticated
USING (true);

-- Revoke direct column access to access_token via column-level grants
REVOKE SELECT ON public.meta_integracoes FROM anon, authenticated;
GRANT SELECT (id, portfolio_id, nome_portfolio, nome_conta_anuncio, ad_account_id, status, ultima_atualizacao, created_at, updated_at) 
  ON public.meta_integracoes TO anon, authenticated;