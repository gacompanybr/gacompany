import { useEffect, useState } from "react";
import { Bell, BellRing, CheckCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { sb } from "@/lib/sb";
import { enablePush, playNotificationSound } from "@/lib/pushNotifications";
import { toast } from "sonner";

type NotificationRow = { id: string; title: string; body: string; read_at: string | null; created_at: string };

export function NotificationCenter() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [enabling, setEnabling] = useState(false);

  async function load() {
    if (!user) return;
    const { data } = await sb.from("notifications").select("id,title,body,read_at,created_at").order("created_at", { ascending: false }).limit(30);
    setItems(data ?? []);
  }

  useEffect(() => {
    if (!user) return;
    load();
    const channel = sb.channel(`notifications-${user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload: { new: NotificationRow }) => {
      setItems((current) => [payload.new, ...current]);
      playNotificationSound();
      toast(payload.new.title, { description: payload.new.body });
    }).subscribe();
    return () => { sb.removeChannel(channel); };
  }, [user?.id]);

  const unread = items.filter((item) => !item.read_at).length;

  async function markAllRead() {
    if (!user) return;
    await sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
  }

  async function activatePush() {
    if (!user) return;
    setEnabling(true);
    try {
      const result = await enablePush(user.id);
      const messages: Record<string, string> = {
        registered: "Notificações ativadas neste aparelho.",
        "open-in-new-tab": "Abra o aplicativo em uma aba própria ou pelo ícone instalado para ativar.",
        denied: "Permissão negada. Libere as notificações nos ajustes do navegador.",
        unsupported: "Este navegador não oferece notificações para o aplicativo.",
        "not-configured": "A conexão de notificações precisa incluir o envio para navegador.",
      };
      result === "registered" ? toast.success(messages[result]) : toast.info(messages[result]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ativar as notificações");
    } finally { setEnabling(false); }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          {unread ? <BellRing size={18} /> : <Bell size={18} />}
          {unread > 0 && <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1 text-[10px]">{unread > 9 ? "9+" : unread}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b p-3">
          <strong className="text-sm">Notificações</strong>
          <Button size="icon" variant="ghost" onClick={markAllRead} aria-label="Marcar todas como lidas"><CheckCheck size={16} /></Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação.</p>}
          {items.map((item) => (
            <div key={item.id} className={`border-b p-3 last:border-0 ${item.read_at ? "opacity-60" : "bg-primary/5"}`}>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.body}</p>
              <time className="mt-1 block text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR")}</time>
            </div>
          ))}
        </div>
        <div className="border-t p-2">
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={activatePush} disabled={enabling}><Smartphone size={14} /> Ativar neste aparelho</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}