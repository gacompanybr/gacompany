import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, QrCode, Smartphone, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { WhatsappAgent } from "./types";

// Placeholder QR — em produção, vem da Evolution API
const QR_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#fff"/>
  <g fill="#000">
    ${Array.from({ length: 400 }).map(() => {
      const x = Math.floor(Math.random() * 25) * 8;
      const y = Math.floor(Math.random() * 25) * 8;
      return `<rect x="${x}" y="${y}" width="8" height="8"/>`;
    }).join("")}
    <rect x="0" y="0" width="56" height="56" fill="#fff" stroke="#000" stroke-width="8"/>
    <rect x="16" y="16" width="24" height="24" fill="#000"/>
    <rect x="144" y="0" width="56" height="56" fill="#fff" stroke="#000" stroke-width="8"/>
    <rect x="160" y="16" width="24" height="24" fill="#000"/>
    <rect x="0" y="144" width="56" height="56" fill="#fff" stroke="#000" stroke-width="8"/>
    <rect x="16" y="160" width="24" height="24" fill="#000"/>
  </g>
</svg>
`);

export function ConectarTab({
  agent, onRefresh,
}: { agent: WhatsappAgent; onRefresh: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [showQr, setShowQr] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    // Simulação: marca como connecting
    await supabase.from("whatsapp_agents")
      .update({ status: "connecting" })
      .eq("id", agent.id);
    setTimeout(() => {
      setShowQr(true);
      setGenerating(false);
    }, 800);
  }

  async function handleDisconnect() {
    const { error } = await supabase.from("whatsapp_agents")
      .update({ status: "inactive", instancia_id: null, telefone: null })
      .eq("id", agent.id);
    if (error) return toast.error(error.message);
    toast.success("Desconectado.");
    setShowQr(false);
    onRefresh();
  }

  // Simular conexão (botão de teste já que não há Evolution real)
  async function handleSimulateConnect() {
    const { error } = await supabase.from("whatsapp_agents")
      .update({
        status: "active",
        instancia_id: `sim_${Date.now()}`,
        telefone: "+55 11 9 0000-0000",
      })
      .eq("id", agent.id);
    if (error) return toast.error(error.message);
    toast.success("Conexão simulada com sucesso!");
    setShowQr(false);
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
          </div>
        </div>
        <Button onClick={handleDisconnect} variant="outline">Desconectar</Button>
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          A conexão usa Evolution API (self-hosted). Configure a URL nas variáveis de ambiente para conectar uma instância real.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      {!showQr ? (
        <>
          <div className="flex items-center gap-3">
            <Smartphone className="text-primary" size={24} />
            <h3 className="font-semibold">Conectar WhatsApp</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Clique em "Gerar QR Code" para vincular o WhatsApp do seu celular ao agente.
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
              <img src={QR_PLACEHOLDER} alt="QR Code" className="w-48 h-48" />
            </div>
            <ol className="text-sm space-y-2 list-decimal list-inside">
              <li>Abra o WhatsApp no seu celular</li>
              <li>Toque em <strong>Configurações → Dispositivos vinculados</strong></li>
              <li>Toque em <strong>Vincular um dispositivo</strong></li>
              <li>Aponte a câmera para o QR Code ao lado</li>
            </ol>
          </div>
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button onClick={handleSimulateConnect} variant="default" size="sm">
              Simular conexão (teste)
            </Button>
            <Button onClick={() => setShowQr(false)} variant="outline" size="sm">Cancelar</Button>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        A conexão usa Evolution API (self-hosted). Configure a URL nas variáveis de ambiente para conectar uma instância real.
      </p>
    </Card>
  );
}
