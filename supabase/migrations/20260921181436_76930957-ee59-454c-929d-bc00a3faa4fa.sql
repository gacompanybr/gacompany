ALTER TABLE public.crm_leads ALTER COLUMN portfolio_id DROP NOT NULL;

DROP POLICY IF EXISTS "Portfolio access leads select" ON public.crm_leads;
DROP POLICY IF EXISTS "Portfolio access leads insert" ON public.crm_leads;
DROP POLICY IF EXISTS "Portfolio access leads update" ON public.crm_leads;
DROP POLICY IF EXISTS "Portfolio access leads delete" ON public.crm_leads;
DROP POLICY IF EXISTS "Portfolio access interacoes select" ON public.crm_interacoes;
DROP POLICY IF EXISTS "Portfolio access interacoes insert" ON public.crm_interacoes;
DROP POLICY IF EXISTS "Portfolio access interacoes delete" ON public.crm_interacoes;

CREATE POLICY "CRM leads select"
ON public.crm_leads FOR SELECT TO authenticated
USING (
  CASE
    WHEN portfolio_id IS NULL THEN public.has_permission(auth.uid(), 'clients.view')
    ELSE public.has_portfolio_access(auth.uid(), portfolio_id)
  END
);

CREATE POLICY "CRM leads insert"
ON public.crm_leads FOR INSERT TO authenticated
WITH CHECK (
  CASE
    WHEN portfolio_id IS NULL THEN public.has_permission(auth.uid(), 'clients.view')
    ELSE public.has_portfolio_access(auth.uid(), portfolio_id)
  END
);

CREATE POLICY "CRM leads update"
ON public.crm_leads FOR UPDATE TO authenticated
USING (
  CASE
    WHEN portfolio_id IS NULL THEN public.has_permission(auth.uid(), 'clients.view')
    ELSE public.has_portfolio_access(auth.uid(), portfolio_id)
  END
)
WITH CHECK (
  CASE
    WHEN portfolio_id IS NULL THEN public.has_permission(auth.uid(), 'clients.view')
    ELSE public.has_portfolio_access(auth.uid(), portfolio_id)
  END
);

CREATE POLICY "CRM leads delete"
ON public.crm_leads FOR DELETE TO authenticated
USING (
  CASE
    WHEN portfolio_id IS NULL THEN public.has_permission(auth.uid(), 'clients.view')
    ELSE public.has_portfolio_access(auth.uid(), portfolio_id)
  END
);

CREATE POLICY "CRM interactions select"
ON public.crm_interacoes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id = crm_interacoes.lead_id
      AND (
        (l.portfolio_id IS NULL AND public.has_permission(auth.uid(), 'clients.view'))
        OR public.has_portfolio_access(auth.uid(), l.portfolio_id)
      )
  )
);

CREATE POLICY "CRM interactions insert"
ON public.crm_interacoes FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id = crm_interacoes.lead_id
      AND (
        (l.portfolio_id IS NULL AND public.has_permission(auth.uid(), 'clients.view'))
        OR public.has_portfolio_access(auth.uid(), l.portfolio_id)
      )
  )
);

CREATE POLICY "CRM interactions delete"
ON public.crm_interacoes FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id = crm_interacoes.lead_id
      AND (
        (l.portfolio_id IS NULL AND public.has_permission(auth.uid(), 'clients.view'))
        OR public.has_portfolio_access(auth.uid(), l.portfolio_id)
      )
  )
);