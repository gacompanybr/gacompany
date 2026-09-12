CREATE TABLE public.job_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_roles TO authenticated;
GRANT ALL ON public.job_roles TO service_role;
ALTER TABLE public.job_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_.]+$'),
  label text NOT NULL,
  module text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.job_role_permissions (
  job_role_id uuid NOT NULL REFERENCES public.job_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_role_id, permission_id)
);
GRANT SELECT, INSERT, DELETE ON public.job_role_permissions TO authenticated;
GRANT ALL ON public.job_role_permissions TO service_role;
ALTER TABLE public.job_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_job_roles (
  user_id uuid PRIMARY KEY,
  job_role_id uuid NOT NULL REFERENCES public.job_roles(id) ON DELETE RESTRICT,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_job_roles TO authenticated;
GRANT ALL ON public.user_job_roles TO service_role;
ALTER TABLE public.user_job_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR EXISTS (
    SELECT 1
    FROM public.user_job_roles ujr
    JOIN public.job_role_permissions jrp ON jrp.job_role_id = ujr.job_role_id
    JOIN public.permissions p ON p.id = jrp.permission_id
    WHERE ujr.user_id = _user_id AND p.key = _permission_key
  );
$$;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE(permission_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.key
  FROM public.permissions p
  WHERE public.has_role(auth.uid(), 'admin')
     OR EXISTS (
       SELECT 1 FROM public.user_job_roles ujr
       JOIN public.job_role_permissions jrp ON jrp.job_role_id = ujr.job_role_id
       WHERE ujr.user_id = auth.uid() AND jrp.permission_id = p.id
     );
$$;
REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

CREATE POLICY "Authenticated read job roles" ON public.job_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage job roles" ON public.job_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read role permissions" ON public.job_role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage role permissions" ON public.job_role_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read own job role" ON public.user_job_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Team managers read job roles" ON public.user_job_roles FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'team.view'));
CREATE POLICY "Admins manage user job roles" ON public.user_job_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_job_roles_updated BEFORE UPDATE ON public.job_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_user_job_roles_updated BEFORE UPDATE ON public.user_job_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.permissions (key, label, module) VALUES
 ('dashboard.view','Ver dashboard','Dashboard'),
 ('clients.view','Ver clientes','Clientes'),
 ('clients.manage','Gerenciar clientes','Clientes'),
 ('team.view','Ver equipe','Equipe'),
 ('team.manage','Gerenciar equipe','Equipe'),
 ('tasks.view','Ver tarefas','Tarefas'),
 ('tasks.manage','Gerenciar tarefas','Tarefas'),
 ('calendar.view','Ver calendário','Calendário'),
 ('finance.view','Ver financeiro','Financeiro'),
 ('finance.manage','Gerenciar financeiro','Financeiro'),
 ('integrations.view','Ver integrações','Integrações'),
 ('integrations.manage','Gerenciar integrações','Integrações'),
 ('settings.manage','Gerenciar configurações','Configurações');

INSERT INTO public.job_roles (key, label, description, is_system) VALUES
 ('ceo','CEO','Direção geral da empresa',true),
 ('cfo','CFO','Gestão financeira',true),
 ('cmo','CMO','Direção de marketing',true),
 ('gestor','Gestor','Gestão operacional e de clientes',true),
 ('sdr','SDR','Prospecção e qualificação',true),
 ('closer','Closer','Fechamento comercial',true),
 ('social_media','Social Media','Conteúdo e redes sociais',true);

INSERT INTO public.job_role_permissions (job_role_id, permission_id)
SELECT r.id, p.id FROM public.job_roles r CROSS JOIN public.permissions p
WHERE (r.key = 'ceo')
   OR (r.key = 'cfo' AND p.key IN ('dashboard.view','finance.view','finance.manage','clients.view','tasks.view','calendar.view'))
   OR (r.key = 'cmo' AND p.key IN ('dashboard.view','clients.view','tasks.view','tasks.manage','calendar.view','integrations.view'))
   OR (r.key = 'gestor' AND p.key IN ('dashboard.view','clients.view','clients.manage','team.view','tasks.view','tasks.manage','calendar.view','integrations.view'))
   OR (r.key = 'sdr' AND p.key IN ('clients.view','tasks.view','calendar.view'))
   OR (r.key = 'closer' AND p.key IN ('clients.view','tasks.view','calendar.view'))
   OR (r.key = 'social_media' AND p.key IN ('clients.view','tasks.view','calendar.view','integrations.view'));

CREATE TABLE public.team_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  target_user_id uuid,
  target_name text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.team_audit_log TO authenticated;
GRANT ALL ON public.team_audit_log TO service_role;
ALTER TABLE public.team_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read team audit" ON public.team_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.tasks ADD COLUMN created_by_name text;
ALTER TABLE public.tasks ADD COLUMN completed_by_name text;
UPDATE public.tasks t SET created_by_name = p.display_name FROM public.profiles p WHERE p.user_id = t.created_by AND t.created_by_name IS NULL;
UPDATE public.tasks t SET completed_by_name = p.display_name FROM public.profiles p WHERE p.user_id = t.completed_by AND t.completed_by IS NOT NULL AND t.completed_by_name IS NULL;

CREATE OR REPLACE FUNCTION public.snapshot_task_actor_names()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by_name IS NULL THEN
    SELECT display_name INTO NEW.created_by_name FROM public.profiles WHERE user_id = NEW.created_by LIMIT 1;
  END IF;
  IF NEW.completed_by IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.completed_by IS DISTINCT FROM OLD.completed_by OR NEW.completed_by_name IS NULL) THEN
    SELECT display_name INTO NEW.completed_by_name FROM public.profiles WHERE user_id = NEW.completed_by LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_tasks_actor_names BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.snapshot_task_actor_names();

CREATE TABLE public.task_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  position integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_subtasks TO authenticated;
GRANT ALL ON public.task_subtasks TO service_role;
ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_task_subtasks_task_position ON public.task_subtasks(task_id, position);
CREATE POLICY "Task viewers read subtasks" ON public.task_subtasks FOR SELECT TO authenticated USING (
  public.has_permission(auth.uid(), 'tasks.view') OR public.is_task_assignee(auth.uid(), task_id) OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
);
CREATE POLICY "Task managers manage subtasks" ON public.task_subtasks FOR ALL TO authenticated USING (
  public.has_permission(auth.uid(), 'tasks.manage') OR public.is_task_assignee(auth.uid(), task_id)
) WITH CHECK (
  public.has_permission(auth.uid(), 'tasks.manage') OR public.is_task_assignee(auth.uid(), task_id)
);
CREATE TRIGGER trg_task_subtasks_updated BEFORE UPDATE ON public.task_subtasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enforce_task_subtasks_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_rank integer; new_rank integer; pending_count integer;
BEGIN
  old_rank := CASE OLD.status WHEN 'a_fazer' THEN 1 WHEN 'em_andamento' THEN 2 ELSE 3 END;
  new_rank := CASE NEW.status WHEN 'a_fazer' THEN 1 WHEN 'em_andamento' THEN 2 ELSE 3 END;
  IF new_rank > old_rank THEN
    SELECT count(*) INTO pending_count FROM public.task_subtasks WHERE task_id = NEW.id AND is_completed = false;
    IF pending_count > 0 THEN
      RAISE EXCEPTION 'Conclua todas as subtarefas antes de avançar esta tarefa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_tasks_require_subtasks BEFORE UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.enforce_task_subtasks_complete();

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('task_assigned','task_completed','new_client','task_due_soon','task_overdue')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, dedupe_key)
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_pending_push ON public.notifications(created_at) WHERE pushed_at IS NULL;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY,
  in_app_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  task_assigned boolean NOT NULL DEFAULT true,
  task_completed boolean NOT NULL DEFAULT true,
  new_client boolean NOT NULL DEFAULT true,
  task_deadlines boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_notification_preferences_updated BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web',
  user_agent text,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;
