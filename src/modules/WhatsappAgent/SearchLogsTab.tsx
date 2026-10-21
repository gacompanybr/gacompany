import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, SearchX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SearchLog = {
  id: string;
  telefone: string | null;
  consulta: string;
  consulta_normalizada: string | null;
  camada: string | null;
  total_encontrado: number;
  retornados: number;
  created_at: string;
};

const CAMADA_LABEL: Record<string, string> = {
  and: "todas as palavras",
  equivalencias: "sinônimos",
  token_raro: "palavra mais rara",
  ou: "qualquer palavra",
};

export function SearchLogsTab({ portfolioId }: { portfolioId: string }) {
  const { data: logs, isLoading, error } = useQuery({
    queryKey: ["catalog-search-logs", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_search_logs")
        .select("id, telefone, consulta, consulta_normalizada, camada, total_encontrado, retornados, created_at")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as SearchLog[];
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return <p className="text-sm text-destructive" role="alert">Não foi possível carregar as buscas: {error.message}</p>;
  }
  if (!logs?.length) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Nenhuma busca registrada ainda. As pesquisas de produtos feitas pelo agente aparecem aqui.
      </Card>
    );
  }

  const zeros = logs.filter((l) => l.total_encontrado === 0).length;

  return (
    <div className="space-y-3">
      <Card className="p-4 flex flex-wrap items-center gap-3 text-sm">
        <span><strong>{logs.length}</strong> últimas buscas</span>
        {zeros > 0 && (
          <Badge variant="destructive" className="gap-1">
            <SearchX size={12} /> {zeros} sem resultado
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">Use as buscas sem resultado para ensinar novos sinônimos ao catálogo.</span>
      </Card>

      <div className="space-y-2">
        {logs.map((log) => (
          <Card
            key={log.id}
            className={`p-3 text-sm ${log.total_encontrado === 0 ? "border-destructive/50 bg-destructive/5" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-all">"{log.consulta}"</span>
              {log.total_encontrado === 0 ? (
                <Badge variant="destructive">0 resultados</Badge>
              ) : (
                <Badge variant="secondary">{log.total_encontrado} encontrado{log.total_encontrado === 1 ? "" : "s"}</Badge>
              )}
              {log.camada && (
                <span className="text-xs text-muted-foreground">via {CAMADA_LABEL[log.camada] ?? log.camada}</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
              <span>{new Date(log.created_at).toLocaleString("pt-BR")}</span>
              {log.telefone && <span>Cliente: {log.telefone}</span>}
              {log.consulta_normalizada && log.consulta_normalizada !== log.consulta && (
                <span>Normalizada: {log.consulta_normalizada}</span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
