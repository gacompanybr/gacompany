import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Asset = { id: string; name: string };
async function metaCall(body: Record<string, string>) {
  const { data, error } = await supabase.functions.invoke("crm-meta-config", { body });
  if (error) {
    let message = error.message;
    if (error.context instanceof Response) {
      const details = await error.context.json().catch(() => null);
      message = details?.error || message;
    }
    throw new Error(message);
  }
  return data as { items?: Asset[]; ok?: boolean };
}

export function MetaBindingDialog() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("integrations.manage");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState("");
  const [campaign, setCampaign] = useState("");
  const [form, setForm] = useState("");
  const [busy, setBusy] = useState(false);
  const bindings = useQuery({ queryKey: ["crm-meta-bindings"], queryFn: async () => {
    const { data, error } = await supabase.from("crm_meta_bindings").select("*").eq("enabled", true).order("created_at");
    if (error) throw error;
    return data;
  } });
  const accounts = useQuery({ queryKey: ["crm-meta-accounts"], enabled: open && canManage, queryFn: () => metaCall({ action: "accounts" }), staleTime: 300000, retry: false });
  const campaigns = useQuery({ queryKey: ["crm-meta-campaigns", account], enabled: open && canManage && !!account, queryFn: () => metaCall({ action: "campaigns", account_id: account }), staleTime: 300000, retry: false });
  const forms = useQuery({ queryKey: ["crm-meta-forms", account, campaign], enabled: open && canManage && !!campaign, queryFn: () => metaCall({ action: "forms", account_id: account, campaign_id: campaign }), staleTime: 300000, retry: false });
  const error = accounts.error || campaigns.error || forms.error || bindings.error;
  const save = async () => {
    setBusy(true);
    try {
      await metaCall({ action: "save", account_id: account, campaign_id: campaign, form_id: form });
      await qc.invalidateQueries({ queryKey: ["crm-meta-bindings"] });
      toast.success("Vínculo salvo. Recepção depende do webhook ativo na Meta.");
      setForm("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível vincular"); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true);
    try { await metaCall({ action: "remove", binding_id: id }); await qc.invalidateQueries({ queryKey: ["crm-meta-bindings"] }); toast.success("Vínculo removido"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao remover"); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" className="gap-2"><Link2 size={16} /> Vincular Meta</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Formulários instantâneos · Meta</DialogTitle></DialogHeader>
      <div className="flex flex-wrap gap-2"><Badge variant="secondary">Destino: CRM geral</Badge><Badge variant="outline">Página 569248409608253</Badge></div>
      {error && <p role="alert" className="text-sm text-destructive break-words">{error.message}</p>}
      {canManage ? <div className="space-y-4">
        <AssetSelect label="Conta de anúncios" value={account} items={accounts.data?.items || []} loading={accounts.isFetching} disabled={accounts.isFetching} onChange={v => { setAccount(v); setCampaign(""); setForm(""); }} />
        <AssetSelect label="Campanha" value={campaign} items={campaigns.data?.items || []} loading={campaigns.isFetching} disabled={!account || campaigns.isFetching} onChange={v => { setCampaign(v); setForm(""); }} />
        <AssetSelect label="Formulário instantâneo" value={form} items={forms.data?.items || []} loading={forms.isFetching} disabled={!campaign || forms.isFetching} onChange={setForm} />
        {campaign && forms.isSuccess && !forms.data?.items?.length && <p className="text-sm text-muted-foreground">Nenhum formulário confirmado nos anúncios desta campanha.</p>}
        <Button onClick={save} disabled={busy || !form} className="gap-2">{busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Vincular formulário</Button>
      </div> : <p className="text-sm text-muted-foreground">A vinculação está disponível para quem gerencia integrações.</p>}
      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-sm font-semibold">Vínculos salvos</h3>
        {bindings.data?.map(b => <div key={b.id} className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm"><p className="font-medium break-words">{b.form_name}</p><p className="text-muted-foreground break-words">{b.account_name} · {b.campaign_name}</p><Badge variant="outline" className="mt-1">Recepção externa não verificada</Badge></div>
          {canManage && <Button variant="ghost" size="icon" aria-label={`Remover vínculo ${b.form_name}`} title="Remover vínculo" disabled={busy} onClick={() => remove(b.id)}><Unlink size={16} /></Button>}
        </div>)}
        {bindings.isSuccess && !bindings.data?.length && <p className="text-sm text-muted-foreground">Nenhum formulário vinculado.</p>}
      </div>
    </DialogContent>
  </Dialog>;
}

function AssetSelect({ label, value, items, loading, disabled, onChange }: { label: string; value: string; items: Asset[]; loading: boolean; disabled: boolean; onChange: (v: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="w-full min-w-0"><SelectValue placeholder={loading ? "Consultando Meta…" : "Selecionar"} /></SelectTrigger><SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} · {i.id}</SelectItem>)}</SelectContent></Select></div>;
}