GRANT ALL ON public.push_devices TO service_role;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_push_devices_user_active ON public.push_devices(user_id, active);
CREATE POLICY "Users manage own push devices" ON public.push_devices FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE task_row public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO task_row FROM public.tasks WHERE id = NEW.task_id;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    INSERT INTO public.notifications(user_id,type,title,body,data,dedupe_key)
    VALUES (NEW.user_id,'task_assigned','Tarefa atribuída a você',task_row.titulo,jsonb_build_object('task_id',NEW.task_id), 'assigned:'||NEW.task_id::text||':'||NEW.user_id::text)
    ON CONFLICT (user_id,dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_task_assigned AFTER INSERT ON public.task_assignees FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

CREATE OR REPLACE FUNCTION public.notify_task_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor text;
BEGIN
  IF NEW.status = 'feita' AND OLD.status IS DISTINCT FROM 'feita' THEN
    actor := COALESCE(NEW.completed_by_name, 'Alguém da equipe');
    INSERT INTO public.notifications(user_id,type,title,body,data,dedupe_key)
    SELECT recipient,'task_completed','Tarefa concluída',actor||' concluiu a tarefa “'||NEW.titulo||'”',jsonb_build_object('task_id',NEW.id), 'completed:'||NEW.id::text||':'||recipient::text||':'||extract(epoch from NEW.completed_at)::bigint::text
    FROM (
      SELECT NEW.created_by AS recipient
      UNION
      SELECT ta.user_id FROM public.task_assignees ta WHERE ta.task_id = NEW.id
    ) recipients
    WHERE recipient IS NOT NULL AND recipient IS DISTINCT FROM NEW.completed_by
    ON CONFLICT (user_id,dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_task_completed AFTER UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.notify_task_completed();

CREATE OR REPLACE FUNCTION public.notify_new_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications(user_id,type,title,body,data,dedupe_key)
  SELECT DISTINCT ur.user_id,'new_client','Novo cliente adicionado',NEW.name,jsonb_build_object('portfolio_id',NEW.id), 'client:'||NEW.id::text||':'||ur.user_id::text
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
  UNION
  SELECT DISTINCT ujr.user_id,'new_client','Novo cliente adicionado',NEW.name,jsonb_build_object('portfolio_id',NEW.id), 'client:'||NEW.id::text||':'||ujr.user_id::text
  FROM public.user_job_roles ujr
  WHERE public.has_permission(ujr.user_id, 'clients.manage')
  ON CONFLICT (user_id,dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_new_client AFTER INSERT ON public.portfolios FOR EACH ROW EXECUTE FUNCTION public.notify_new_client();

CREATE OR REPLACE FUNCTION public.generate_task_deadline_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted_count integer;
BEGIN
  INSERT INTO public.notifications(user_id,type,title,body,data,dedupe_key)
  SELECT ta.user_id,
    CASE WHEN t.prazo < now() THEN 'task_overdue' ELSE 'task_due_soon' END,
    CASE WHEN t.prazo < now() THEN 'Tarefa atrasada' ELSE 'Prazo próximo' END,
    t.titulo,
    jsonb_build_object('task_id',t.id,'prazo',t.prazo),
    CASE WHEN t.prazo < now() THEN 'overdue:' ELSE 'due:' END || t.id::text || ':' || ta.user_id::text || ':' || current_date::text
  FROM public.tasks t
  JOIN public.task_assignees ta ON ta.task_id = t.id
  WHERE t.status <> 'feita'
    AND t.prazo IS NOT NULL
    AND t.prazo <= now() + interval '24 hours'
  ON CONFLICT (user_id,dedupe_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_task_deadline_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_task_deadline_notifications() TO service_role;

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Team members read profiles" ON public.profiles FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.has_permission(auth.uid(), 'team.view') OR public.has_permission(auth.uid(), 'tasks.view')
);

CREATE POLICY "Permission users read portfolios" ON public.portfolios FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'clients.view'));
CREATE POLICY "Permission users insert portfolios" ON public.portfolios FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'clients.manage'));
CREATE POLICY "Permission users update portfolios" ON public.portfolios FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'clients.manage')) WITH CHECK (public.has_permission(auth.uid(), 'clients.manage'));
CREATE POLICY "Permission users delete portfolios" ON public.portfolios FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), 'clients.manage'));

