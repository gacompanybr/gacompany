import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { ORIGEM_LABELS, type LeadOrigem } from "./types";

export function NovoLeadDialog({
  portfolioId,
  portfolios = [],
}: {
  portfolioId?: string;
  portfolios?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [origem, setOrigem] = useState<LeadOrigem>("manual");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(portfolioId ?? "");
  const qc = useQueryClient();

  const reset = () => {
    setNome(""); setTelefone(""); setEmail(""); setOrigem("manual"); setValor(""); setObs("");
    setSelectedPortfolioId(portfolioId ?? "");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Nome é obrigatório");
      if (!selectedPortfolioId) throw new Error("Selecione o cliente");
      const { error } = await supabase.from("crm_leads").insert({
        portfolio_id: selectedPortfolioId,
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        origem,
        status: "novo",
        valor_estimado: valor ? Number(valor) : null,
        observacoes: obs.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead criado");
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      reset(); setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus size={16} /> Novo lead</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!portfolioId && (
            <div>
              <Label>Cliente *</Label>
              <Select value={selectedPortfolioId} onValueChange={setSelectedPortfolioId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {portfolios.map((portfolio) => (
                    <SelectItem key={portfolio.id} value={portfolio.id}>{portfolio.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Telefone</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Origem</Label>
              <Select value={origem} onValueChange={(v) => setOrigem(v as LeadOrigem)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORIGEM_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor estimado (R$)</Label>
              <Input type="number" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Criar lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
