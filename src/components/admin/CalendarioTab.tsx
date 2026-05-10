import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, MessageSquare } from "lucide-react";

type Evento = {
  id: string;
  date: string; // YYYY-MM-DD
  titulo: string;
  tipo: "recebimento" | "post";
  valor?: number;
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function CalendarioTab() {
  const [selected, setSelected] = useState<Date>(new Date());
  const [month, setMonth] = useState<Date>(new Date());

  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ["admin-calendario", month.getFullYear(), month.getMonth()],
    queryFn: async (): Promise<Evento[]> => {
      const first = fmtDate(new Date(month.getFullYear(), month.getMonth(), 1));
      const last = fmtDate(new Date(month.getFullYear(), month.getMonth() + 1, 0));

      const [recRes, postRes] = await Promise.all([
        supabase
          .from("financial_receivables")
          .select("id, data_prevista, valor_previsto, financial_services(nome)")
          .gte("data_prevista", first)
          .lte("data_prevista", last),
        supabase
          .from("social_posts")
          .select("id, titulo, data_agendada")
          .not("data_agendada", "is", null)
          .gte("data_agendada", `${first}T00:00:00`)
          .lte("data_agendada", `${last}T23:59:59`),
      ]);

      const recEvents: Evento[] = (recRes.data ?? []).map((r: any) => ({
        id: `r-${r.id}`,
        date: r.data_prevista,
        titulo: r.financial_services?.nome ?? "Recebimento",
        tipo: "recebimento",
        valor: Number(r.valor_previsto ?? 0),
      }));
      const postEvents: Evento[] = (postRes.data ?? []).map((p: any) => ({
        id: `p-${p.id}`,
        date: (p.data_agendada as string).slice(0, 10),
        titulo: p.titulo,
        tipo: "post",
      }));
      return [...recEvents, ...postEvents];
    },
  });

  const eventosByDate = useMemo(() => {
    const map = new Map<string, Evento[]>();
    for (const e of eventos) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [eventos]);

  const eventosDia = eventosByDate.get(fmtDate(selected)) ?? [];

  const modifiers = {
    recebimento: eventos.filter((e) => e.tipo === "recebimento").map((e) => new Date(`${e.date}T12:00:00`)),
    post: eventos.filter((e) => e.tipo === "post").map((e) => new Date(`${e.date}T12:00:00`)),
  };

  return (
    <div className="grid lg:grid-cols-[auto,1fr] gap-4">
      <Card className="p-3">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => d && setSelected(d)}
          month={month}
          onMonthChange={setMonth}
          modifiers={modifiers}
          modifiersClassNames={{
            recebimento: "bg-primary/20 text-primary font-semibold",
            post: "ring-2 ring-blue-500/50",
          }}
        />
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-primary/20 border border-primary" /> Recebimento</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded ring-2 ring-blue-500/50" /> Post agendado</div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            {selected.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </h3>
          <Badge variant="secondary">{eventosDia.length} evento(s)</Badge>
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        ) : eventosDia.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhum evento neste dia.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {eventosDia.map((e) => (
              <li key={e.id} className="py-2 flex items-center gap-3">
                {e.tipo === "recebimento" ? (
                  <Wallet size={16} className="text-primary" />
                ) : (
                  <MessageSquare size={16} className="text-blue-500" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.titulo}</p>
                  <p className="text-xs text-muted-foreground capitalize">{e.tipo}</p>
                </div>
                {e.valor != null && (
                  <span className="text-sm font-semibold">{brl(e.valor)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
