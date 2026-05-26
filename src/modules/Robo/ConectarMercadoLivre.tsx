import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Link as LinkIcon, Unlink, RefreshCw, CheckCircle2 } from "lucide-react";

const ML_INIT_URL = "https://ouarszsnukpjbvsymmts.supabase.co/functions/v1/ml-oauth-callback";

type Integ = {
  id: string;
  nickname: string | null;
  ml_user_id: string;
  expires_at: string;
  status: string;
};

export function ConectarMercadoLivre({
  portfolioId, roboId,
}: { portfolioId: string; roboId: string | null }) {
  const [integ, setInteg] = useState<Integ | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchInteg() {
    if (!roboId) return;
    setLoading(true);
    const { data } = await supabase
      .from("mercadolivre_integracoes" as any)
      .select("id, nickname, ml_user_id, expires_at, status")
      .eq("robo_campanha_id", roboId)
      .maybeSingle();
    setInteg((data as any) ?? null);
    setLoading(false);
  }

  useEffect(() => { fetchInteg(); }, [roboId]);

  // re-checa quando a aba volta ao foco (depois do OAuth)
  useEffect(() => {
    const onFocus = () => fetchInteg();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [roboId]);

  function conectar() {
    if (!roboId) return toast.error("Salve o robô antes de conectar.");
    const state = `${portfolioId}:${roboId}`;
    const url = `${ML_INIT_URL}?init=1&state=${encodeURIComponent(state)}`;
    window.open(url, "_blank", "width=600,height=750");
  }


  async function desconectar() {
    if (!integ) return;
    if (!confirm("Desconectar essa conta do Mercado Livre desse robô?")) return;
    const { error } = await supabase
      .from("mercadolivre_integracoes" as any)
      .delete()
      .eq("id", integ.id);
    if (error) return toast.error(error.message);
    toast.success("Mercado Livre desconectado");
    setInteg(null);
  }

  if (!roboId) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        Salve o robô primeiro para conectar uma conta do Mercado Livre.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Conta do Mercado Livre</p>
        <Button type="button" size="icon" variant="ghost" onClick={fetchInteg} disabled={loading}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </Button>
      </div>

      {integ ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="text-sm font-medium truncate">{integ.nickname ?? integ.ml_user_id}</span>
              <Badge variant="outline" className="text-[10px]">{integ.status}</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Token válido até {new Date(integ.expires_at).toLocaleString("pt-BR")}
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={desconectar} className="gap-1">
            <Unlink size={12} /> Desconectar
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Conecte uma conta para autorizar leitura/postagem.</p>
          <Button type="button" size="sm" onClick={conectar} className="gap-1">
            <LinkIcon size={12} /> Conectar
          </Button>
        </div>
      )}
    </div>
  );
}
