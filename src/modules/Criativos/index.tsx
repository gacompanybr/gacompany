import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sparkles, Copy, Loader2, RefreshCw, ChevronDown } from "lucide-react";

type Historico = { id: string; ts: number; tipo: string; resultado: string };

const HIST_KEY = (pid: string) => `criativos-hist-${pid}`;

export default function CriativosModule({ portfolioId }: { portfolioId: string }) {
  const [tipo, setTipo] = useState("Anúncio Meta Ads");
  const [tom, setTom] = useState("Inspirador");
  const [objetivo, setObjetivo] = useState("Vender");
  const [produto, setProduto] = useState("");
  const [publico, setPublico] = useState("");
  const [diferencial, setDiferencial] = useState("");
  const [cta, setCta] = useState("");
  const [plataforma, setPlataforma] = useState("Instagram");

  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState("");
  const [historico, setHistorico] = useState<Historico[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIST_KEY(portfolioId));
      if (raw) setHistorico(JSON.parse(raw));
    } catch {}
  }, [portfolioId]);

  const saveHist = (h: Historico[]) => {
    setHistorico(h);
    try { localStorage.setItem(HIST_KEY(portfolioId), JSON.stringify(h)); } catch {}
  };

  const gerar = async (variacao = false) => {
    if (!produto.trim()) { toast.error("Descreva o produto/serviço"); return; }
    setLoading(true); setResultado("");
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          systemPrompt: "Você é um copywriter sênior brasileiro especializado em marketing digital de alta conversão. Use linguagem clara, persuasiva e adaptada à plataforma. Sempre estruture a resposta em seções bem marcadas.",
          userPrompt: `Crie um criativo de ${tipo} para ${plataforma}.

Produto/Serviço: ${produto}
Público-alvo: ${publico || "geral"}
Tom: ${tom}
Objetivo: ${objetivo}
Diferencial/Oferta: ${diferencial || "não informado"}
Call-to-action desejado: ${cta || "livre"}
${variacao ? "\nGere uma VARIAÇÃO ALTERNATIVA, com abordagem diferente da anterior." : ""}

Estruture a resposta exatamente assim:

## HEADLINE
(uma chamada principal forte, máximo 10 palavras)

## TEXTO PRIMÁRIO
(corpo do anúncio, 3-6 linhas, persuasivo)

## CTA
(call-to-action curto e direto)

## HASHTAGS
(8-12 hashtags relevantes, se aplicável)

## DESCRIÇÃO CURTA
(2 linhas para Google Ads/descrição alternativa)`,
          temperature: 0.9,
          maxTokens: 900,
        },
      });
      if (error) throw error;
      const out = data?.content ?? "(sem resposta)";
      setResultado(out);
      const novo: Historico = { id: crypto.randomUUID(), ts: Date.now(), tipo, resultado: out };
      saveHist([novo, ...historico].slice(0, 5));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar");
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  const sections = parseSections(resultado);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Criativos & Copy</h2>
        <p className="text-sm text-muted-foreground">Geração de criativos com IA.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Configurações */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold">Configurações</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Anúncio Meta Ads", "Post Orgânico", "Story", "Copy Google Ads", "Email Marketing", "Roteiro de Reels"].map((x) => (
                      <SelectItem key={x} value={x}>{x}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tom</Label>
                <Select value={tom} onValueChange={setTom}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Urgente", "Inspirador", "Educativo", "Divertido", "Profissional", "Emocional"].map((x) => (
                      <SelectItem key={x} value={x}>{x}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Objetivo</Label>
                <Select value={objetivo} onValueChange={setObjetivo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Vender", "Gerar leads", "Aumentar seguidores", "Engajamento", "Reconhecimento de marca"].map((x) => (
                      <SelectItem key={x} value={x}>{x}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plataforma</Label>
                <Select value={plataforma} onValueChange={setPlataforma}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Instagram", "Facebook", "Google", "TikTok", "Email", "LinkedIn"].map((x) => (
                      <SelectItem key={x} value={x}>{x}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Produto / Serviço *</Label>
              <Textarea rows={2} value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="O que está anunciando?" />
            </div>
            <div>
              <Label>Público-alvo</Label>
              <Textarea rows={2} value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Quem deve ver esse anúncio?" />
            </div>
            <div>
              <Label>Diferencial / Oferta</Label>
              <Input value={diferencial} onChange={(e) => setDiferencial(e.target.value)} placeholder="Ex: 50% off só hoje" />
            </div>
            <div>
              <Label>CTA desejado</Label>
              <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex: Agende sua aula grátis" />
            </div>

            <Button onClick={() => gerar(false)} disabled={loading} className="w-full gap-2" size="lg">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Gerar com IA
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              💡 Cada geração consome ~500-800 tokens. Custo mínimo.
            </p>
          </CardContent>
        </Card>

        {/* Resultado */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Resultado</h3>
              {resultado && (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => copy(resultado)} className="gap-1 h-7">
                    <Copy size={12} /> Copiar tudo
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => gerar(true)} disabled={loading} className="gap-1 h-7">
                    <RefreshCw size={12} /> Variação
                  </Button>
                </div>
              )}
            </div>

            {loading && (
              <div className="space-y-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-20" />
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-12" />
              </div>
            )}

            {!loading && !resultado && (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Configure ao lado e clique em "Gerar com IA" para criar seu criativo.
              </div>
            )}

            {!loading && resultado && (
              <div className="space-y-3">
                {sections.map((s, i) => (
                  <div key={i} className="border rounded p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <Badge variant="secondary" className="text-[10px]">{s.title}</Badge>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(s.body)}>
                        <Copy size={12} />
                      </Button>
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{s.body}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {historico.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2">Histórico ({historico.length})</h3>
          <div className="space-y-2">
            {historico.map((h) => (
              <Collapsible key={h.id}>
                <Card>
                  <CollapsibleTrigger className="w-full">
                    <div className="p-3 flex items-center justify-between">
                      <div className="text-left">
                        <div className="text-sm font-medium">{h.tipo}</div>
                        <div className="text-xs text-muted-foreground">{new Date(h.ts).toLocaleString("pt-BR")}</div>
                      </div>
                      <ChevronDown size={14} className="text-muted-foreground" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-3 pt-0 border-t">
                      <pre className="text-xs whitespace-pre-wrap font-sans">{h.resultado}</pre>
                      <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => copy(h.resultado)}>
                        <Copy size={12} /> Copiar
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function parseSections(text: string): { title: string; body: string }[] {
  if (!text) return [];
  const parts = text.split(/^##\s+/m).filter(Boolean);
  if (parts.length === 0) return [{ title: "Resultado", body: text }];
  return parts.map((p) => {
    const [first, ...rest] = p.split("\n");
    return { title: first.trim(), body: rest.join("\n").trim() };
  });
}
