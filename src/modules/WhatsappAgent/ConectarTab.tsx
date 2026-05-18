import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, QrCode, Smartphone, CheckCircle2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { WhatsappAgent } from "./types";

export function ConectarTab({
  agent, onRefresh,
}: { agent: WhatsappAgent; onRefresh: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Polling de status enquanto está em "connecting"
  useEffect(() => {
    if (agent.status !== "connecting") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase.functions.invoke("evolution-instance", {
        body: { action: "status", agentId: agent.id },
      });
      if ((data as any)?.state === "open") {
        toast.success("WhatsApp conectado!");
        setQr(null);
        onRefresh();
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [agent.status, agent.id, onRefresh]);

  async function handleGenerate() {
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("evolution-instance", {
      body: { action: "connect", agentId: agent.id },
    });
    setGenerating(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "Falha ao gerar QR");
    }
    const code = (data as any)?.qr;
    if (!code) {
      toast.error("QR não retornado pela Evolution");
      return;
    }
    setQr(code.startsWith("data:") ? code : `data:image/png;base64,${code}`);
    onRefresh();
  }

  async function handleDisconnect() {
    const { error } = await supabase.functions.invoke("evolution-instance", {
      body: { action: "disconnect", agentId: agent.id },
    });
    if (error) return toast.error(error.message);
    toast.success("Desconectado.");
    setQr(null);
    onRefresh();
  }

  if (agent.status === "active") {
    return (
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="text-green-500" size={28} />
          <div>
            <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30 mb-1">
              ✅ Conectado
            </Badge>
            <p className="text-sm">Número: <strong>{agent.telefone ?? "—"}</strong></p>
            <p className="text-xs text-muted-foreground">Instância: {agent.instancia_id}</p>
          </div>
        </div>
        <Button onClick={handleDisconnect} variant="outline">Desconectar</Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      {!qr ? (
        <>
          <div className="flex items-center gap-3">
            <Smartphone className="text-primary" size={24} />
            <h3 className="font-semibold">Conectar WhatsApp</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Clique em "Gerar QR Code" para vincular o WhatsApp do dispositivo ao agente via Evolution API.
          </p>
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="animate-spin" size={14} /> : <QrCode size={14} />}
            {generating ? "Gerando..." : "Gerar QR Code"}
          </Button>
        </>
      ) : (
        <>
          <h3 className="font-semibold">Escaneie o QR Code</h3>
          <div className="flex flex-col md:flex-row gap-6">
            <div className="bg-white p-3 rounded shrink-0">
              <img src={qr} alt="QR Code" className="w-48 h-48" />
            </div>
            <ol className="text-sm space-y-2 list-decimal list-inside">
              <li>Abra o WhatsApp no seu celular</li>
              <li>Toque em <strong>Configurações → Dispositivos vinculados</strong></li>
              <li>Toque em <strong>Vincular um dispositivo</strong></li>
              <li>Aponte a câmera para o QR ao lado</li>
              <li>Aguarde — o status atualiza automaticamente.</li>
            </ol>
          </div>
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button onClick={handleGenerate} variant="outline" size="sm" className="gap-2">
              <RefreshCw size={14} /> Gerar novo QR
            </Button>
            <Button onClick={() => setQr(null)} variant="ghost" size="sm">Fechar</Button>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        Endpoint: <code>{`evo.gacompany.online`}</code> · O webhook de mensagens será configurado automaticamente.
      </p>
    </Card>
  );
}
