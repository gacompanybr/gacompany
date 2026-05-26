import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/sb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Instagram, Facebook, Link2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_PROJECT_REF = "ouarszsnukpjbvsymmts";
const CALLBACK_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/meta-oauth-callback`;
const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "business_management",
];

export function ConectarMetaCard({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const { data: integrations = [] } = useQuery({
    queryKey: ["social-integrations", portfolioId],
    queryFn: async () => {
      const { data, error } = await sb.from("social_media_integrations").select("*").eq("portfolio_id", portfolioId);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === "meta-oauth-success") {
        toast.success("Conta Meta conectada!");
        qc.invalidateQueries({ queryKey: ["social-integrations", portfolioId] });
        setLoading(false);
      } else if (e.data?.type === "meta-oauth-error") {
        toast.error("Erro Meta: " + e.data.error);
        setLoading(false);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [qc, portfolioId]);

  async function connect() {
    setLoading(true);
    try {
      const r = await fetch(`${CALLBACK_URL}?config=1`);
      const { app_id } = await r.json();
      if (!app_id) throw new Error("META_APP_ID não configurado");
      const state = btoa(JSON.stringify({ portfolio_id: portfolioId, redirect_uri: CALLBACK_URL }));
      const params = new URLSearchParams({
        client_id: app_id,
        redirect_uri: CALLBACK_URL,
        state,
        scope: META_SCOPES.join(","),
        response_type: "code",
        auth_type: "rerequest",
        _ts: Date.now().toString(),
      });
      const url = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
      window.open(url, "meta-oauth", "width=600,height=700");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao iniciar OAuth");
      setLoading(false);
    }
  }

  async function disconnect(id: string) {
    if (!confirm("Desconectar esta conta?")) return;
    const { error } = await sb.from("social_media_integrations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Desconectado");
    qc.invalidateQueries({ queryKey: ["social-integrations", portfolioId] });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Instagram size={14} /> <Facebook size={14} /> Contas Meta conectadas
            </h3>
            <p className="text-xs text-muted-foreground">Conecte Instagram Business + Página do Facebook para publicar direto daqui.</p>
          </div>
          <Button size="sm" onClick={connect} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
            Conectar Meta
          </Button>
        </div>

        {integrations.length > 0 && (
          <div className="space-y-2">
            {integrations.map((i: any) => (
              <div key={i.id} className="flex items-center justify-between border rounded p-2 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="gap-1"><Facebook size={10} /> {i.fb_page_name}</Badge>
                  {i.ig_username && <Badge variant="outline" className="gap-1"><Instagram size={10} /> @{i.ig_username}</Badge>}
                  <Badge variant={i.status === "active" ? "default" : "destructive"} className="text-[10px]">{i.status}</Badge>
                </div>
                <Button size="icon" variant="ghost" onClick={() => disconnect(i.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