CREATE POLICY "Permission users read tasks" ON public.tasks FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'tasks.view'));
CREATE POLICY "Permission users manage tasks" ON public.tasks FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'tasks.manage')) WITH CHECK (public.has_permission(auth.uid(), 'tasks.manage'));
CREATE POLICY "Permission users read assignees" ON public.task_assignees FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'tasks.view'));
CREATE POLICY "Permission users manage assignees" ON public.task_assignees FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'tasks.manage')) WITH CHECK (public.has_permission(auth.uid(), 'tasks.manage'));

CREATE POLICY "Finance viewers read categories" ON public.financial_categories FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY "Finance managers manage categories" ON public.financial_categories FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'finance.manage')) WITH CHECK (public.has_permission(auth.uid(), 'finance.manage'));
CREATE POLICY "Finance viewers read costs" ON public.financial_costs FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY "Finance managers manage costs" ON public.financial_costs FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'finance.manage')) WITH CHECK (public.has_permission(auth.uid(), 'finance.manage'));
CREATE POLICY "Finance viewers read receivables" ON public.financial_receivables FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY "Finance managers manage receivables" ON public.financial_receivables FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'finance.manage')) WITH CHECK (public.has_permission(auth.uid(), 'finance.manage'));
CREATE POLICY "Finance viewers read participants" ON public.financial_service_participants FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY "Finance managers manage participants" ON public.financial_service_participants FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'finance.manage')) WITH CHECK (public.has_permission(auth.uid(), 'finance.manage'));
CREATE POLICY "Finance viewers read services" ON public.financial_services FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY "Finance managers manage services" ON public.financial_services FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'finance.manage')) WITH CHECK (public.has_permission(auth.uid(), 'finance.manage'));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;