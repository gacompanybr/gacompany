import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Faq, WhatsappAgent } from "./types";
import { toast } from "sonner";

const MAX_FAQS = 20;

export function FaqsTab({
  agent, onChange,
}: { agent: WhatsappAgent; onChange: (patch: Partial<WhatsappAgent>) => void }) {
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<{ idx: number; faq: Faq } | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");

  function openNew() {
    if (agent.faqs.length >= MAX_FAQS) return toast.error(`Máximo de ${MAX_FAQS} FAQs.`);
    setEditing(null); setPergunta(""); setResposta(""); setOpenDialog(true);
  }
  function openEdit(idx: number) {
    setEditing({ idx, faq: agent.faqs[idx] });
    setPergunta(agent.faqs[idx].pergunta);
    setResposta(agent.faqs[idx].resposta);
    setOpenDialog(true);
  }
  function save() {
    if (!pergunta.trim() || !resposta.trim()) return toast.error("Preencha pergunta e resposta.");
    const next = [...agent.faqs];
    if (editing) next[editing.idx] = { pergunta, resposta };
    else next.push({ pergunta, resposta });
    onChange({ faqs: next });
    setOpenDialog(false);
  }
  function remove(idx: number) {
    onChange({ faqs: agent.faqs.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {agent.faqs.length} / {MAX_FAQS} FAQs
        </p>
        <Button onClick={openNew} className="gap-2"><Plus size={14} /> Adicionar FAQ</Button>
      </div>

      {agent.faqs.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground border-dashed">
          Nenhuma FAQ ainda. Cadastre perguntas frequentes para o agente responder mais rápido.
        </Card>
      )}

      {agent.faqs.map((f, idx) => (
        <Card key={idx} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{f.pergunta}</p>
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{f.resposta}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={() => openEdit(idx)}><Pencil size={14} /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(idx)}><Trash2 size={14} /></Button>
            </div>
          </div>
        </Card>
      ))}

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar FAQ" : "Nova FAQ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Pergunta</Label>
              <Input value={pergunta} onChange={(e) => setPergunta(e.target.value)} />
            </div>
            <div>
              <Label>Resposta</Label>
              <Textarea rows={4} value={resposta} onChange={(e) => setResposta(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
