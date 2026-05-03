import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

export function GerenciarAcessosDialog({
  userId, userLabel, currentPortfolioIds, open, onOpenChange, onSaved,
}: {
  userId: string;
  userLabel: string;
  currentPortfolioIds: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [portfolios, setPortfolios] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentPortfolioIds));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected(new Set(currentPortfolioIds));
  }, [currentPortfolioIds, open]);

  useEffect(() => {
    if (!open) return;
    supabase.from("portfolios").select("id, name").order("name").then(({ data }) => {
      setPortfolios(data ?? []);
    });
  }, [open]);

  async function handleSave() {
    setBusy(true);
    const original = new Set(currentPortfolioIds);
    const toAdd = [...selected].filter((id) => !original.has(id));
    const toRemove = [...original].filter((id) => !selected.has(id));

    if (toAdd.length) {
      const { error } = await supabase
        .from("user_portfolio_access")
        .insert(toAdd.map((portfolio_id) => ({ user_id: userId, portfolio_id })));
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    if (toRemove.length) {
      const { error } = await supabase
        .from("user_portfolio_access")
        .delete()
        .eq("user_id", userId)
        .in("portfolio_id", toRemove);
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    setBusy(false);
    toast.success("Acessos atualizados!");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acessos de {userLabel}</DialogTitle>
        </DialogHeader>
        <div className="border border-border rounded p-2 max-h-72 overflow-auto space-y-1">
          {portfolios.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum cliente cadastrado.</p>
          )}
          {portfolios.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={selected.has(p.id)}
                onCheckedChange={(v) => {
                  setSelected((cur) => {
                    const next = new Set(cur);
                    if (v) next.add(p.id); else next.delete(p.id);
                    return next;
                  });
                }}
              />
              {p.name}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
