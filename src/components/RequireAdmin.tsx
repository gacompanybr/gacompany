import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading, getUserPortfolios } = useAuth();
  const [redirect, setRedirect] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (loading) return;

    let active = true;

    async function resolve() {
      if (!user) {
        if (active) { setRedirect("/auth"); setResolving(false); }
        return;
      }
      if (isAdmin) {
        if (active) { setRedirect(null); setResolving(false); }
        return;
      }
      const ps = await getUserPortfolios();
      if (!active) return;
      setRedirect(ps[0] ? `/workspace/${ps[0].id}` : "/auth");
      setResolving(false);
    }

    resolve();
    return () => { active = false; };
  }, [loading, user, isAdmin, getUserPortfolios]);

  if (loading || resolving) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2">
        <Loader2 className="animate-spin text-primary" size={24} />
        <p className="text-sm text-muted-foreground">Verificando acesso...</p>
      </div>
    );
  }

  if (redirect) return <Navigate to={redirect} replace />;
  return <>{children}</>;
}
