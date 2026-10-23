ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS meta_leadgen_id text;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS meta_page_id text;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS meta_form_id text;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS meta_ad_id text;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS meta_field_data jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_meta_leadgen_unique ON public.crm_leads(meta_leadgen_id) WHERE meta_leadgen_id IS NOT NULL;
GRANT ALL ON public.crm_leads TO service_role;
COMMENT ON COLUMN public.crm_leads.meta_leadgen_id IS 'Meta submission identity: retries must not duplicate or overwrite CRM workflow state';