import { Badge } from "@/components/ui/badge";

export const SERVICE_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  whatsapp_agent: "Agente WhatsApp",
  crm: "CRM",
  social_media: "Social Media",
  criativos: "Criativos",
};

// Cores fixas (não há tokens semânticos por serviço)
const COLORS: Record<string, string> = {
  meta_ads: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  google_ads: "bg-red-500/15 text-red-400 border-red-500/30",
  whatsapp_agent: "bg-green-500/15 text-green-400 border-green-500/30",
  crm: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  social_media: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  criativos: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
};

export function ServiceBadge({ service }: { service: string }) {
  const cls = COLORS[service] ?? "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`${cls} text-[10px] font-medium`}>
      {SERVICE_LABELS[service] ?? service}
    </Badge>
  );
}

export const ALL_SERVICES = Object.keys(SERVICE_LABELS);
