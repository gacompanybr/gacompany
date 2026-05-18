-- Disparo de mensagens
CREATE TABLE public.disparo_campanhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL,
  nome TEXT NOT NULL,
  instancia_id TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|executando|pausada|concluida
  mensagens JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de variações
  planilha_url TEXT,
  delay_min_seg INTEGER NOT NULL DEFAULT 8,
  delay_max_seg INTEGER NOT NULL DEFAULT 20,
  total_contatos INTEGER NOT NULL DEFAULT 0,
  enviados INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.disparo_campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read disparo_campanhas by portfolio access" ON public.disparo_campanhas
  FOR SELECT TO authenticated USING (has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Insert disparo_campanhas by portfolio access" ON public.disparo_campanhas
  FOR INSERT TO authenticated WITH CHECK (has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Update disparo_campanhas by portfolio access" ON public.disparo_campanhas
  FOR UPDATE TO authenticated USING (has_portfolio_access(auth.uid(), portfolio_id))
  WITH CHECK (has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Delete disparo_campanhas by portfolio access" ON public.disparo_campanhas
  FOR DELETE TO authenticated USING (has_portfolio_access(auth.uid(), portfolio_id));
CREATE TRIGGER trg_disparo_campanhas_updated BEFORE UPDATE ON public.disparo_campanhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.disparo_contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL REFERENCES public.disparo_campanhas(id) ON DELETE CASCADE,
  nome TEXT,
  telefone TEXT NOT NULL,
  variaveis JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente|enviado|falhou
  enviado_em TIMESTAMP WITH TIME ZONE,
  erro TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.disparo_contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read disparo_contatos by portfolio access" ON public.disparo_contatos
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.disparo_campanhas c
            WHERE c.id = disparo_contatos.campanha_id
              AND has_portfolio_access(auth.uid(), c.portfolio_id)));
CREATE POLICY "Insert disparo_contatos by portfolio access" ON public.disparo_contatos
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.disparo_campanhas c
            WHERE c.id = disparo_contatos.campanha_id
              AND has_portfolio_access(auth.uid(), c.portfolio_id)));
CREATE POLICY "Update disparo_contatos by portfolio access" ON public.disparo_contatos
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.disparo_campanhas c
            WHERE c.id = disparo_contatos.campanha_id
              AND has_portfolio_access(auth.uid(), c.portfolio_id)));
CREATE POLICY "Delete disparo_contatos by portfolio access" ON public.disparo_contatos
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.disparo_campanhas c
            WHERE c.id = disparo_contatos.campanha_id
              AND has_portfolio_access(auth.uid(), c.portfolio_id)));

-- Scrapper
CREATE TABLE public.scrapper_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'ecommerce', -- ecommerce|outros
  plataforma TEXT NOT NULL, -- shopee|mercado_livre|amazon|custom
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- termos, filtros, frequencia
  agendamento_cron TEXT, -- ex: '0 */6 * * *'
  output_url TEXT, -- planilha gerada
  status TEXT NOT NULL DEFAULT 'inativo', -- inativo|ativo|erro
  ultima_execucao TIMESTAMP WITH TIME ZONE,
  ultima_qtd INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.scrapper_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read scrapper_jobs by portfolio access" ON public.scrapper_jobs
  FOR SELECT TO authenticated USING (has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Insert scrapper_jobs by portfolio access" ON public.scrapper_jobs
  FOR INSERT TO authenticated WITH CHECK (has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Update scrapper_jobs by portfolio access" ON public.scrapper_jobs
  FOR UPDATE TO authenticated USING (has_portfolio_access(auth.uid(), portfolio_id))
  WITH CHECK (has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Delete scrapper_jobs by portfolio access" ON public.scrapper_jobs
  FOR DELETE TO authenticated USING (has_portfolio_access(auth.uid(), portfolio_id));
CREATE TRIGGER trg_scrapper_jobs_updated BEFORE UPDATE ON public.scrapper_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Robô
CREATE TABLE public.robo_campanhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL,
  nome TEXT NOT NULL,
  instancia_id TEXT,
  tipo TEXT NOT NULL DEFAULT 'mensagem', -- mensagem|conteudo
  prompt TEXT,
  conteudo_url TEXT, -- link planilha/conteudo
  destinos JSONB NOT NULL DEFAULT '[]'::jsonb, -- numeros/grupos
  horario_inicio TIME NOT NULL DEFAULT '09:00',
  horario_fim TIME NOT NULL DEFAULT '20:00',
  dias_semana JSONB NOT NULL DEFAULT '["seg","ter","qua","qui","sex"]'::jsonb,
  intervalo_min_min INTEGER NOT NULL DEFAULT 30,
  intervalo_max_min INTEGER NOT NULL DEFAULT 90,
  status TEXT NOT NULL DEFAULT 'inativo', -- inativo|ativo|pausado
  ultima_execucao TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.robo_campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read robo_campanhas by portfolio access" ON public.robo_campanhas
  FOR SELECT TO authenticated USING (has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Insert robo_campanhas by portfolio access" ON public.robo_campanhas
  FOR INSERT TO authenticated WITH CHECK (has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Update robo_campanhas by portfolio access" ON public.robo_campanhas
  FOR UPDATE TO authenticated USING (has_portfolio_access(auth.uid(), portfolio_id))
  WITH CHECK (has_portfolio_access(auth.uid(), portfolio_id));
CREATE POLICY "Delete robo_campanhas by portfolio access" ON public.robo_campanhas
  FOR DELETE TO authenticated USING (has_portfolio_access(auth.uid(), portfolio_id));
CREATE TRIGGER trg_robo_campanhas_updated BEFORE UPDATE ON public.robo_campanhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();