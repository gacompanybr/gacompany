import { loadAllConversationRows } from "@/lib/conversation-history";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { ContactFollowupControl } from "./ContactFollowupControl";

type Msg = {
  id: string;
  role: string;
  mensagem: string;
  created_at: string;
};

export function ConversaDetailDialog({
  portfolioId,
  telefone,
  nome,
  open,
  onOpenChange,
}: {
  portfolioId: string;
  telefone: string | null;
  nome: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: mensagens, isLoading, isError } = useQuery({
    queryKey: ["whatsapp-conversa-detalhe", portfolioId, telefone],
    queryFn: async () => {
      if (!telefone) return [];
      return loadAllConversationRows(async (from, to) => {
      const { data, error } = await supabase
        .from("whatsapp_conversas")
        .select("id, role, mensagem, created_at")
        .eq("portfolio_id", portfolioId)
        .eq("contato_telefone", telefone)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as Msg[];
      });
    },
    enabled: open && !!telefone,
    refetchInterval: open ? 8000 : false,
  });

  function hora(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">
            {nome ?? (telefone ? `+${telefone}` : "Conversa")}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Histórico completo
          </p>
        </DialogHeader>

        {telefone && <ContactFollowupControl key={`${portfolioId}:${telefone}`} portfolioId={portfolioId} telefone={telefone} />}

        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="animate-spin text-muted-foreground" size={20} />
          </div>
        ) : isError ? (<p role="alert" className="py-10 text-destructive">Não foi possível carregar as mensagens.</p>) : !mensagens?.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma mensagem registrada.
          </p>
        ) : (
          <ScrollArea className="h-[40vh] pr-3">
            <div className="space-y-3 py-1">
              {mensagens.map((m) => {
                const isAgent = m.role === "assistant";
                return (
                  <div
                    key={m.id}
                    className={`flex ${isAgent ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                        isAgent
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {m.role === "human" && <div className="text-xs font-semibold mb-1">Equipe</div>}
                      <div>{m.mensagem}</div>
                      <div
                        className={`mt-1 text-[10px] ${
                          isAgent ? "opacity-70" : "text-muted-foreground"
                        }`}
                      >
                        {hora(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
