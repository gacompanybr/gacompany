import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Info, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TOM_OPTIONS, DIAS, type WhatsappAgent } from "./types";
import { ReportGroupCard } from "./ReportGroupCard";

export function ConfigTab({
  agent, onChange,
}: { agent: WhatsappAgent; onChange: (patch: Partial<WhatsappAgent>) => void }) {
  const [testingCatalog, setTestingCatalog] = useState(false);
  const [catalogResult, setCatalogResult] = useState<{ total: number; categorias: string[] } | null>(null);
  const [catalogError, setCatalogError] = useState("");

  async function testCatalog() {
    const catalogoUrl = agent.catalogo_url?.trim();
    if (!catalogoUrl) {
      setCatalogResult(null);
      setCatalogError("Informe o link da planilha.");
      return;
    }
    setTestingCatalog(true);
    setCatalogResult(null);
    setCatalogError("");
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-catalog-test", {
        body: { portfolioId: agent.portfolio_id, catalogoUrl },
      });
      if (error || data?.error) {
        const details = error && "context" in error && error.context instanceof Response
          ? await error.context.clone().json().catch(() => null)
          : null;
        setCatalogError(data?.error ?? details?.error ?? error?.message ?? "Não foi possível testar a planilha.");
        return;
      }
      setCatalogResult({ total: Number(data.total ?? 0), categorias: Array.isArray(data.categorias) ? data.categorias : [] });
    } finally {
      setTestingCatalog(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <h3 className="font-semibold">Identidade do Agente</h3>
        <div>
          <Label>Nome do atendente</Label>
          <Input
            value={agent.nome_atendente}
            onChange={(e) => onChange({ nome_atendente: e.target.value })}
            placeholder="Ex: Maria - Atendimento Vila Gym"
          />
        </div>
        <div>
          <Label>Tom de voz</Label>
          <Select value={agent.tom_de_voz} onValueChange={(v) => onChange({ tom_de_voz: v as WhatsappAgent["tom_de_voz"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TOM_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Instruções base</Label>
          <Textarea
            rows={5}
            value={agent.instrucoes_base ?? ""}
            onChange={(e) => onChange({ instrucoes_base: e.target.value })}
            placeholder="Você é a Maria, atendente da Vila Gym. Responda perguntas sobre planos, horários e aulas. Não fale sobre preços de concorrentes..."
          />
        </div>
        <div>
          <Label>Mensagem de boas-vindas</Label>
          <Textarea
            rows={2}
            value={agent.mensagem_boas_vindas ?? ""}
            onChange={(e) => onChange({ mensagem_boas_vindas: e.target.value })}
          />
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div>
          <Label htmlFor="catalogo-url">Planilha de produtos (link do Google Sheets)</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Compartilhe a planilha como 'Qualquer pessoa com o link: Leitor'. Colunas: codigo, categoria, nome, marca, especificacoes, preco, unidade, estoque.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="catalogo-url"
            type="url"
            value={agent.catalogo_url ?? ""}
            onChange={(event) => {
              onChange({ catalogo_url: event.target.value || null });
              setCatalogResult(null);
              setCatalogError("");
            }}
            placeholder="https://docs.google.com/spreadsheets/d/..."
          />
          <Button type="button" variant="outline" className="shrink-0 gap-2" onClick={testCatalog} disabled={testingCatalog}>
            {testingCatalog && <Loader2 className="animate-spin" size={14} />}
            Testar planilha
          </Button>
        </div>
        {catalogResult && (
          <div className="flex items-start gap-2 text-sm text-foreground" role="status">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary" />
            <p>
              {catalogResult.total} produto{catalogResult.total === 1 ? "" : "s"}. Categorias: {catalogResult.categorias.join(", ") || "nenhuma"}.
            </p>
          </div>
        )}
        {catalogError && <p className="text-sm text-destructive" role="alert">{catalogError}</p>}
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold">Horários de Atendimento</h3>
        <div className="space-y-2">
          {DIAS.map((d) => {
            const cfg = agent.horarios_por_dia?.[d.value] ?? { enabled: false, inicio: "08:00", fim: "18:00" };
            const setCfg = (p: Partial<typeof cfg>) =>
              onChange({
                horarios_por_dia: {
                  ...(agent.horarios_por_dia ?? {}),
                  [d.value]: { ...cfg, ...p },
                },
              });
            return (
              <div key={d.value} className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer w-20 shrink-0">
                  <Checkbox
                    checked={!!cfg.enabled}
                    onCheckedChange={(v) => setCfg({ enabled: !!v })}
                  />
                  {d.label}
                </label>
                <Input
                  type="time"
                  className="max-w-[130px]"
                  disabled={!cfg.enabled}
                  value={cfg.inicio ?? ""}
                  onChange={(e) => setCfg({ inicio: e.target.value })}
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Input
                  type="time"
                  className="max-w-[130px]"
                  disabled={!cfg.enabled}
                  value={cfg.fim ?? ""}
                  onChange={(e) => setCfg({ fim: e.target.value })}
                />
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Fora do horário configurado o robô fica invisível e não envia mensagens automáticas.
        </p>
      </Card>


      <Card className="p-5 space-y-4">
        <h3 className="font-semibold">Modelo de IA</h3>
        <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/30 rounded p-3 text-xs">
          <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
          <p>
            Recomendamos o <strong>Google Gemini</strong> via Lovable AI — gratuito com generosa cota mensal incluída.
          </p>
        </div>
        <div>
          <Label>Modelo</Label>
          <Select value={agent.modelo_ia} onValueChange={(v) => onChange({ modelo_ia: v as WhatsappAgent["modelo_ia"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Google Gemini Flash (rápido e econômico - recomendado)</SelectItem>
              <SelectItem value="openai">OpenAI GPT-5 Mini (pago)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label>Temperatura</Label>
            <span className="text-xs text-muted-foreground">{agent.temperatura.toFixed(1)}</span>
          </div>
          <Slider
            value={[agent.temperatura]}
            min={0} max={1} step={0.1}
            onValueChange={([v]) => onChange({ temperatura: v })}
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Mais baixo = respostas mais previsíveis. Mais alto = mais criativas.
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label>Tamanho máximo da resposta</Label>
            <span className="text-xs text-muted-foreground">{agent.max_tokens ?? 1200} tokens</span>
          </div>
          <Slider
            value={[agent.max_tokens ?? 1200]}
            min={500} max={3000} step={100}
            onValueChange={([v]) => onChange({ max_tokens: v })}
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Modelos de raciocínio (Gemini Pro) consomem parte deste orçamento "pensando" antes de escrever.
            Valores baixos podem cortar a resposta no meio. Recomendado: 1200-2000.
          </p>
        </div>

      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Follow-up automático</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Envia até 2 mensagens de retomada quando o contato para de responder.
              Ative só para clientes que querem isso no número deles.
            </p>
          </div>
          <Switch
            checked={!!agent.followup_enabled}
            onCheckedChange={(v) => onChange({ followup_enabled: v })}
          />
        </div>
      </Card>

      <ReportGroupCard agent={agent} onChange={onChange} />
    </div>
  );
}

