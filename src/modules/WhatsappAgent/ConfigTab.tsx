import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";
import { TOM_OPTIONS, DIAS, type WhatsappAgent } from "./types";
import { ReportGroupCard } from "./ReportGroupCard";

export function ConfigTab({
  agent, onChange,
}: { agent: WhatsappAgent; onChange: (patch: Partial<WhatsappAgent>) => void }) {
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
          <Select value={agent.tom_de_voz} onValueChange={(v) => onChange({ tom_de_voz: v as any })}>
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

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold">Horários de Atendimento</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Início</Label>
            <Input type="time" value={agent.horario_inicio ?? ""} onChange={(e) => onChange({ horario_inicio: e.target.value })} />
          </div>
          <div>
            <Label>Fim</Label>
            <Input type="time" value={agent.horario_fim ?? ""} onChange={(e) => onChange({ horario_fim: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Dias da semana</Label>
          <div className="flex flex-wrap gap-3 mt-2">
            {DIAS.map((d) => (
              <label key={d.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox
                  checked={agent.dias_semana.includes(d.value)}
                  onCheckedChange={(v) => {
                    const next = v
                      ? [...agent.dias_semana, d.value]
                      : agent.dias_semana.filter((x) => x !== d.value);
                    onChange({ dias_semana: next });
                  }}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>Mensagem fora do horário</Label>
          <Textarea
            rows={2}
            value={agent.fora_horario_msg ?? ""}
            onChange={(e) => onChange({ fora_horario_msg: e.target.value })}
          />
        </div>
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
          <Select value={agent.modelo_ia} onValueChange={(v) => onChange({ modelo_ia: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Google Gemini (gratuito - recomendado)</SelectItem>
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
      </Card>

      <ReportGroupCard agent={agent} onChange={onChange} />
    </div>
  );
}

