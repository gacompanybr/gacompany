import { loadAllConversationRows } from "@/lib/conversation-history";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, User } from "lucide-react";
import { ConversaDetailDialog } from "./ConversaDetailDialog";

type ConversaRow = {
  id: string;
  portfolio_id: string;
  instance_name: string;
  contato_telefone: string;
  contato_nome: string | null;
  role: string;
  mensagem: string;
  sdr_lead_id: string | null;
  created_at: string;
  reply_state: string | null;
  reply_state_reason: string | null;
};

export function ConversasTab({ portfolioId }: { portfolioId: string }) {
  const [sel, setSel] = useState<{ telefone: string; nome: string | null } | null>(null);
  const { data: preferences = [] } = useQuery({
    queryKey: ["contact-followup-preferences", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_contact_preferences")
        .select("phone, followup_disabled, customer_status").eq("portfolio_id", portfolioId);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5000,
  });
  const preferenceByPhone = new Map(preferences.map((p) => [p.phone, p]));
  const { data: mensagens, isLoading, isError } = useQuery({
    queryKey: ["whatsapp-conversas", portfolioId],
    queryFn: async () => {
      return loadAllConversationRows(async (from, to) => {
      const { data, error } = await supabase
        .from("whatsapp_conversas")
        .select("id, portfolio_id, instance_name, contato_telefone, contato_nome, role, mensagem, sdr_lead_id, created_at, reply_state, reply_state_reason")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as ConversaRow[];
      });
    },
    refetchInterval: 5000,
  });

  const grupos = useMemo(() => {
    const map = new Map<string, {
      telefone: string;
      nome: string | null;
      ultimaMensagem: string;
      ultimaRole: string;
      ultimaAt: string;
      total: number;
      sdr: boolean;
      replyState: string | null;
      replyReason: string | null;
    }>();

    for (const m of mensagens ?? []) {
      const g = map.get(m.contato_telefone);
      if (!g) {
        map.set(m.contato_telefone, {
          telefone: m.contato_telefone,
          nome: m.contato_nome,
          ultimaMensagem: m.mensagem,
          ultimaRole: m.role,
          ultimaAt: m.created_at,
          total: 1,
          sdr: !!m.sdr_lead_id,
          replyState: m.reply_state,
          replyReason: m.reply_state_reason,
        });
      } else {
        if (!g.nome && m.contato_nome) g.nome = m.contato_nome;
        g.total += 1;
        g.sdr = g.sdr || !!m.sdr_lead_id;
        // Já ordenado do mais recente -> o primeiro é o mais recente
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.ultimaAt).getTime() - new Date(a.ultimaAt).getTime()
    );
  }, [mensagens]);

  function formatDate(iso: string) {
    const d = new Date(iso);
    const hoje = new Date();
    const mesmoDia = d.getDate() === hoje.getDate() &&
      d.getMonth() === hoje.getMonth() &&
      d.getFullYear() === hoje.getFullYear();
    if (mesmoDia) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  function iniciais(nome: string | null, telefone: string): string {
    if (nome) {
      const partes = nome.trim().split(/\s+/);
      return partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("").slice(0, 2);
    }
    return telefone.slice(-2);
  }

  if (isLoading) {
    return (
      <Card className="p-8 flex justify-center">
        <MessageSquare className="animate-pulse text-muted-foreground" size={24} />
      </Card>
    );
  }

  if (isError) return <p role="alert" className="p-4 text-destructive">Não foi possível carregar as conversas. Tentaremos novamente.</p>;

  if (!grupos.length) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Nenhuma conversa registrada.
      </Card>
    );
  }

  return (
    <>
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold">Conversas</h3>
        <span className="text-xs text-muted-foreground">{grupos.length} contatos</span>
      </div>
      <ScrollArea className="h-[520px]">
        <div className="divide-y divide-border">
          {grupos.map((g) => (
            <div
              key={g.telefone}
              onClick={() => setSel({ telefone: g.telefone, nome: g.nome })}
              className="flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors cursor-pointer"
            >
              <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                <User size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm truncate">
                    {g.nome ?? `+${g.telefone}`}
                  </span>
                  {g.sdr && (
                    <Badge
                      className="text-[10px] px-1.5 py-0 border-0 font-bold"
                    >
                      SDR
                    </Badge>
                  )}
                  {g.ultimaRole === "user" && ["received", "processing", "failed", "uncertain"].includes(g.replyState ?? "") && <Badge variant="destructive" title={g.replyReason ?? "Em processamento"}>Sem resposta</Badge>}
                  {preferenceByPhone.get(g.telefone.replace(/\D/g, ""))?.customer_status === "course_purchased" ? (
                    <Badge variant="secondary" className="text-[10px]">Cliente — Curso comprado</Badge>
                  ) : preferenceByPhone.get(g.telefone.replace(/\D/g, ""))?.followup_disabled ? (
                    <Badge variant="outline" className="text-[10px]">Follow-up bloqueado</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {g.ultimaRole === "assistant" ? "Você: " : ""}
                  {g.ultimaMensagem}
                </p>
                {g.ultimaRole === "user" && g.replyReason && <p className="text-xs text-muted-foreground truncate">{g.replyReason}</p>}
              </div>
              <div className="shrink-0 text-[10px] text-muted-foreground text-right">
                <div>{formatDate(g.ultimaAt)}</div>
                <div className="mt-0.5">{g.total} msgs</div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>

    <ConversaDetailDialog
      portfolioId={portfolioId}
      telefone={sel?.telefone ?? null}
      nome={sel?.nome ?? null}
      open={!!sel}
      onOpenChange={(v) => { if (!v) setSel(null); }}
    />
    </>
  );
}

