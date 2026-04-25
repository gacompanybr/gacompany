import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { parseMetaAdsWorkbook } from "./parseXlsx";
import { addAccountToPortfolio, addPortfolio } from "./store";
import { Portfolio, defaultTheme } from "./types";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Props = { portfolios: Portfolio[] };

export function ImportSheetDialog({ portfolios }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<"new" | string>(portfolios[0]?.id ?? "new");
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const { account, warnings } = parseMetaAdsWorkbook(buf, file.name.replace(/\.xlsx?$/i, ""));
      if (target === "new") {
        const name = newPortfolioName.trim() || account.name || "Novo Portfólio";
        const newPortfolio: Portfolio = {
          id: `p-${Date.now()}`,
          name,
          theme: defaultTheme,
          accounts: [account],
        };
        addPortfolio(newPortfolio);
      } else {
        addAccountToPortfolio(target, account);
      }
      warnings.forEach((w) => toast.warning(w));
      toast.success(`Importado: ${account.campaigns.length} campanha(s)`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao importar planilha");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload size={16} /> Importar planilha
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar planilha de campanhas</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Destino</Label>
            <Select value={target} onValueChange={(v) => setTarget(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">+ Criar novo portfólio</SelectItem>
                {portfolios.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {target === "new" && (
            <div>
              <Label>Nome do portfólio (opcional)</Label>
              <Input
                placeholder="Ex.: BM - Cliente X"
                value={newPortfolioName}
                onChange={(e) => setNewPortfolioName(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label>Arquivo .xlsx</Label>
            <Input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Suporta exportações do Meta Ads Manager (PT-BR / EN).
            </p>
          </div>
        </div>
        <DialogFooter>
          {loading && <Loader2 className="animate-spin" size={18} />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
