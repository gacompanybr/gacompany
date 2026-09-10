CREATE TYPE public.financial_cost_type AS ENUM ('mensal', 'unico');

CREATE TABLE public.financial_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  valor numeric NOT NULL DEFAULT 0,
  tipo public.financial_cost_type NOT NULL DEFAULT 'mensal',
  categoria text,
  data_referencia date NOT NULL DEFAULT CURRENT_DATE,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_costs TO authenticated;
GRANT ALL ON public.financial_costs TO service_role;

ALTER TABLE public.financial_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage costs" ON public.financial_costs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_financial_costs_updated
  BEFORE UPDATE ON public.financial_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_financial_costs_tipo_data ON public.financial_costs (tipo, data_referencia);