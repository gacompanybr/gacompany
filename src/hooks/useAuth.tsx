import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type PortfolioMini = { id: string; name: string; slug: string };

type AuthCtx = {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  getUserPortfolios: () => Promise<PortfolioMini[]>;
  hasPortfolioAccess: (portfolioId: string) => Promise<boolean>;
};

const Ctx = createContext<AuthCtx>({
  user: null, session: null, isAdmin: false, loading: true,
  signOut: async () => {},
  getUserPortfolios: async () => [],
  hasPortfolioAccess: async () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function applySession(s: Session | null) {
      setLoading(true);
      setSession(s);

      const admin = s?.user ? await fetchRole(s.user.id) : false;
      if (!active) return;

      setIsAdmin(admin);
      setLoading(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => applySession(s), 0);
    });

    supabase.auth.getSession().then(({ data }) => applySession(data.session));

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function fetchRole(userId: string) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (!error) return (data ?? []).some((r: any) => r.role === "admin");
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }

    return false;
  }

  const getUserPortfolios = useCallback(async (): Promise<PortfolioMini[]> => {
    if (!session?.user) return [];
    // Admin vê todos; viewer só os vinculados (RLS já filtra)
    const { data, error } = await supabase
      .from("portfolios")
      .select("id, name, slug")
      .order("name");
    if (error) {
      console.warn("getUserPortfolios", error);
      return [];
    }
    return data ?? [];
  }, [session]);

  const hasPortfolioAccess = useCallback(async (portfolioId: string): Promise<boolean> => {
    if (!session?.user) return false;
    if (isAdmin) return true;
    const { data, error } = await supabase
      .from("user_portfolio_access")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    if (error) return false;
    return !!data;
  }, [session, isAdmin]);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        isAdmin,
        loading,
        signOut: async () => { await supabase.auth.signOut(); },
        getUserPortfolios,
        hasPortfolioAccess,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
