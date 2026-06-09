import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Plus, Instagram, Facebook, Linkedin, Music2, Send, Loader2, AlertCircle } from "lucide-react";
import { PostDialog } from "./PostDialog";
import { ConectarMetaCard } from "./ConectarMetaCard";
import { PLATAFORMAS, STATUS_COLOR, type Plataforma, type PostStatus, type SocialPost } from "./types";


const PLAT_ICON: Record<Plataforma, any> = {
  instagram: Instagram, facebook: Facebook, tiktok: Music2, linkedin: Linkedin,
};

export default function SocialMediaModule({ portfolioId }: { portfolioId: string }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SocialPost | null>(null);
  const [filtroPlat, setFiltroPlat] = useState<Plataforma[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<PostStatus | "all">("all");

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["social-posts", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_posts")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("data_agendada", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SocialPost[];
    },
  });

  const filtered = useMemo(() => posts.filter((p) => {
    if (filtroStatus !== "all" && p.status !== filtroStatus) return false;
    if (filtroPlat.length > 0 && !p.plataformas.some((x) => filtroPlat.includes(x))) return false;
    return true;
  }), [posts, filtroPlat, filtroStatus]);

  const monthDays = useMemo(() => {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    filtered.forEach((p) => {
      if (!p.data_agendada) return;
      const key = new Date(p.data_agendada).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    });
    return map;
  }, [filtered]);

  const dayPosts = selectedDate ? postsByDay.get(selectedDate.toDateString()) ?? [] : [];

  const togglePlat = (p: Plataforma) =>
    setFiltroPlat((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Social Media</h2>
          <p className="text-sm text-muted-foreground">Calendário de postagens.</p>
        </div>
        <Button className="gap-2" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus size={16} /> Novo post
        </Button>
      </div>
      <ConectarMetaCard portfolioId={portfolioId} />


      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground">Plataformas:</span>
        {PLATAFORMAS.map((p) => {
          const Icon = PLAT_ICON[p.key];
          const active = filtroPlat.includes(p.key);
          return (
            <Button key={p.key} size="sm" variant={active ? "default" : "outline"} onClick={() => togglePlat(p.key)} className="gap-1.5 h-7">
              <Icon size={12} /> {p.label}
            </Button>
          );
        })}
        <span className="text-xs text-muted-foreground ml-3">Status:</span>
        {(["all", "rascunho", "agendado", "publicado", "falhou"] as const).map((s) => (
          <Button key={s} size="sm" variant={filtroStatus === s ? "default" : "outline"} onClick={() => setFiltroStatus(s)} className="h-7 capitalize">
            {s === "all" ? "Todos" : s}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Button size="icon" variant="ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                <ChevronLeft size={16} />
              </Button>
              <h3 className="font-semibold capitalize">
                {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </h3>
              <Button size="icon" variant="ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                <ChevronRight size={16} />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground text-center mb-1">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d}>{d}</div>)}
            </div>

            {isLoading ? <Skeleton className="h-96" /> : (
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((d, idx) => {
                  if (!d) return <div key={idx} className="h-24" />;
                  const list = postsByDay.get(d.toDateString()) ?? [];
                  const isSelected = selectedDate?.toDateString() === d.toDateString();
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(d)}
                      className={`h-24 border rounded p-1 text-left text-xs flex flex-col gap-0.5 hover:border-primary transition-colors ${isSelected ? "border-primary bg-accent" : ""} ${isToday ? "ring-1 ring-primary/40" : ""}`}
                    >
                      <div className="font-semibold">{d.getDate()}</div>
                      <div className="space-y-0.5 overflow-hidden">
                        {list.slice(0, 2).map((p) => (
                          <div key={p.id} className={`truncate rounded px-1 ${STATUS_COLOR[p.status]}`}>
                            {p.titulo}
                          </div>
                        ))}
                        {list.length > 2 && <div className="text-muted-foreground">+{list.length - 2}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 text-sm">
              {selectedDate ? selectedDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }) : "Selecione um dia"}
            </h3>
            {selectedDate && (
              <Button size="sm" variant="outline" className="w-full mb-3 gap-1" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus size={12} /> Novo nesse dia
              </Button>
            )}
            <div className="space-y-2">
              {dayPosts.length === 0 && selectedDate && (
                <p className="text-xs text-muted-foreground">Nenhum post agendado.</p>
              )}
              {dayPosts.map((p) => (
                <div
                  key={p.id}
                  className="border rounded p-2 hover:border-primary cursor-pointer"
                  onClick={() => { setEditing(p); setDialogOpen(true); }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="font-medium text-sm truncate">{p.titulo}</div>
                    <Badge className={STATUS_COLOR[p.status]} variant="secondary">{p.status}</Badge>
                  </div>
                  <div className="flex gap-1 mb-1">
                    {p.plataformas.map((pl) => {
                      const Icon = PLAT_ICON[pl];
                      return <Icon key={pl} size={12} className="text-muted-foreground" />;
                    })}
                  </div>
                  {p.legenda && <div className="text-xs text-muted-foreground line-clamp-2">{p.legenda}</div>}
                  {p.data_agendada && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {new Date(p.data_agendada).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <PostDialog
        portfolioId={portfolioId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialDate={selectedDate}
        editing={editing}
      />
    </div>
  );
}
