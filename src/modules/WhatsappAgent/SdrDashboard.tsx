import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Counters = {
  total: number;
  enviado: number;
  respondeu: number;
  reuniao_confirmada: number;
  aguardando_humano: number;
  rejeitou: number;
  ia_detectada: number;
  em_andamento: number;
  sem_resposta: number;
};

export function SdrDashboard({ counters }: { counters: Counters }) {
  const cards: { label: string; value: number; tone: string }[] = [
    { label: "Total na planilha", value: counters.total, tone: "" },
    { label: "Enviados", value: counters.enviado + counters.respondeu + counters.reuniao_confirmada + counters.aguardando_humano + counters.rejeitou + counters.ia_detectada + counters.sem_resposta, tone: "text-blue-400" },
    { label: "Responderam", value: counters.respondeu + counters.reuniao_confirmada + counters.aguardando_humano, tone: "text-cyan-400" },
    { label: "Reunião confirmada", value: counters.reuniao_confirmada, tone: "text-green-400" },
    { label: "Aguardando humano", value: counters.aguardando_humano, tone: "text-yellow-400" },
    { label: "Rejeitaram", value: counters.rejeitou, tone: "text-rose-400" },
    { label: "IA detectada", value: counters.ia_detectada, tone: "text-orange-400" },
    { label: "Em andamento", value: counters.em_andamento, tone: "text-purple-400" },
    { label: "Sem resposta", value: counters.sem_resposta, tone: "text-muted-foreground" },
  ];
  const total = counters.total || 1;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-3 space-y-2">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className={`text-2xl font-bold ${c.tone}`}>{c.value}</p>
          <Progress value={(c.value / total) * 100} className="h-1" />
        </Card>
      ))}
    </div>
  );
}
