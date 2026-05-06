import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Check, AlertCircle } from "lucide-react";
import { BRL } from "@/lib/financeiro";

export type ParticipantInput = {
  user_id: string;
  percentual: number;
};

type Profile = { user_id: string; display_name: string | null };

export function ParticipantesEditor({
  participants, onChange, valorTotal,
}: {
  participants: ParticipantInput[];
  onChange: (p: ParticipantInput[]) => void;
  valorTotal: number;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("user_id, display_name")
      .order("display_name")
      .then(({ data }) => setProfiles(data ?? []));
  }, []);

  const total = participants.reduce((s, p) => s + (Number(p.percentual) || 0), 0);
  const ok = Math.abs(total - 100) < 0.01;

  function update(idx: number, patch: Partial<ParticipantInput>) {
    onChange(participants.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function remove(idx: number) {
    onChange(participants.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...participants, { user_id: "", percentual: 0 }]);
  }

  // user_ids já selecionados (para evitar duplicado)
  const used = new Set(participants.map((p) => p.user_id).filter(Boolean));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Participantes e rateio</Label>
        <span
          className={`text-xs flex items-center gap-1 font-medium ${
            ok ? "text-green-400" : "text-red-400"
          }`}
        >
          {ok ? <Check size={12} /> : <AlertCircle size={12} />}
          Total: {total.toFixed(2)}% {ok ? "✓" : `(falta ${(100 - total).toFixed(2)}%)`}
        </span>
      </div>

      <div className="space-y-2">
        {participants.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded">
            Nenhum participante. Adicione ao menos um.
          </p>
        )}
        {participants.map((p, idx) => {
          const valor = (valorTotal * (p.percentual || 0)) / 100;
          return (
            <div key={idx} className="flex gap-2 items-end">
              <div className="flex-1">
                <Select
                  value={p.user_id || undefined}
                  onValueChange={(v) => update(idx, { user_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles
                      .filter((pr) => pr.user_id === p.user_id || !used.has(pr.user_id))
                      .map((pr) => (
                        <SelectItem key={pr.user_id} value={pr.user_id}>
                          {pr.display_name ?? pr.user_id.slice(0, 8)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={p.percentual}
                  onChange={(e) =>
                    update(idx, { percentual: Number(e.target.value) || 0 })
                  }
                  placeholder="%"
                />
              </div>
              <div className="w-28 text-xs text-muted-foreground pb-2 text-right">
                {BRL(valor)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(idx)}
              >
                <Trash2 size={14} className="text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1">
        <Plus size={14} /> Adicionar participante
      </Button>
    </div>
  );
}
