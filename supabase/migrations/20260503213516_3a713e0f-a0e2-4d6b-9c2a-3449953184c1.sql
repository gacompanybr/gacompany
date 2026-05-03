-- 1. Tabela whatsapp_agents
CREATE TABLE IF NOT EXISTS public.whatsapp_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  instancia_id TEXT,
  telefone TEXT,
  nome_atendente TEXT NOT NULL DEFAULT 'Assistente',
  tom_de_voz TEXT NOT NULL DEFAULT 'profissional',
  instrucoes_base TEXT,
  mensagem_boas_vindas TEXT,
  horario_inicio TIME DEFAULT '08:00',
  horario_fim TIME DEFAULT '18:00',
  dias_semana JSONB NOT NULL DEFAULT '["seg","ter","qua","qui","sex"]'::jsonb,
  fora_horario_msg TEXT DEFAULT 'Olá! No momento estou fora do horário de atendimento.',
  faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  modelo_ia TEXT NOT NULL DEFAULT 'gemini',
  temperatura NUMERIC NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id)
);

ALTER TABLE public.whatsapp_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read whatsapp_agents by portfolio access"
  ON public.whatsapp_agents FOR SELECT TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Insert whatsapp_agents by portfolio access"
  ON public.whatsapp_agents FOR INSERT TO authenticated
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Update whatsapp_agents by portfolio access"
  ON public.whatsapp_agents FOR UPDATE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id))
  WITH CHECK (public.has_portfolio_access(auth.uid(), portfolio_id));

CREATE POLICY "Delete whatsapp_agents by portfolio access"
  ON public.whatsapp_agents FOR DELETE TO authenticated
  USING (public.has_portfolio_access(auth.uid(), portfolio_id));

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_whatsapp_agents_updated_at ON public.whatsapp_agents;
CREATE TRIGGER trg_whatsapp_agents_updated_at
  BEFORE UPDATE ON public.whatsapp_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Campos extras em meta_campanhas
ALTER TABLE public.meta_campanhas ADD COLUMN IF NOT EXISTS orcamento_diario NUMERIC;
ALTER TABLE public.meta_campanhas ADD COLUMN IF NOT EXISTS data_inicio DATE;
ALTER TABLE public.meta_campanhas ADD COLUMN IF NOT EXISTS data_fim DATE;
ALTER TABLE public.meta_campanhas ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- 3. Permitir users com acesso ao portfolio editar campanhas (hoje só admin escreve)
DROP POLICY IF EXISTS "Insert meta_campanhas by portfolio access" ON public.meta_campanhas;
CREATE POLICY "Insert meta_campanhas by portfolio access"
  ON public.meta_campanhas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meta_integracoes m
    WHERE m.id = integration_id
      AND public.has_portfolio_access(auth.uid(), m.portfolio_id)
  ));

DROP POLICY IF EXISTS "Update meta_campanhas by portfolio access" ON public.meta_campanhas;
CREATE POLICY "Update meta_campanhas by portfolio access"
  ON public.meta_campanhas FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.meta_integracoes m
    WHERE m.id = integration_id
      AND public.has_portfolio_access(auth.uid(), m.portfolio_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meta_integracoes m
    WHERE m.id = integration_id
      AND public.has_portfolio_access(auth.uid(), m.portfolio_id)
  ));

DROP POLICY IF EXISTS "Delete meta_campanhas by portfolio access" ON public.meta_campanhas;
CREATE POLICY "Delete meta_campanhas by portfolio access"
  ON public.meta_campanhas FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.meta_integracoes m
    WHERE m.id = integration_id
      AND public.has_portfolio_access(auth.uid(), m.portfolio_id)
  ));