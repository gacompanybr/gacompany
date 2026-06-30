import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, QrCode, Smartphone, CheckCircle2, RefreshCw, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import QRCode from "qrcode";
import type { WhatsappAgent } from "./types";

type Conn = {
  id: string;
  portfolio_id: string;
  instance_name: string;
  status: "disconnected" | "connecting" | "connected" | string;
  phone: string | null;
};

async function qrToImage(code: string) {
  if (code.startsWith("data:image/")) return code;
  if (code.startsWith("iVBORw0KGgo") || code.startsWith("/9j/") || code.startsWith("UklGR")) {
    return `data:image/png;base64,${code}`;
  }
  return QRCode.toDataURL(code, {
    width: 240,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

export function ConectarTab({
  agent, onRefresh,
}: { agent: WhatsappAgent; onRefresh: () => void }) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const portfolioId = agent.portfolio_id;

  const { data: conn, refetch } = useQuery({
    queryKey: ["whatsapp-connection", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .maybeSingle();
      if (error) throw error;
      return data as Conn | null;
    },
  });

  // Polling enquanto "connecting"
  useEffect(() => {
    if (conn?.status !== "connecting") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase.functions.invoke("whatsapp-connection", {
        body: { action: "status", portfolioId },
      });
      if ((data as any)?.state === "open") {
        toast.success("WhatsApp conectado!");
        setQr(null);
        await refetch();
        onRefresh();
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [conn?.status, portfolioId, refetch, onRefresh]);

  async function handleConnect(opts: { force?: boolean } = {}) {
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-connection", {
      body: { action: "connect", portfolioId, force: !!opts.force },
    });
    setGenerating(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "Falha ao gerar QR");
    }
    const code = (data as any)?.qr;
    if (!code) return toast.error("QR não retornado");
    setQr(await qrToImage(code));
    await refetch();
  }

  async function handleDisconnect() {
    const { error } = await supabase.functions.invoke("whatsapp-connection", {
      body: { action: "disconnect", portfolioId },
    });
    if (error) return toast.error(error.message);
    toast.success("Desconectado.");
    setQr(null);
    await refetch();
    onRefresh();
  }

  function copyInstance() {
    if (!conn?.instance_name) return;
    navigator.clipboard.writeText(conn.instance_name);
    toast.success("instance_name copiado");
  }

  async function handleRepair() {
    setRepairing(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-connection", {
      body: { action: "repair", portfolioId },
    });
    setRepairing(false);

    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "Falha ao reparar conexão");
    }

    await refetch();
    onRefresh();
    if ((data as any)?.ok) {
      toast.success("Webhook reparado. Envie uma nova mensagem de outro número para testar.");
    } else {
      toast.error(`Instância não está aberta: ${(data as any)?.state ?? "desconhecido"}`);
    }
  }

  // ===== Conectado =====
  if (conn?.status === "connected") {
    return (
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="text-green-500" size={28} />
          <div className="flex-1">
            <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30 mb-1">
              ✅ Conectado
            </Badge>
            <p className="text-sm">Número: <strong>{conn.phone ?? "—"}</strong></p>
            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
              <span>instance_name: <code className="bg-muted px-1.5 py-0.5 rounded">{conn.instance_name}</code></span>
              <button onClick={copyInstance} className="hover:text-foreground"><Copy size={12} /></button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Use este <strong>instance_name</strong> no campo <code>instancia_id</code> das campanhas do Robô para este cliente.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleRepair} variant="default" disabled={repairing} className="gap-2">
            {repairing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            Reparar resposta
          </Button>
          <Button onClick={handleDisconnect} variant="outline">Desconectar</Button>
        </div>
      </Card>
    );
  }

  // ===== Connecting (com QR) =====
  if (conn?.status === "connecting" && qr) {
    return (
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Escaneie o QR Code</h3>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="bg-white p-3 rounded shrink-0">
            <img src={qr} alt="QR Code" className="w-48 h-48" />
          </div>
          <ol className="text-sm space-y-2 list-decimal list-inside">
            <li>Abra o WhatsApp no celular</li>
            <li>Configurações → Dispositivos vinculados</li>
            <li>Vincular um dispositivo</li>
            <li>Aponte para o QR ao lado</li>
            <li>Aguarde — o status atualiza automaticamente.</li>
          </ol>
        </div>
        <div className="text-xs text-muted-foreground">
          instance_name: <code className="bg-muted px-1.5 py-0.5 rounded">{conn.instance_name}</code>
        </div>
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button onClick={handleConnect} variant="outline" size="sm" className="gap-2" disabled={generating}>
            <RefreshCw size={14} /> Gerar novo QR
          </Button>
          <Button onClick={handleDisconnect} variant="ghost" size="sm">Cancelar</Button>
        </div>
      </Card>
    );
  }

  // ===== Desconectado / inicial =====
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Smartphone className="text-primary" size={24} />
        <h3 className="font-semibold">Conectar WhatsApp</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Cada cliente possui uma instância Evolution isolada. Clique em "Conectar WhatsApp" para gerar o QR Code.
      </p>
      {conn?.instance_name && (
        <div className="text-xs text-muted-foreground">
          Última instância: <code className="bg-muted px-1.5 py-0.5 rounded">{conn.instance_name}</code> ({conn.status})
        </div>
      )}
      <Button onClick={handleConnect} disabled={generating} className="gap-2">
        {generating ? <Loader2 className="animate-spin" size={14} /> : <QrCode size={14} />}
        {generating ? "Gerando..." : "Conectar WhatsApp"}
      </Button>
      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        Endpoint: <code>evo.gacompany.online</code>
      </p>
    </Card>
  );
}
