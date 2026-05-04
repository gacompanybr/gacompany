-- Recria has_role como SECURITY DEFINER para evitar loop de RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Garantir EXECUTE para authenticated (corrige 403 "permission denied for function has_role")
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_portfolio_access(UUID, UUID) TO authenticated;

-- Portfolios
DROP POLICY IF EXISTS "Admins read all portfolios" ON public.portfolios;
CREATE POLICY "Admins read all portfolios"
  ON public.portfolios FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
DROP POLICY IF EXISTS "Admins read all user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;

CREATE POLICY "Users read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all user_roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- profiles
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;

CREATE POLICY "Profiles readable by authenticated"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- user_portfolio_access
DROP POLICY IF EXISTS "Admins manage portfolio access" ON public.user_portfolio_access;
DROP POLICY IF EXISTS "Users see own portfolio access" ON public.user_portfolio_access;

CREATE POLICY "Users see own portfolio access"
  ON public.user_portfolio_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage portfolio access"
  ON public.user_portfolio_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));