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

async function fetchRole(userId: string): Promise<boolean> {
  // Tenta até 5 vezes com backoff — o trigger pode demorar alguns ms após signup
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (!error && data) {
      return data.some((r: any) => r.role === "admin");
    }
    await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
  }
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function applySession(s: Session | null) {
      if (!active) return;
      setLoading(true);
      setSession(s);

      if (s?.user) {
        const admin = await fetchRole(s.user.id);
        if (active) setIsAdmin(admin);
      } else {
        if (active) setIsAdmin(false);
      }

      if (active) setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      applySession(s);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const getUserPortfolios = useCallback(async (): Promise<PortfolioMini[]> => {
    if (!session?.user) return [];
    const { data, error } = await supabase
      .from("portfolios")
      .select("id, name, slug")
      .order("name");
    if (error) {
      console.warn("getUserPortfolios error:", error.message);
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
