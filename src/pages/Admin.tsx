import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar, type AdminTab } from "@/components/admin/AdminSidebar";
import { ClientesTab } from "@/components/admin/ClientesTab";
import { EquipeTab } from "@/components/admin/EquipeTab";
import { Card } from "@/components/ui/card";

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>("clientes");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <AdminSidebar active={tab} onChange={setTab} />

        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b border-border px-4 gap-3">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold capitalize">
              {tab === "clientes" ? "Clientes" : tab === "equipe" ? "Equipe" : "Configurações"}
            </h1>
          </header>

          <main className="flex-1 p-4 lg:p-6 overflow-auto">
            {tab === "clientes" && <ClientesTab />}
            {tab === "equipe" && <EquipeTab />}
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
