import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/sb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Instagram, Facebook, Link2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const META_APP_ID = "1500000000000000"; // placeholder; real value vem do secret no backend
const SUPABASE_PROJECT_REF = "ouarszsnukpjbvsymmts";
const REDIRECT_URI = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/meta-oauth-callback`;

const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

export function ConectarMetaCard({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [appId, setAppId] = useState<string | null>(null);

  const { data: integrations = [] } = useQuery({
    queryKey: ["social-integrations", portfolioId],
    queryFn: async () => {
      const { data, error } = await sb.from("social_media_integrations").select("*").eq("portfolio_id", portfolioId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Pega o META_APP_ID via edge function ou config pública. Por simplicidade: salvamos como secret e usamos no callback.
  // Aqui usamos uma rota de helper para evitar hardcode. Como fallback, pedimos pra cadastrar no .env do projeto.
  useEffect(() => {
    fetch(`https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/meta-oauth-callback?ping=1`)
      .then(() => setAppId("ok")) // só para confirmar que função existe
      .catch(() => {});
  }, []);

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

  function connect() {
    const state = btoa(JSON.stringify({ portfolio_id: portfolioId, redirect_uri: REDIRECT_URI }));
    // O App ID está no secret no backend — para gerar a URL OAuth precisamos do APP_ID publicamente.
    // Solução: armazenamos APP_ID também em env Vite OU buscamos via edge function. Aqui vamos buscar via fetch.
    setLoading(true);
    fetch(`https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/meta-oauth-callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_app_id" }),
    })
      .then((r) => r.json())
      .then((j) => {
        const id = j.app_id ?? import.meta.env.VITE_META_APP_ID;
        if (!id) {
          toast.error("META_APP_ID não disponível. Configure VITE_META_APP_ID.");
          setLoading(false);
          return;
        }
        const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${id}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}&scope=${META_SCOPES}&response_type=code`;
        window.open(url, "meta-oauth", "width=600,height=700");
      })
      .catch(() => { setLoading(false); toast.error("Falha ao iniciar OAuth"); });
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
