
-- Enums
DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('a_fazer','em_andamento','feita');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('baixa','media','alta','urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tasks
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  status public.task_status NOT NULL DEFAULT 'a_fazer',
  prioridade public.task_priority NOT NULL DEFAULT 'media',
  prazo timestamptz,
  portfolio_id uuid,
  created_by uuid NOT NULL,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_prazo ON public.tasks(prazo);
CREATE INDEX idx_tasks_portfolio ON public.tasks(portfolio_id);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Assignees
CREATE TABLE public.task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX idx_task_assignees_user ON public.task_assignees(user_id);
CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

-- Helper function to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.is_task_assignee(_user_id uuid, _task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE task_id = _task_id AND user_id = _user_id
  );
$$;

-- RLS tasks
CREATE POLICY "Admins manage tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Assignees read tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_task_assignee(auth.uid(), id));

CREATE POLICY "Creator reads tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Assignees update tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_task_assignee(auth.uid(), id))
  WITH CHECK (public.is_task_assignee(auth.uid(), id));

-- RLS task_assignees
CREATE POLICY "Admins manage assignees" ON public.task_assignees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "User reads own assignment" ON public.task_assignees
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Assignees read peers" ON public.task_assignees
  FOR SELECT TO authenticated
  USING (public.is_task_assignee(auth.uid(), task_id));
