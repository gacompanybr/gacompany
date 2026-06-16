import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar, type AdminTab } from "@/components/admin/AdminSidebar";
import { ClientesTab } from "@/components/admin/ClientesTab";
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

const TITLES: Record<AdminTab, string> = {
  dashboard: "Dashboard",
  clientes: "Clientes",
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
  const { user, signOut } = useAuth();

  useEffect(() => {
    try { localStorage.setItem(ADMIN_TAB_KEY, tab); } catch {}
  }, [tab]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <AdminSidebar active={tab} onChange={setTab} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
              <h1 className="text-lg font-semibold truncate">{TITLES[tab]}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[200px]">
                {user?.email}
              </span>
              <Button onClick={signOut} variant="ghost" size="sm" className="gap-1">
                <LogOut size={14} /> Sair
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-6 overflow-auto">
            {tab === "dashboard" && <DashboardTab />}
            {tab === "clientes" && <ClientesTab />}
            {tab === "equipe" && <EquipeTab />}
            {tab === "tarefas" && <TarefasTab />}
            {tab === "calendario" && <CalendarioTab />}
            {tab === "financeiro" && <FinanceiroTab />}
            {tab === "integracoes" && <IntegracoesTab />}
            {tab === "config" && (
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
