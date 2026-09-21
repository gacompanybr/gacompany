import { Building2, Users, Settings, LogOut, Wallet, LayoutDashboard, Calendar, CheckSquare, Plug, ContactRound } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import gaLogo from "@/assets/logo.png.asset.json";

export type AdminTab =
  | "dashboard"
  | "clientes"
  | "crm"
  | "equipe"
  | "tarefas"
  | "calendario"
  | "financeiro"
  | "integracoes"
  | "config";

const GROUPS: { label: string; items: { key: AdminTab; label: string; icon: any; permission: string }[] }[] = [
  {
    label: "Visão geral",
    items: [{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" }],
  },
  {
    label: "Operação",
    items: [
      { key: "clientes", label: "Clientes", icon: Building2, permission: "clients.view" },
      { key: "crm", label: "CRM", icon: ContactRound, permission: "clients.view" },
      { key: "equipe", label: "Equipe", icon: Users, permission: "team.view" },
      { key: "tarefas", label: "Tarefas", icon: CheckSquare, permission: "tasks.view" },
      { key: "calendario", label: "Calendário", icon: Calendar, permission: "calendar.view" },
      { key: "financeiro", label: "Financeiro", icon: Wallet, permission: "finance.view" },
      { key: "integracoes", label: "Integrações", icon: Plug, permission: "integrations.view" },
    ],
  },
  {
    label: "Sistema",
    items: [{ key: "config", label: "Configurações", icon: Settings, permission: "settings.manage" }],
  },
];

export function AdminSidebar({
  active, onChange,
}: { active: AdminTab; onChange: (t: AdminTab) => void }) {
  const { user, signOut, hasPermission, isAdmin } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pt-4 pb-2 lg:pt-8 lg:pb-6 px-4 flex items-center justify-center">
        <img
          src={gaLogo.url}
          alt="GA Company"
          className="h-8 lg:h-14 max-h-14 w-auto max-w-[200px] object-contain select-none"
          draggable={false}
        />
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => item.key === "dashboard" ? (isAdmin || hasPermission("finance.view")) : hasPermission(item.permission)) })).filter((g) => g.items.length > 0).map((g) => (
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
