import { BarChart3, Bot, Users, Smartphone, Palette, Megaphone, Wallet, Send, Search, Zap, Mail } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader,
} from "@/components/ui/sidebar";

export type WorkspaceModule =
  | "metricas" | "campanhas" | "whatsapp" | "crm" | "social"
  | "criativos" | "financeiro" | "disparo" | "scrapper" | "robo"
  | "email_marketing";

const ALL: { key: WorkspaceModule; label: string; icon: any; service: string | string[] }[] = [
  { key: "metricas", label: "Métricas", icon: BarChart3, service: ["meta_ads", "google_ads"] },
  { key: "campanhas", label: "Campanhas", icon: Megaphone, service: ["meta_ads", "google_ads"] },
  { key: "whatsapp", label: "Agente IA", icon: Bot, service: "whatsapp_agent" },
  { key: "disparo", label: "Disparo", icon: Send, service: "disparo" },
  { key: "robo", label: "Robô", icon: Zap, service: "robo" },
  { key: "scrapper", label: "Scrapper", icon: Search, service: "scrapper" },
  { key: "email_marketing", label: "E-mail Marketing", icon: Mail, service: "email_marketing" },
  { key: "crm", label: "CRM", icon: Users, service: "crm" },
  { key: "social", label: "Social Media", icon: Smartphone, service: "social_media" },
  { key: "criativos", label: "Criativos", icon: Palette, service: "criativos" },
  { key: "financeiro", label: "Financeiro", icon: Wallet, service: "financeiro" },
];

export function getAvailableModules(servicos: string[]): typeof ALL {
  return ALL.filter((m) => {
    const s = Array.isArray(m.service) ? m.service : [m.service];
    return s.some((x) => servicos.includes(x));
  });
}

export function WorkspaceSidebar({
  servicos, active, onChange, portfolioName,
}: {
  servicos: string[];
  active: WorkspaceModule;
  onChange: (m: WorkspaceModule) => void;
  portfolioName: string;
}) {
  const modules = getAvailableModules(servicos);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</div>
        <div className="font-semibold truncate">{portfolioName}</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {modules.length === 0 && (
                <div className="text-xs text-muted-foreground p-3">
                  Nenhum módulo contratado.
                </div>
              )}
              {modules.map((m) => (
                <SidebarMenuItem key={m.key}>
                  <SidebarMenuButton
                    isActive={active === m.key}
                    onClick={() => onChange(m.key)}
                    className="gap-2"
                  >
                    <m.icon className="h-4 w-4" />
                    <span>{m.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
