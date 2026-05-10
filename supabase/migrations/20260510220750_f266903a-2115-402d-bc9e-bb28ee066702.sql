
CREATE TABLE IF NOT EXISTS public.portfolio_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  user_id uuid NOT NULL,
  papel text NOT NULL DEFAULT 'gestor',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, user_id)
);

ALTER TABLE public.portfolio_responsaveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage portfolio_responsaveis"
ON public.portfolio_responsaveis FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own responsibility"
ON public.portfolio_responsaveis FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Sync to user_portfolio_access
CREATE OR REPLACE FUNCTION public.sync_responsavel_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.user_portfolio_access (user_id, portfolio_id)
    VALUES (NEW.user_id, NEW.portfolio_id)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    DELETE FROM public.user_portfolio_access
    WHERE user_id = OLD.user_id AND portfolio_id = OLD.portfolio_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_responsavel_access_ins ON public.portfolio_responsaveis;
CREATE TRIGGER trg_sync_responsavel_access_ins
AFTER INSERT ON public.portfolio_responsaveis
FOR EACH ROW EXECUTE FUNCTION public.sync_responsavel_access();

DROP TRIGGER IF EXISTS trg_sync_responsavel_access_del ON public.portfolio_responsaveis;
CREATE TRIGGER trg_sync_responsavel_access_del
AFTER DELETE ON public.portfolio_responsaveis
FOR EACH ROW EXECUTE FUNCTION public.sync_responsavel_access();
