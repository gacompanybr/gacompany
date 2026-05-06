import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  WorkspaceSidebar, type WorkspaceModule, getAvailableModules,
} from "@/components/workspace/WorkspaceSidebar";
import Dashboard from "./Dashboard";
import WhatsappAgentModule from "@/modules/WhatsappAgent";
import CampanhasModule from "@/modules/Campanhas";
import CRMModule from "@/modules/CRM";
import SocialMediaModule from "@/modules/SocialMedia";
import CriativosModule from "@/modules/Criativos";
import FinanceiroModule from "@/modules/Financeiro";
import gaLogo from "@/assets/logo.png";

export default function Workspace() {
  const { portfolioId } = useParams();
  const { isAdmin, signOut, user } = useAuth();
  const [activeModule, setActiveModule] = useState<WorkspaceModule>("metricas");

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["workspace-portfolio", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolios")
        .select("id, name, servicos, logo_url")
        .eq("id", portfolioId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!portfolioId,
  });

  const servicos: string[] = Array.isArray(portfolio?.servicos)
    ? (portfolio!.servicos as string[])
    : [];

  // Garante módulo válido para os serviços do cliente
  useEffect(() => {
    const avail = getAvailableModules(servicos);
    if (avail.length === 0) return;
    if (!avail.some((m) => m.key === activeModule)) {
      setActiveModule(avail[0].key);
    }
  }, [servicos, activeModule]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-8">
        <p className="text-muted-foreground">Cliente não encontrado.</p>
        {isAdmin && (
          <Button asChild variant="outline">
            <Link to="/admin">← Voltar</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <WorkspaceSidebar
          servicos={servicos}
          active={activeModule}
          onChange={setActiveModule}
          portfolioName={portfolio.name}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
              {isAdmin && (
                <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                  <Link to="/admin"><ArrowLeft size={14} /> Todos os clientes</Link>
                </Button>
              )}
              <img src={gaLogo} alt="GA Company" className="h-7 w-auto hidden sm:block" />
              <span className="font-semibold truncate">{portfolio.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">{user?.email}</span>
              <Button onClick={signOut} variant="ghost" size="sm" className="gap-1">
                <LogOut size={14} /> Sair
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            {activeModule === "metricas" && (
              <Dashboard portfolioId={portfolio.id} embedded />
            )}
            {activeModule === "campanhas" && (
              <CampanhasModule
                portfolioId={portfolio.id}
                onOpenMetricas={() => setActiveModule("metricas")}
              />
            )}
            {activeModule === "whatsapp" && (
              <WhatsappAgentModule portfolioId={portfolio.id} />
            )}
            {activeModule === "crm" && <CRMModule portfolioId={portfolio.id} />}
            {activeModule === "social" && <SocialMediaModule portfolioId={portfolio.id} />}
            {activeModule === "criativos" && <CriativosModule portfolioId={portfolio.id} />}
            {activeModule === "financeiro" && <FinanceiroModule portfolioId={portfolio.id} />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
