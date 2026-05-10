import { ReactNode, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function RequirePortfolioAccess({ children }: { children: ReactNode }) {
  const { portfolioId } = useParams();
  const { user, loading, hasPortfolioAccess } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    async function check() {
      if (loading) return;
      if (!user || !portfolioId) {
        if (active) setAllowed(false);
        return;
      }
      const ok = await hasPortfolioAccess(portfolioId);
      if (active) setAllowed(ok);
    }
    check();
    return () => { active = false; };
  }, [loading, user, portfolioId, hasPortfolioAccess]);

  if (loading || allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }
  if (!allowed) return <Navigate to="/painel" replace />;
  return <>{children}</>;
}
