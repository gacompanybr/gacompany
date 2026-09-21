import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2">
        <Loader2 className="animate-spin text-primary" size={24} />
        <p className="text-sm text-muted-foreground">Verificando acesso...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/paineladmin" replace />;
  return <>{children}</>;
}
