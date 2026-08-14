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
import { Sparkles, Loader2, Upload, X, GripVertical, ChevronLeft, ChevronRight } from "lucide-react";
import {
  PLATAFORMAS, ASPECT_RATIOS, MAX_CARROSSEL,
  type AspectRatio, type Plataforma, type PostTipo, type SocialPost,
} from "./types";

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

const isVideo = (url: string) => /\.(mp4|mov|m4v)(\?|$)/i.test(url);

export function PostDialog({ portfolioId, open, onOpenChange, initialDate, editing }: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [titulo, setTitulo] = useState("");
  const [legenda, setLegenda] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [plataformas, setPlataformas] = useState<Plataforma[]>([]);
  const [tipo, setTipo] = useState<PostTipo>("post");
  const [data, setData] = useState("");
  const [imagens, setImagens] = useState<string[]>([]);
  const [aspect, setAspect] = useState<AspectRatio>("1:1");
  const [aiLoading, setAiLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  const precisaLegenda = TIPO_PRECISA_LEGENDA[tipo];
  const isCarrossel = tipo === "carrossel";
  const maxFiles = isCarrossel ? MAX_CARROSSEL : 1;
  const aspectCss = ASPECT_RATIOS.find((a) => a.key === aspect)?.css ?? "1 / 1";

  useEffect(() => {
    if (!open) return;
    setPreviewIndex(0);
    if (editing) {
      setTitulo(editing.titulo);
      setLegenda(editing.legenda ?? editing.conteudo ?? "");
      setHashtags(editing.hashtags ?? "");
      setPlataformas(editing.plataformas ?? []);
      setTipo(editing.tipo);
      setData(editing.data_agendada ? new Date(editing.data_agendada).toISOString().slice(0, 16) : "");
      const lista = Array.isArray(editing.imagens_urls) ? editing.imagens_urls.filter(Boolean) : [];
      setImagens(lista.length ? lista : editing.imagem_url ? [editing.imagem_url] : []);
      setAspect((editing.aspect_ratio as AspectRatio) ?? "1:1");
    } else {
      setTitulo(""); setLegenda(""); setHashtags(""); setPlataformas([]); setTipo("post");
      setImagens([]); setAspect("1:1");
      setData(initialDate ? new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
    }
  }, [open, editing, initialDate]);

  // Ao trocar de tipo, mantém só a primeira mídia se não for carrossel
  useEffect(() => {
    if (!isCarrossel) setImagens((prev) => prev.slice(0, 1));
    setPreviewIndex(0);
  }, [isCarrossel]);

  const togglePlat = (p: Plataforma) =>
    setPlataformas((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const uploadOne = async (file: File) => {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${portfolioId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("social-media").upload(path, file, {
      cacheControl: "3600", upsert: false,
    });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("social-media").getPublicUrl(path);
    return pub.publicUrl;
  };

  const handleUpload = async (files: File[]) => {
    const livres = maxFiles - imagens.length;
    if (livres <= 0) {
      toast.error(isCarrossel ? `Máximo de ${MAX_CARROSSEL} imagens` : "Remova a mídia atual antes");
      return;
    }
    const alvo = files.slice(0, livres);
    if (files.length > livres) toast.warning(`Só ${livres} arquivo(s) foram aceitos (limite ${maxFiles}).`);
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of alvo) urls.push(await uploadOne(f));
      setImagens((prev) => [...prev, ...urls].slice(0, maxFiles));
      toast.success(urls.length > 1 ? `${urls.length} imagens enviadas` : "Mídia enviada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  };

  const removerImagem = (idx: number) => {
    setImagens((prev) => prev.filter((_, i) => i !== idx));
    setPreviewIndex(0);
  };

  const moverImagem = (from: number, to: number) => {
    if (to < 0 || to >= imagens.length || from === to) return;
    setImagens((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
    setPreviewIndex(to);
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
      if (status === "agendado" && imagens.length === 0) throw new Error("Mídia obrigatória para agendar");
      if (status === "agendado" && isCarrossel && imagens.length < 2) {
        throw new Error("Carrossel precisa de pelo menos 2 imagens");
      }
      let dataAgendadaIso: string | null = null;
      if (data) {
        const parsed = new Date(data);
        if (isNaN(parsed.getTime())) throw new Error("Data inválida. Use o seletor para escolher dia e horário.");
        dataAgendadaIso = parsed.toISOString();
      }
      const payload = {
        portfolio_id: portfolioId,
        titulo: titulo.trim(),
        conteudo: precisaLegenda ? legenda.trim() : "",
        legenda: precisaLegenda ? (legenda.trim() || null) : null,
        hashtags: precisaLegenda ? (hashtags.trim() || null) : null,
        plataformas: plataformas as any,
        tipo,
        status,
        data_agendada: dataAgendadaIso,
        imagem_url: imagens[0] ?? null,
        imagens_urls: imagens as any,
        aspect_ratio: aspect,
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

  const previewUrl = imagens[Math.min(previewIndex, Math.max(imagens.length - 1, 0))];

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Formato da pré-visualização</Label>
              <Select value={aspect} onValueChange={(v) => setAspect(v as AspectRatio)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIOS.map((a) => (
                    <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>
              {tipo === "reels" ? "Vídeo *"
                : tipo === "story" ? "Imagem ou vídeo *"
                : isCarrossel ? `Imagens do carrossel * (${imagens.length}/${MAX_CARROSSEL})`
                : "Imagem *"}
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              multiple={isCarrossel}
              accept={tipo === "reels" ? "video/mp4,video/quicktime" : tipo === "story" ? "image/*,video/mp4,video/quicktime" : "image/*"}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) handleUpload(files);
                e.target.value = "";
              }}
            />

            {imagens.length < maxFiles && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading ? "Enviando..."
                  : isCarrossel ? "Adicionar imagens (até 10)"
                  : tipo === "reels" ? "Enviar vídeo" : "Enviar arquivo"}
              </Button>
            )}

            {isCarrossel && imagens.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Arraste as imagens para mudar a ordem da postagem.
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {imagens.map((url, idx) => (
                    <div
                      key={`${url}-${idx}`}
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIndex !== null) moverImagem(dragIndex, idx);
                        setDragIndex(null);
                      }}
                      onDragEnd={() => setDragIndex(null)}
                      onClick={() => setPreviewIndex(idx)}
                      className={`relative rounded-md overflow-hidden border cursor-grab bg-muted ${
                        previewIndex === idx ? "ring-2 ring-primary" : ""
                      } ${dragIndex === idx ? "opacity-50" : ""}`}
                      style={{ aspectRatio: aspectCss }}
                    >
                      <img src={url} alt={`Imagem ${idx + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute top-1 left-1 text-[10px] px-1 rounded bg-background/80">
                        {idx + 1}
                      </span>
                      <GripVertical size={12} className="absolute bottom-1 left-1 text-background drop-shadow" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removerImagem(idx); }}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {imagens.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">
                  Pré-visualização {isCarrossel ? `(${previewIndex + 1}/${imagens.length})` : ""} — como aparece no Instagram
                </p>
                <div className="relative mx-auto max-w-sm border rounded-md overflow-hidden bg-muted" style={{ aspectRatio: aspectCss }}>
                  {isVideo(previewUrl) ? (
                    <video src={previewUrl} controls className="w-full h-full object-cover" />
                  ) : (
                    <img src={previewUrl} alt="Pré-visualização" className="w-full h-full object-cover" />
                  )}
                  {isCarrossel && imagens.length > 1 && (
                    <>
                      <Button
                        type="button" size="icon" variant="secondary"
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setPreviewIndex((i) => (i - 1 + imagens.length) % imagens.length)}
                      >
                        <ChevronLeft size={14} />
                      </Button>
                      <Button
                        type="button" size="icon" variant="secondary"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setPreviewIndex((i) => (i + 1) % imagens.length)}
                      >
                        <ChevronRight size={14} />
                      </Button>
                    </>
                  )}
                  {!isCarrossel && (
                    <Button
                      type="button" size="icon" variant="destructive"
                      className="absolute top-2 right-2 h-7 w-7"
                      onClick={() => removerImagem(0)}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
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
