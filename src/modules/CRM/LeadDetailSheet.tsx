import { useEffect, useState } from "react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, Trash2, MessageSquare, Phone, Mail, Users, FileText } from "lucide-react";
import { ORIGEM_LABELS, STATUS_COLUNAS, leadAnswers, type CrmLead, type CrmInteracao, type LeadOrigem, type LeadStatus } from "./types";

const TIPO_ICON = { nota: FileText, ligacao: Phone, whatsapp: MessageSquare, email: Mail, reuniao: Users };

export function LeadDetailSheet({
  lead, open, onOpenChange,
}: {
  lead: CrmLead | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<CrmInteracao["tipo"]>("nota");
  const [descricao, setDescricao] = useState("");
  const [nome, setNome] = useState("");
  const [status, setStatus] = useState<LeadStatus>("novo");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [origem, setOrigem] = useState<LeadOrigem>("manual");
  const [valor, setValor] = useState("");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (!lead) return;
    setNome(lead.nome);
    setStatus(lead.status);
    setTelefone(lead.telefone ?? "");
    setEmail(lead.email ?? "");
    setOrigem(lead.origem);
    setValor(lead.valor_estimado === null ? "" : String(lead.valor_estimado));
    setObservacoes(lead.observacoes ?? "");
  }, [lead]);

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

  const updateLead = useMutation({
    mutationFn: async () => {
      if (!lead) return;
      const parsedValue = valor.trim() === "" ? null : Number(valor);
      if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
        throw new Error("Informe um valor estimado válido");
      }
      if (!nome.trim()) throw new Error("Informe o nome");
      const { error } = await supabase.from("crm_leads").update({
        nome: nome.trim(),
        status,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        origem,
        valor_estimado: parsedValue,
        observacoes: observacoes.trim() || null,
      }).eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      toast.success("Lead atualizado");
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
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
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
          {leadAnswers(lead).length > 0 && (
            <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <h4 className="font-semibold text-sm">Respostas do formulário</h4>
              {leadAnswers(lead).map((a) => (
                <div key={a.pergunta} className="text-sm">
                  <div className="text-xs text-muted-foreground">{a.pergunta}</div>
                  <div className="font-medium">{a.resposta || "—"}</div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Dados do lead</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="crm-lead-name">Nome</Label>
                <Input id="crm-lead-name" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div>
                <Label>Etapa</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_COLUNAS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="crm-lead-phone">Telefone</Label>
                <Input
                  id="crm-lead-phone"
                  value={telefone}
                  onChange={(event) => setTelefone(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="crm-lead-email">Email</Label>
                <Input
                  id="crm-lead-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Origem</Label>
                <Select value={origem} onValueChange={(value) => setOrigem(value as LeadOrigem)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ORIGEM_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="crm-lead-value">Valor estimado (R$)</Label>
                <Input
                  id="crm-lead-value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={valor}
                  onChange={(event) => setValor(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="crm-lead-notes">Observações</Label>
              <Textarea
                id="crm-lead-notes"
                rows={3}
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
              />
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => updateLead.mutate()}
              disabled={updateLead.isPending}
            >
              <Save size={15} /> {updateLead.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>

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
