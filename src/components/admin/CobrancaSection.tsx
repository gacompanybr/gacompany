import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";

export type CobrancaState = {
  id: string | null;
  valor: string;
  dia_vencimento: string;
  sender_instance: string;
  sender_portfolio_id: string | null;
  contato_jid: string;
  contato_telefone: string;
  contato_nome: string;
  mensagem_template: string;
  ativo: boolean;
};

export const emptyCobranca = (): CobrancaState => ({
  id: null,
  valor: "",
  dia_vencimento: "",
  sender_instance: "",
  sender_portfolio_id: null,
  contato_jid: "",
  contato_telefone: "",
  contato_nome: "",
  mensagem_template: "Olá! Segue a cobrança do mês no valor de /valor/. Obrigado!",
  ativo: false,
});

/** Salva (upsert por portfolio_id) a config de cobrança. Retorna true se ok/ignorado. */
export async function saveCobranca(portfolioId: string, c: CobrancaState): Promise<boolean> {
  const dia = Number(c.dia_vencimento);
  const preenchido =
    c.sender_instance && c.contato_telefone && c.mensagem_template.trim() && dia >= 1 && dia <= 31;
  if (!preenchido) {
    // nada configurado -> não cria registro incompleto
    if (c.sender_instance || c.contato_telefone || c.dia_vencimento) {
      toast.error("Cobrança: preencha dia (1-31), número que envia, contato e mensagem");
      return false;
    }
    return true;
  }
  const { error } = await supabase.from("cobranca_config").upsert({
    portfolio_id: portfolioId,
    valor: Number(String(c.valor).replace(",", ".")) || 0,
    dia_vencimento: dia,
    sender_instance: c.sender_instance,
    sender_portfolio_id: c.sender_portfolio_id,
    contato_jid: c.contato_jid || `${c.contato_telefone}@s.whatsapp.net`,
    contato_telefone: c.contato_telefone,
    contato_nome: c.contato_nome || null,
    mensagem_template: c.mensagem_template,
    ativo: c.ativo,
  }, { onConflict: "portfolio_id" });
  if (error) {
    toast.error(`Cobrança: ${error.message}`);
    return false;
  }
  return true;
}

export function CobrancaSection({
  value, onChange,
}: { value: CobrancaState; onChange: (patch: Partial<CobrancaState>) => void }) {
  const [contatos, setContatos] = useState<{ jid: string; phone: string; nome: string }[]>([]);
  const [loadingContatos, setLoadingContatos] = useState(false);
  const [sending, setSending] = useState(false);
  const [busca, setBusca] = useState("");

  const { data: chips = [] } = useQuery({
    queryKey: ["cobranca-chips-conectados"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_connections")
        .select("instance_name, portfolio_id, status")
        .eq("status", "connected");
      const rows = data ?? [];
      const ids = [...new Set(rows.map((r) => r.portfolio_id))];
      const { data: ports } = ids.length
        ? await supabase.from("portfolios").select("id, name").in("id", ids)
        : { data: [] as any[] };
      const nameById = new Map((ports ?? []).map((p: any) => [p.id, p.name]));
      return rows.map((r) => ({
        instance_name: r.instance_name as string,
        portfolio_id: r.portfolio_id as string,
        label: (nameById.get(r.portfolio_id) as string) ?? (r.instance_name as string),
      }));
    },
  });

  const instancia = value.sender_instance;

  useEffect(() => {
    if (!instancia) { setContatos([]); return; }
    let cancel = false;
    setLoadingContatos(true);
    supabase.functions
      .invoke("evolution-instance", {
        body: { action: "contacts_by_instance", instanceName: instancia },
      })
      .then(({ data, error }) => {
        if (cancel) return;
        if (error) { toast.error("Não foi possível carregar os contatos deste número"); setContatos([]); }
        else setContatos((data as any)?.contacts ?? []);
      })
      .finally(() => !cancel && setLoadingContatos(false));
    return () => { cancel = true; };
  }, [instancia]);

  async function enviarAgora() {
    if (!value.id) return toast.error("Salve a cobrança antes de enviar");
    setSending(true);
    const { data, error } = await supabase.functions.invoke("cobranca-send", {
      body: { configId: value.id, origem: "manual" },
    });
    setSending(false);
    if (error || (data as any)?.ok === false) {
      return toast.error(`Erro ao enviar: ${(data as any)?.erro ?? error?.message ?? "desconhecido"}`);
    }
    toast.success("Cobrança enviada!");
  }

  const filtrados = busca.trim()
    ? contatos.filter((c) =>
        `${c.nome} ${c.phone}`.toLowerCase().includes(busca.trim().toLowerCase()))
    : contatos;

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <h4 className="font-semibold text-sm">Cobrança</h4>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Valor a cobrar (R$)</Label>
          <Input
            type="number" step="0.01" min="0"
            value={value.valor}
            onChange={(e) => onChange({ valor: e.target.value })}
            placeholder="0,00"
          />
        </div>
        <div className="space-y-2">
          <Label>Dia do vencimento</Label>
          <Input
            type="number" min={1} max={31}
            value={value.dia_vencimento}
            onChange={(e) => onChange({ dia_vencimento: e.target.value })}
            placeholder="10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Número que envia</Label>
        <Select
          value={value.sender_instance}
          onValueChange={(v) => {
            const chip = chips.find((c) => c.instance_name === v);
            onChange({
              sender_instance: v,
              sender_portfolio_id: chip?.portfolio_id ?? null,
              contato_jid: "", contato_telefone: "", contato_nome: "",
            });
          }}
        >
          <SelectTrigger><SelectValue placeholder="Escolha um número conectado" /></SelectTrigger>
          <SelectContent>
            {chips.map((c) => (
              <SelectItem key={c.instance_name} value={c.instance_name}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {chips.length === 0 && (
          <p className="text-xs text-muted-foreground">Conecte o número para listar contatos.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Contato que recebe</Label>
        {!instancia ? (
          <p className="text-xs text-muted-foreground">Escolha primeiro o número que envia.</p>
        ) : loadingContatos ? (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="animate-spin" size={12} /> Carregando contatos...
          </p>
        ) : (
          <>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar contato por nome ou telefone"
            />
            <Select
              value={value.contato_jid}
              onValueChange={(jid) => {
                const c = contatos.find((x) => x.jid === jid);
                if (c) onChange({ contato_jid: c.jid, contato_telefone: c.phone, contato_nome: c.nome });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  value.contato_telefone
                    ? `${value.contato_nome || "Contato"} · ${value.contato_telefone}`
                    : "Escolha o contato"
                } />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {filtrados.slice(0, 200).map((c) => (
                  <SelectItem key={c.jid} value={c.jid}>
                    {(c.nome || "Sem nome")} · {c.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {contatos.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Conecte o número para listar contatos.
              </p>
            )}
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label>Mensagem padrão</Label>
        <Textarea
          rows={3}
          value={value.mensagem_template}
          onChange={(e) => onChange({ mensagem_template: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Use <code>/valor/</code> onde o valor deve aparecer. Ex.: "Olá! Segue a cobrança do mês no
          valor de /valor/. Obrigado!" — o robô troca <code>/valor/</code> por R$ formatado.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label>Envio automático</Label>
          <p className="text-xs text-muted-foreground">Dispara sozinho no dia do vencimento.</p>
        </div>
        <Switch checked={value.ativo} onCheckedChange={(v) => onChange({ ativo: v })} />
      </div>

      {value.id && (
        <Button variant="outline" onClick={enviarAgora} disabled={sending} className="gap-2 w-full">
          {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
          Enviar agora
        </Button>
      )}
    </div>
  );
}
