import { Building2, Users, Settings, LogOut, Wallet, LayoutDashboard, Calendar, CheckSquare, Plug } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import gaLogo from "@/assets/logo.png";

export type AdminTab =
  | "dashboard"
  | "clientes"
  | "equipe"
  | "tarefas"
  | "calendario"
  | "financeiro"
  | "config";

const GROUPS: { label: string; items: { key: AdminTab; label: string; icon: any }[] }[] = [
  {
    label: "Visão geral",
    items: [{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operação",
    items: [
      { key: "clientes", label: "Clientes", icon: Building2 },
      { key: "equipe", label: "Equipe", icon: Users },
      { key: "tarefas", label: "Tarefas", icon: CheckSquare },
      { key: "calendario", label: "Calendário", icon: Calendar },
      { key: "financeiro", label: "Financeiro", icon: Wallet },
    ],
  },
  {
    label: "Sistema",
    items: [{ key: "config", label: "Configurações", icon: Settings }],
  },
];

export function AdminSidebar({
  active, onChange,
}: { active: AdminTab; onChange: (t: AdminTab) => void }) {
  const { user, signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <img src={gaLogo} alt="GA Company" className="h-8 w-auto" />
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={active === item.key}
                      onClick={() => onChange(item.key)}
                      className="gap-2"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-border">
        <div className="text-xs text-muted-foreground truncate mb-2">
          {user?.email}
        </div>
        <Button onClick={signOut} variant="outline" size="sm" className="w-full gap-2">
          <LogOut size={14} /> Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
