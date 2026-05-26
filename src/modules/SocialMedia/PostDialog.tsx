import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, Upload, X } from "lucide-react";
import { PLATAFORMAS, type Plataforma, type PostTipo, type SocialPost } from "./types";

interface Props {
  portfolioId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialDate?: Date | null;
  editing?: SocialPost | null;
}

// Story só precisa de imagem. Reels/Carrossel/Post precisam legenda+imagem.
const TIPO_PRECISA_LEGENDA: Record<PostTipo, boolean> = {
  post: true, reels: true, carrossel: true, story: false,
};

export function PostDialog({ portfolioId, open, onOpenChange, initialDate, editing }: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [titulo, setTitulo] = useState("");
  const [legenda, setLegenda] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [plataformas, setPlataformas] = useState<Plataforma[]>([]);
  const [tipo, setTipo] = useState<PostTipo>("post");
  const [data, setData] = useState("");
  const [imagem, setImagem] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const precisaLegenda = TIPO_PRECISA_LEGENDA[tipo];

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitulo(editing.titulo);
      setLegenda(editing.legenda ?? editing.conteudo ?? "");
      setHashtags(editing.hashtags ?? "");
      setPlataformas(editing.plataformas ?? []);
      setTipo(editing.tipo);
      setData(editing.data_agendada ? new Date(editing.data_agendada).toISOString().slice(0, 16) : "");
      setImagem(editing.imagem_url ?? "");
    } else {
      setTitulo(""); setLegenda(""); setHashtags(""); setPlataformas([]); setTipo("post"); setImagem("");
      setData(initialDate ? new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
    }
  }, [open, editing, initialDate]);

  const togglePlat = (p: Plataforma) =>
    setPlataformas((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${portfolioId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("social-media").upload(path, file, {
        cacheControl: "3600", upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("social-media").getPublicUrl(path);
      setImagem(pub.publicUrl);
      toast.success("Imagem enviada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  };

  const gerarIA = async () => {
    if (!titulo.trim()) { toast.error("Informe o título antes"); return; }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          systemPrompt: "Você é um especialista em redes sociais. Responda APENAS em JSON válido com as chaves 'legenda' e 'hashtags'.",
          userPrompt: `Crie uma legenda envolvente em português para a seguinte ideia de post:
Título: ${titulo}
Plataformas: ${plataformas.length ? plataformas.join(", ") : "todas"}
Tipo: ${tipo}

Responda EXATAMENTE neste formato JSON:
{"legenda": "texto da legenda com emojis", "hashtags": "#hash1 #hash2 #hash3"}`,
          temperature: 0.85,
          maxTokens: 600,
        },
      });
      if (error) throw error;
      const raw = data?.content ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed.legenda) setLegenda(parsed.legenda);
          if (parsed.hashtags) setHashtags(parsed.hashtags);
          toast.success("Sugestão gerada!");
        } catch {
          setLegenda(raw); toast.success("Texto gerado");
        }
      } else { setLegenda(raw); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar");
    } finally {
      setAiLoading(false);
    }
  };

  const salvar = useMutation({
    mutationFn: async (status: "rascunho" | "agendado") => {
      if (!titulo.trim()) throw new Error("Título obrigatório");
      if (status === "agendado" && !data) throw new Error("Data de agendamento obrigatória");
      if (status === "agendado" && !imagem.trim()) throw new Error("Imagem obrigatória para agendar");
      const payload = {
        portfolio_id: portfolioId,
        titulo: titulo.trim(),
        conteudo: precisaLegenda ? legenda.trim() : "",
        legenda: precisaLegenda ? (legenda.trim() || null) : null,
        hashtags: precisaLegenda ? (hashtags.trim() || null) : null,
        plataformas: plataformas as any,
        tipo,
        status,
        data_agendada: data ? new Date(data).toISOString() : null,
        imagem_url: imagem.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("social_posts").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("social_posts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Post atualizado" : "Post criado");
      qc.invalidateQueries({ queryKey: ["social-posts", portfolioId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar post" : "Novo post"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as PostTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="post">Post (Feed)</SelectItem>
                  <SelectItem value="reels">Reels</SelectItem>
                  <SelectItem value="story">Story</SelectItem>
                  <SelectItem value="carrossel">Carrossel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data e horário</Label>
              <Input type="datetime-local" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Título interno *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Black Friday 50% off" />
          </div>

          {precisaLegenda && (
            <>
              <div className="flex items-center justify-between">
                <Label>Legenda *</Label>
                <Button type="button" size="sm" variant="outline" onClick={gerarIA} disabled={aiLoading} className="gap-1.5">
                  {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Gerar com IA
                </Button>
              </div>
              <Textarea rows={5} value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Conteúdo do post..." />

              <div>
                <Label>Hashtags</Label>
                <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#marketing #vendas" />
              </div>
            </>
          )}

          {tipo === "story" && (
            <div className="text-xs text-muted-foreground bg-muted/50 border rounded p-2">
              Stories usam apenas imagem. Não exige legenda nem hashtags.
            </div>
          )}

          <div>
            <Label className="mb-2 block">Plataformas</Label>
            <div className="grid grid-cols-2 gap-2">
              {PLATAFORMAS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent">
                  <Checkbox checked={plataformas.includes(p.key)} onCheckedChange={() => togglePlat(p.key)} />
                  <span className="text-sm">{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Imagem *</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            {!imagem ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading ? "Enviando..." : "Enviar imagem"}
              </Button>
            ) : (
              <div className="relative border rounded-md overflow-hidden">
                <img src={imagem} alt="" className="max-h-60 w-full object-contain bg-muted" />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => setImagem("")}
                >
                  <X size={14} />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-2 right-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  Trocar
                </Button>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => salvar.mutate("rascunho")} disabled={salvar.isPending}>
            Salvar rascunho
          </Button>
          <Button onClick={() => salvar.mutate("agendado")} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando..." : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
