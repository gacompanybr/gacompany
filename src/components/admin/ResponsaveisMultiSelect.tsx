import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Check, X, Search } from "lucide-react";

type UserRow = { user_id: string; display_name: string | null };

export function ResponsaveisMultiSelect({
  value, onChange,
}: { value: string[]; onChange: (ids: string[]) => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      // Apenas usuários com papel "admin" podem ser responsáveis
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = [...new Set((roles ?? []).map((r: any) => r.user_id))];
      if (adminIds.length === 0) {
        setUsers([]);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", adminIds)
        .order("display_name");
      setUsers(data ?? []);
    })();
  }, []);

  const userMap = useMemo(() => new Map(users.map((u) => [u.user_id, u])), [users]);
  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    if (!term) return users.filter((u) => !value.includes(u.user_id)).slice(0, 50);
    return users.filter((u) =>
      !value.includes(u.user_id) &&
      (u.display_name ?? "").toLowerCase().includes(term),
    ).slice(0, 50);
  }, [users, q, value]);

  function add(id: string) {
    if (!value.includes(id)) onChange([...value, id]);
    setQ("");
  }
  function remove(id: string) {
    onChange(value.filter((x) => x !== id));
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1">
              {userMap.get(id)?.display_name ?? id.slice(0, 8)}
              <button type="button" onClick={() => remove(id)} className="ml-1 hover:text-destructive">
                <X size={12} />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
        <Input
          placeholder="Buscar usuário por nome/email..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
      {q && (
        <Card className="max-h-48 overflow-auto p-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">Nenhum usuário encontrado.</p>
          )}
          {filtered.map((u) => (
            <button
              type="button"
              key={u.user_id}
              onClick={() => add(u.user_id)}
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted flex items-center justify-between"
            >
              <span>{u.display_name ?? u.user_id.slice(0, 8)}</span>
              <Check size={12} className="text-muted-foreground" />
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
