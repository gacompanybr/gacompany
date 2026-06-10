import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Upload, Tag, Trash2 } from "lucide-react";

type Promo = {
  id: string;
  portfolio_id: string;
  link: string | null;
  image_url: string | null;
  texto: string | null;
  ativo: boolean;
};

export function BeaconsPromocaoCard({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [link, setLink] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [texto, setTexto] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["beacons-promo", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beacons_promocoes" as any)
        .select("*")
        .eq("portfolio_id", portfolioId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Promo | null;
    },
  });

  useEffect(() => {
    if (data) {
      setLink(data.link ?? "https://beacons.ai/garimpaai/promocao");
      setImageUrl(data.image_url ?? "");
      setTexto(data.texto ?? "");
      setAtivo(data.ativo);
    } else if (!isLoading) {
      setLink("https://beacons.ai/garimpaai/promocao");
    }
  }, [data, isLoading]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${portfolioId}/beacons-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("social-media")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploading(false);
      return toast.error(upErr.message);
    }
    const { data: pub } = supabase.storage.from("social-media").getPublicUrl(path);
    setImageUrl(pub.publicUrl);
    setUploading(false);
    toast.success("Imagem enviada!");
  }

  async function save() {
    setSaving(true);
    const payload = {
      portfolio_id: portfolioId,
      link: link.trim() || null,
      image_url: imageUrl.trim() || null,
      texto: texto.trim() || null,
      ativo,
    };
    const { error } = await supabase
      .from("beacons_promocoes" as any)
      .upsert(payload, { onConflict: "portfolio_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Promoção salva!");
    qc.invalidateQueries({ queryKey: ["beacons-promo", portfolioId] });
  }

  async function limpar() {
    if (!data) return;
    if (!confirm("Remover a promoção cadastrada?")) return;
    const { error } = await supabase
      .from("beacons_promocoes" as any)
      .delete()
      .eq("id", data.id);
    if (error) return toast.error(error.message);
    setLink("https://beacons.ai/garimpaai/promocao");
    setImageUrl("");
    setTexto("");
    setAtivo(true);
    qc.invalidateQueries({ queryKey: ["beacons-promo", portfolioId] });
    toast.success("Promoção removida");
  }

  return (
    <Card className="p-4 border-primary/30">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-primary" />
          <div>
            <h2 className="font-semibold text-sm">Promoção Beacons (do dia)</h2>
            <p className="text-xs text-muted-foreground">
              Base usada pelos robôs para anexar imagem + texto da promoção atual.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="promo-ativo" className="text-xs">Ativo</Label>
          <Switch id="promo-ativo" checked={ativo} onCheckedChange={setAtivo} />
        </div>
      </div>

      {isLoading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="animate-spin text-primary" size={16} />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Link da promoção</Label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://beacons.ai/garimpaai/promocao"
            />
          </div>

          <div>
            <Label className="text-xs">Imagem da promoção</Label>
            <div className="flex gap-2 items-start">
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="URL da imagem ou faça upload"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => document.getElementById("beacons-upload")?.click()}
                className="gap-1"
              >
                {uploading ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />}
                Upload
              </Button>
              <input
                id="beacons-upload"
                type="file"
                accept="image/*"
                hidden
                onChange={handleUpload}
              />
            </div>
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Preview promoção"
                className="mt-2 max-h-40 rounded border border-border object-contain bg-muted"
              />
            )}
          </div>

          <div>
            <Label className="text-xs">Texto da promoção</Label>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="🔥 Promoção de hoje! Confira em..."
              rows={4}
            />
          </div>

          <div className="flex gap-2 justify-end">
            {data && (
              <Button variant="ghost" size="sm" onClick={limpar} className="gap-1 text-destructive">
                <Trash2 size={12} /> Remover
              </Button>
            )}
            <Button onClick={save} disabled={saving} size="sm" className="gap-1">
              {saving ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
              Salvar promoção
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
