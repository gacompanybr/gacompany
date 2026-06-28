import { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export function RequirePortfolioAccess({ children }: { children: ReactNode }) {
  const { portfolioId } = useParams();
  const { user, loading, hasPortfolioAccess } = useAuth();

  const { data: allowed, isLoading } = useQuery({
    queryKey: ["portfolio-access", user?.id, portfolioId],
    enabled: !loading && !!user && !!portfolioId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: () => hasPortfolioAccess(portfolioId!),
  });

  if (loading || (!!user && !!portfolioId && isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }
  if (!user || !portfolioId || !allowed) return <Navigate to="/painel" replace />;
  return <>{children}</>;
}
