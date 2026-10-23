CREATE TABLE public.crm_meta_bindings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 page_id text NOT NULL,
 account_id text NOT NULL,
 account_name text NOT NULL,
 campaign_id text NOT NULL,
 campaign_name text NOT NULL,
 form_id text NOT NULL,
 form_name text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(page_id, campaign_id, form_id)
);
GRANT SELECT ON public.crm_meta_bindings TO authenticated;
GRANT ALL ON public.crm_meta_bindings TO service_role;
ALTER TABLE public.crm_meta_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM viewers read Meta bindings" ON public.crm_meta_bindings FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'clients.view'));
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS meta_campaign_id text;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS meta_account_id text;