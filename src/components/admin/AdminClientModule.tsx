import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type PortfolioOption = {
  id: string;
  name: string;
  servicos: string[];
};

export function AdminClientModule({
  service,
  storageKey,
  children,
}: {
  service: string;
  storageKey: string;
  children: (portfolioId: string) => ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(() => {
    try { return localStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  });

  const { data: portfolios = [], isLoading } = useQuery({
    queryKey: ["admin-module-portfolios", service],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolios")
        .select("id, name, servicos")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((portfolio) => ({
        id: portfolio.id,
        name: portfolio.name,
        servicos: Array.isArray(portfolio.servicos) ? portfolio.servicos as string[] : [],
      })) as PortfolioOption[];
    },
  });

  const available = useMemo(
    () => portfolios.filter((portfolio) => portfolio.servicos.includes(service)),
    [portfolios, service],
  );

  useEffect(() => {
    if (isLoading) return;
    if (available.some((portfolio) => portfolio.id === selectedId)) return;
    setSelectedId(available[0]?.id ?? "");
  }, [available, isLoading, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    try { localStorage.setItem(storageKey, selectedId); } catch {}
  }, [selectedId, storageKey]);

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (available.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Nenhum cliente possui este serviço.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Cliente</span>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="min-w-0 flex-1 sm:w-[280px] sm:flex-none">
            <SelectValue placeholder="Selecione o cliente" />
          </SelectTrigger>
          <SelectContent>
            {available.map((portfolio) => (
              <SelectItem key={portfolio.id} value={portfolio.id}>{portfolio.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedId && <div key={selectedId}>{children(selectedId)}</div>}
    </div>
  );
}