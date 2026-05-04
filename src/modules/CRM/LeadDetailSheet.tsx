import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, MessageSquare, Phone, Mail, Users, FileText } from "lucide-react";
import { ORIGEM_LABELS, type CrmLead, type CrmInteracao } from "./types";

const TIPO_ICON = { nota: FileText, ligacao: Phone, whatsapp: MessageSquare, email: Mail, reuniao: Users };

export function LeadDetailSheet({
  lead, portfolioId, open, onOpenChange,
}: {
  lead: CrmLead | null;
  portfolioId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<CrmInteracao["tipo"]>("nota");
  const [descricao, setDescricao] = useState("");

  const { data: interacoes = [] } = useQuery({
    queryKey: ["crm-interacoes", lead?.id],
    queryFn: async () => {
      if (!lead) return [];
      const { data, error } = await supabase
        .from("crm_interacoes")
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CrmInteracao[];
    },
    enabled: !!lead,
  });

  const addInteracao = useMutation({
    mutationFn: async () => {
      if (!lead || !descricao.trim()) throw new Error("Descrição obrigatória");
      const { error } = await supabase.from("crm_interacoes").insert({
        lead_id: lead.id, tipo, descricao: descricao.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDescricao("");
      qc.invalidateQueries({ queryKey: ["crm-interacoes", lead?.id] });
      toast.success("Interação registrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delLead = useMutation({
    mutationFn: async () => {
      if (!lead) return;
      const { error } = await supabase.from("crm_leads").delete().eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads", portfolioId] });
      toast.success("Lead excluído");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{lead.nome}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Telefone</div>
              <div>{lead.telefone || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Email</div>
              <div className="truncate">{lead.email || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Origem</div>
              <Badge variant="secondary">{ORIGEM_LABELS[lead.origem]}</Badge>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Valor estimado</div>
              <div>{lead.valor_estimado ? `R$ ${Number(lead.valor_estimado).toLocaleString("pt-BR")}` : "—"}</div>
            </div>
          </div>

          {lead.observacoes && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">Observações</div>
              <p className="text-sm">{lead.observacoes}</p>
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="font-semibold mb-2 text-sm">Nova interação</h4>
            <div className="space-y-2">
              <Select value={tipo} onValueChange={(v) => setTipo(v as CrmInteracao["tipo"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nota">Nota</SelectItem>
                  <SelectItem value="ligacao">Ligação</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="reuniao">Reunião</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                rows={3}
                placeholder="Descreva a interação..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
              <Button onClick={() => addInteracao.mutate()} disabled={addInteracao.isPending} size="sm" className="w-full">
                Registrar
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-semibold mb-2 text-sm">Histórico ({interacoes.length})</h4>
            <div className="space-y-2">
              {interacoes.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma interação registrada.</p>
              )}
              {interacoes.map((i) => {
                const Icon = TIPO_ICON[i.tipo] ?? FileText;
                return (
                  <div key={i.id} className="border rounded p-2 text-sm">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Icon size={12} />
                      <span className="capitalize">{i.tipo}</span>
                      <span>· {new Date(i.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                    <div>{i.descricao}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t pt-4">
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => {
                if (confirm("Excluir este lead permanentemente?")) delLead.mutate();
              }}
            >
              <Trash2 size={14} /> Excluir lead
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
