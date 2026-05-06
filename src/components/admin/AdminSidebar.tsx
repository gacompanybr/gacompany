import { Building2, Users, Settings, LogOut, Wallet } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import gaLogo from "@/assets/logo.png";

export type AdminTab = "clientes" | "equipe" | "financeiro" | "config";

const ITEMS: { key: AdminTab; label: string; icon: any }[] = [
  { key: "clientes", label: "Clientes", icon: Building2 },
  { key: "equipe", label: "Equipe", icon: Users },
  { key: "financeiro", label: "Financeiro", icon: Wallet },
  { key: "config", label: "Configurações", icon: Settings },
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.map((item) => (
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
