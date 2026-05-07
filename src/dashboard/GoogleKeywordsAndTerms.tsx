import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (n: number) => n.toLocaleString("pt-BR");

type Props = { campaignIds: string[]; start: string; end: string };

type KwAgg = {
  keyword: string;
  matchType: string | null;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
};
type StAgg = {
  term: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
};

export function GoogleKeywordsAndTerms({ campaignIds, start, end }: Props) {
  const enabled = campaignIds.length > 0 && !!start && !!end;

  const { data: keywords = [] } = useQuery({
    queryKey: ["google-keywords", campaignIds, start, end],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("campaign_keywords")
        .select("keyword_text, match_type, clicks, impressions, cost, conversions")
        .in("campaign_id", campaignIds)
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
      const map = new Map<string, KwAgg>();
      for (const r of data ?? []) {
        const key = `${r.keyword_text}::${r.match_type ?? ""}`;
        const cur = map.get(key) ?? {
          keyword: r.keyword_text,
          matchType: r.match_type,
          clicks: 0,
          impressions: 0,
          cost: 0,
          conversions: 0,
        };
        cur.clicks += Number(r.clicks ?? 0);
        cur.impressions += Number(r.impressions ?? 0);
        cur.cost += Number(r.cost ?? 0);
        cur.conversions += Number(r.conversions ?? 0);
        map.set(key, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
    },
  });

  const { data: terms = [] } = useQuery({
    queryKey: ["google-search-terms", campaignIds, start, end],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("campaign_search_terms")
        .select("search_term, clicks, impressions, cost, conversions")
        .in("campaign_id", campaignIds)
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
      const map = new Map<string, StAgg>();
      for (const r of data ?? []) {
        const cur = map.get(r.search_term) ?? {
          term: r.search_term,
          clicks: 0,
          impressions: 0,
          cost: 0,
          conversions: 0,
        };
        cur.clicks += Number(r.clicks ?? 0);
        cur.impressions += Number(r.impressions ?? 0);
        cur.cost += Number(r.cost ?? 0);
        cur.conversions += Number(r.conversions ?? 0);
        map.set(r.search_term, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.clicks - a.clicks);
    },
  });

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Palavras-chave</h3>
          <Badge variant="secondary">{keywords.length}</Badge>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
              <th className="py-2 pr-3">Palavra-chave</th>
              <th className="py-2 pr-3">Match</th>
              <th className="py-2 pr-3 text-right">Impr.</th>
              <th className="py-2 pr-3 text-right">Cliques</th>
              <th className="py-2 pr-3 text-right">CTR</th>
              <th className="py-2 pr-3 text-right">CPC</th>
              <th className="py-2 pr-3 text-right">Conv.</th>
              <th className="py-2 text-right">Custo</th>
            </tr>
          </thead>
          <tbody>
            {keywords.slice(0, 50).map((k) => {
              const ctr = k.impressions > 0 ? (k.clicks / k.impressions) * 100 : 0;
              const cpc = k.clicks > 0 ? k.cost / k.clicks : 0;
              return (
                <tr key={`${k.keyword}-${k.matchType}`} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-3 font-medium truncate max-w-[200px]">{k.keyword}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{k.matchType ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">{fmtNum(k.impressions)}</td>
                  <td className="py-2 pr-3 text-right">{fmtNum(k.clicks)}</td>
                  <td className="py-2 pr-3 text-right">{ctr.toFixed(2)}%</td>
                  <td className="py-2 pr-3 text-right">{cpc > 0 ? fmtBRL(cpc) : "—"}</td>
                  <td className="py-2 pr-3 text-right">{fmtNum(k.conversions)}</td>
                  <td className="py-2 text-right">{fmtBRL(k.cost)}</td>
                </tr>
              );
            })}
            {!keywords.length && (
              <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sem dados de palavras-chave no período.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="p-5 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Termos de pesquisa</h3>
          <Badge variant="secondary">{terms.length}</Badge>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
              <th className="py-2 pr-3">Termo</th>
              <th className="py-2 pr-3 text-right">Impr.</th>
              <th className="py-2 pr-3 text-right">Cliques</th>
              <th className="py-2 pr-3 text-right">Conv.</th>
              <th className="py-2 text-right">Custo</th>
            </tr>
          </thead>
          <tbody>
            {terms.slice(0, 50).map((t) => (
              <tr key={t.term} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-3 font-medium truncate max-w-[260px]">{t.term}</td>
                <td className="py-2 pr-3 text-right">{fmtNum(t.impressions)}</td>
                <td className="py-2 pr-3 text-right">{fmtNum(t.clicks)}</td>
                <td className="py-2 pr-3 text-right">{fmtNum(t.conversions)}</td>
                <td className="py-2 text-right">{fmtBRL(t.cost)}</td>
              </tr>
            ))}
            {!terms.length && (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Sem termos de pesquisa no período.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
