import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import gaLogo from "@/assets/logo.png";

type Portfolio = { id: string; name: string; slug: string };

export default function PainelHome() {
  const { user, loading, isAdmin, getUserPortfolios, signOut } = useAuth();
  const [portfolios, setPortfolios] = useState<Portfolio[] | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    getUserPortfolios().then(setPortfolios);
  }, [loading, user, getUserPortfolios]);

  if (loading) return null;
  if (!user) return <Navigate to="/painel" replace />;
  if (isAdmin) return <Navigate to="/paineladmin/app" replace />;

  if (portfolios === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  if (portfolios.length === 1) {
    return <Navigate to={`/workspace/${portfolios[0].id}`} replace />;
  }

  if (portfolios.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <img src={gaLogo} alt="GA Company" className="h-10 w-auto" />
        <Card className="p-6 max-w-md space-y-3">
          <h2 className="font-semibold">Aguardando vínculo</h2>
          <p className="text-sm text-muted-foreground">
            Sua conta foi criada com sucesso, mas ainda não está vinculada a nenhum cliente.
            Entre em contato com seu gestor para liberar o acesso.
          </p>
          <Button variant="outline" onClick={signOut} className="gap-1">
            <LogOut size={14} /> Sair
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <img src={gaLogo} alt="GA Company" className="h-9 w-auto" />
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-1">
            <LogOut size={14} /> Sair
          </Button>
        </header>
        <div>
          <h1 className="text-xl font-semibold">Selecione um cliente</h1>
          <p className="text-sm text-muted-foreground">Você tem acesso a {portfolios.length} contas.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {portfolios.map((p) => (
            <Link key={p.id} to={`/workspace/${p.id}`}>
              <Card className="p-4 hover:border-primary transition-colors cursor-pointer">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.slug}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
