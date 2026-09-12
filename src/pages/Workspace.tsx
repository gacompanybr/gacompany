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
import DisparoModule from "@/modules/Disparo";
import RoboModule from "@/modules/Robo";
import ScrapperModule from "@/modules/Scrapper";
import EmailMarketingModule from "@/modules/EmailMarketing";
import gaLogo from "@/assets/logo.png.asset.json";

export default function Workspace() {
  const { portfolioId } = useParams();
  const { isAdmin, signOut, user } = useAuth();
  const storageKey = `ga:workspace:module:${portfolioId}`;
  const [activeModule, setActiveModule] = useState<WorkspaceModule>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    return (saved as WorkspaceModule) || "metricas";
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, activeModule); } catch {}
  }, [storageKey, activeModule]);

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-1 sm:gap-3 p-8">
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
          <header className="flex min-h-14 items-center justify-between border-b border-border px-2 py-2 sm:px-4 gap-1 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-3 min-w-0">
              <SidebarTrigger />
              {isAdmin && (
                <Button asChild variant="ghost" size="sm" className="gap-1 px-2 text-muted-foreground">
                  <Link to="/admin"><ArrowLeft size={14} /><span className="hidden md:inline">Todos os clientes</span></Link>
                </Button>
              )}
              <img src={gaLogo.url} alt="GA Company" className="h-7 w-auto hidden sm:block" />
              <span className="max-w-[8rem] truncate text-sm font-semibold sm:max-w-none sm:text-base">{portfolio.name}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">{user?.email}</span>
              <Button onClick={signOut} variant="ghost" size="sm" className="gap-1 px-2" aria-label="Sair">
                <LogOut size={14} /> <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
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
            {activeModule === "disparo" && <DisparoModule portfolioId={portfolio.id} />}
            {activeModule === "robo" && <RoboModule portfolioId={portfolio.id} />}
            {activeModule === "scrapper" && <ScrapperModule portfolioId={portfolio.id} />}
            {activeModule === "email_marketing" && (
              <EmailMarketingModule portfolioId={portfolio.id} />
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
