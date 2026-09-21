import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar, type AdminTab } from "@/components/admin/AdminSidebar";
import { ClientesTab } from "@/components/admin/ClientesTab";
import CRMModule from "@/modules/CRM";
import ScrapperModule from "@/modules/Scrapper";
import DisparoModule from "@/modules/Disparo";
import WhatsappAgentModule from "@/modules/WhatsappAgent";
import { AdminClientModule } from "@/components/admin/AdminClientModule";
import { EquipeTab } from "@/components/admin/EquipeTab";
import { FinanceiroTab } from "@/components/admin/FinanceiroTab";
import { DashboardTab } from "@/components/admin/DashboardTab";
import { CalendarioTab } from "@/components/admin/CalendarioTab";
import { TarefasTab } from "@/components/admin/TarefasTab";
import { IntegracoesTab } from "@/components/admin/IntegracoesTab";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

const TITLES: Record<AdminTab, string> = {
  dashboard: "Dashboard",
  clientes: "Clientes",
  crm: "CRM",
  scrapper: "Scrapper",
  disparos: "Disparos",
  agente_ia: "Agente IA",
  equipe: "Equipe",
  tarefas: "Tarefas",
  calendario: "Calendário",
  financeiro: "Financeiro",
  integracoes: "Integrações",
  config: "Configurações",
};

const ADMIN_TAB_KEY = "ga:admin:tab";

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(ADMIN_TAB_KEY) : null;
    return (saved as AdminTab) || "dashboard";
  });
  const { user, signOut, hasPermission, isAdmin } = useAuth();

  const tabPermissions: Record<AdminTab, string> = {
    dashboard: "dashboard.view", clientes: "clients.view", crm: "clients.view",
    scrapper: "clients.view", disparos: "clients.view", agente_ia: "clients.view", equipe: "team.view",
    tarefas: "tasks.view", calendario: "calendar.view", financeiro: "finance.view",
    integracoes: "integrations.view", config: "settings.manage",
  };
  const canOpenTab = (key: AdminTab) => key === "dashboard"
    ? isAdmin || hasPermission("finance.view")
    : hasPermission(tabPermissions[key]);
  const hasVisibleTab = (Object.keys(tabPermissions) as AdminTab[]).some(canOpenTab);

  useEffect(() => {
    if (canOpenTab(tab)) return;
    const fallback = (Object.keys(tabPermissions) as AdminTab[]).find(canOpenTab);
    if (fallback) setTab(fallback);
  }, [tab, hasPermission, isAdmin]);

  useEffect(() => {
    try { localStorage.setItem(ADMIN_TAB_KEY, tab); } catch {}
  }, [tab]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <AdminSidebar active={tab} onChange={setTab} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex min-h-14 items-center justify-between border-b border-border px-2 py-2 sm:px-4 gap-1 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-3 min-w-0">
              <SidebarTrigger />
              <h1 className="truncate text-base font-semibold sm:text-lg">{TITLES[tab]}</h1>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <NotificationCenter />
              <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[200px]">
                {user?.email}
              </span>
              <Button onClick={signOut} variant="ghost" size="sm" className="gap-1 px-2" aria-label="Sair">
                <LogOut size={14} /> <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-2.5 sm:p-4 lg:p-6">
             {!hasVisibleTab && (
               <Card className="p-8 text-center text-muted-foreground">
                 Seu acesso está ativo, mas seu cargo ainda não possui áreas liberadas. Fale com um administrador.
               </Card>
             )}
             {tab === "dashboard" && (isAdmin || hasPermission("finance.view")) && <DashboardTab />}
             {tab === "clientes" && hasPermission("clients.view") && <ClientesTab />}
             {tab === "crm" && hasPermission("clients.view") && <CRMModule />}
             {tab === "scrapper" && hasPermission("clients.view") && (
               <AdminClientModule service="scrapper" storageKey="ga:admin:scrapper-client">
                 {(portfolioId) => <ScrapperModule portfolioId={portfolioId} />}
               </AdminClientModule>
             )}
             {tab === "disparos" && hasPermission("clients.view") && (
               <AdminClientModule service="disparo" storageKey="ga:admin:disparos-client">
                 {(portfolioId) => <DisparoModule portfolioId={portfolioId} />}
               </AdminClientModule>
             )}
             {tab === "agente_ia" && hasPermission("clients.view") && (
               <AdminClientModule service="whatsapp_agent" storageKey="ga:admin:agente-ia-client">
                 {(portfolioId) => <WhatsappAgentModule portfolioId={portfolioId} />}
               </AdminClientModule>
             )}
             {tab === "equipe" && hasPermission("team.view") && <EquipeTab />}
             {tab === "tarefas" && hasPermission("tasks.view") && <TarefasTab />}
             {tab === "calendario" && hasPermission("calendar.view") && <CalendarioTab />}
             {tab === "financeiro" && hasPermission("finance.view") && <FinanceiroTab />}
             {tab === "integracoes" && hasPermission("integrations.view") && <IntegracoesTab />}
             {tab === "config" && hasPermission("settings.manage") && (
              <Card className="p-8 text-center text-muted-foreground">
                Configurações gerais em breve.
              </Card>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
