import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar, type AdminTab } from "@/components/admin/AdminSidebar";
import { ClientesTab } from "@/components/admin/ClientesTab";
import { EquipeTab } from "@/components/admin/EquipeTab";
import { FinanceiroTab } from "@/components/admin/FinanceiroTab";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>("clientes");
  const { user, signOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <AdminSidebar active={tab} onChange={setTab} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
              <h1 className="text-lg font-semibold capitalize truncate">
                {tab === "clientes" ? "Clientes"
                  : tab === "equipe" ? "Equipe"
                  : tab === "financeiro" ? "Financeiro"
                  : "Configurações"}
              </h1>
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
            {tab === "clientes" && <ClientesTab />}
            {tab === "equipe" && <EquipeTab />}
            {tab === "financeiro" && <FinanceiroTab />}
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
