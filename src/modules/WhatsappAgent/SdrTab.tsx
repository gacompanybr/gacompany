import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Play, Pause, Square, RotateCw, Download, Trash2, Bell } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { SdrUpload } from "./SdrUpload";
import { SdrDashboard } from "./SdrDashboard";


type Campaign = {
  id: string;
  portfolio_id: string;
  nome: string;
  status: "draft" | "running" | "paused" | "finished";
  rate_per_hour: number;
  total_leads: number;
  created_at: string;
  finished_at: string | null;
};

type Lead = {
  id: string;
  telefone: string;
  nome: string | null;
  nome_resolvido: string | null;
  nicho: string;
  motivo_contato: string;
  status: string;
  follow_up_count: number;
  primeira_mensagem_em: string | null;
  ultima_mensagem_em: string | null;
  mensagens_trocadas: number;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Aguardando início",
  running: "Em execução",
  paused: "Pausada",
  finished: "Concluída",
};

export function SdrTab({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: campaigns } = useQuery({
    queryKey: ["sdr-campaigns", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sdr_campaigns")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Campaign[];
    },
  });

  const active = useMemo(
    () => (campaigns ?? []).find((c) => ["draft", "running", "paused"].includes(c.status)) ?? null,
    [campaigns],
  );

  const { data: leads } = useQuery({
    queryKey: ["sdr-leads", active?.id],
    enabled: !!active?.id,
    refetchInterval: active && active.status === "running" ? 5000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sdr_leads")
        .select("*")
        .eq("campaign_id", active!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Lead[];
    },
  });

  // Reabrir polling enquanto roda
  useEffect(() => {
    if (!active || active.status !== "running") return;
    const t = setInterval(() => qc.invalidateQueries({ queryKey: ["sdr-campaigns", portfolioId] }), 10000);
    return () => clearInterval(t);
  }, [active, portfolioId, qc]);

  const counters = useMemo(() => {
    const c = {
      total: leads?.length ?? 0,
      pendente: 0, enviado: 0, respondeu: 0, reuniao_confirmada: 0,
      rejeitou: 0, ia_detectada: 0, aguardando_humano: 0, sem_resposta: 0,
      em_andamento: 0,
    };
    for (const l of leads ?? []) (c as any)[l.status]++;
    c.em_andamento = c.enviado + c.respondeu;
    return c;
  }, [leads]);

  async function control(action: "start" | "pause" | "resume" | "finish" | "delete") {
    if (!active) return;
    if (action === "finish" && !confirm("Encerrar a campanha? Não será possível retomar.")) return;
    if (action === "delete" && !confirm("Apagar essa campanha e todos os leads?")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("sdr-control", {
        body: { campaignId: active.id, action },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Atualizado");
      qc.invalidateQueries({ queryKey: ["sdr-campaigns", portfolioId] });
      qc.invalidateQueries({ queryKey: ["sdr-leads", active.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha");
    } finally {
      setBusy(false);
    }
  }

  function exportReport() {
    if (!leads || !active) return;
    const rows = leads.map((l) => ({
      Telefone: `+${l.telefone}`,
      Nome: l.nome_resolvido ?? l.nome ?? "",
      Nicho: l.nicho,
      Status: l.status,
      "Mensagens trocadas": l.mensagens_trocadas,
      "Primeiro contato": l.primeira_mensagem_em ?? "",
      "Último contato": l.ultima_mensagem_em ?? "",
      "Motivo de contato": l.motivo_contato,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SDR");
    XLSX.writeFile(wb, `sdr-${active.nome.replace(/\s+/g, "_")}-${active.id.slice(0, 8)}.xlsx`);
  }

  if (!active) {
    return (
      <div className="space-y-4">
        <SdrUpload portfolioId={portfolioId} onCreated={() => qc.invalidateQueries({ queryKey: ["sdr-campaigns", portfolioId] })} />
        {(campaigns ?? []).filter((c) => c.status === "finished").length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Campanhas encerradas</h3>
            <div className="space-y-1">
              {(campaigns ?? []).filter((c) => c.status === "finished").map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span>{c.nome}</span>
                  <Badge variant="outline">{c.total_leads} leads</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{active.nome}</h3>
            <Badge variant={active.status === "running" ? "default" : "outline"}>
              {STATUS_LABEL[active.status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {active.total_leads} leads · {active.rate_per_hour}/h
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active.status === "draft" && (
            <Button size="sm" onClick={() => control("start")} disabled={busy} className="gap-1">
              {busy ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />} Iniciar
            </Button>
          )}
          {active.status === "running" && (
            <Button size="sm" variant="outline" onClick={() => control("pause")} disabled={busy} className="gap-1">
              <Pause size={14} /> Pausar
            </Button>
          )}
          {active.status === "paused" && (
            <Button size="sm" onClick={() => control("resume")} disabled={busy} className="gap-1">
              <RotateCw size={14} /> Retomar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => control("finish")} disabled={busy} className="gap-1">
            <Square size={14} /> Encerrar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => control("delete")} disabled={busy} className="gap-1 text-destructive">
            <Trash2 size={14} /> Apagar
          </Button>
          <Button size="sm" variant="outline" onClick={exportReport} disabled={!leads?.length} className="gap-1">
            <Download size={14} /> Exportar
          </Button>
        </div>
      </Card>

      <SdrDashboard counters={counters} />

      <Card className="p-4">
        <h4 className="font-semibold mb-2 text-sm">Leads</h4>
        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="text-left p-1.5">Telefone</th>
                <th className="text-left p-1.5">Nome</th>
                <th className="text-left p-1.5">Nicho</th>
                <th className="text-left p-1.5">Status</th>
                <th className="text-left p-1.5">Msgs</th>
                <th className="text-left p-1.5">Último</th>
              </tr>
            </thead>
            <tbody>
              {(leads ?? []).map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="p-1.5">+{l.telefone}</td>
                  <td className="p-1.5">{l.nome_resolvido ?? l.nome ?? "—"}</td>
                  <td className="p-1.5">{l.nicho}</td>
                  <td className="p-1.5"><Badge variant="outline" className="text-[10px]">{l.status}</Badge></td>
                  <td className="p-1.5">{l.mensagens_trocadas}</td>
                  <td className="p-1.5">{l.ultima_mensagem_em ? new Date(l.ultima_mensagem_em).toLocaleString("pt-BR") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
