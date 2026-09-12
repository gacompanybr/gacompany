import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { sb } from "@/lib/sb";
import { toast } from "sonner";

type JobRole = { id: string; label: string };
type Permission = { id: string; key: string; label: string; module: string };

export function PermissoesCargos({ roles }: { roles: JobRole[] }) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  async function load() {
    const [{ data: permissionRows }, { data: links }] = await Promise.all([sb.from("permissions").select("id,key,label,module").order("module"), sb.from("job_role_permissions").select("job_role_id,permission_id")]);
    setPermissions(permissionRows ?? []);
    const next: Record<string, Set<string>> = {};
    for (const role of roles) next[role.id] = new Set((links ?? []).filter((link: any) => link.job_role_id === role.id).map((link: any) => link.permission_id));
    setSelected(next);
  }
  useEffect(() => { load(); }, [roles]);
  const byModule = useMemo(() => Object.entries(Object.groupBy(permissions, (permission) => permission.module)), [permissions]);

  async function save(roleId: string) {
    const { error: deleteError } = await sb.from("job_role_permissions").delete().eq("job_role_id", roleId);
    if (deleteError) return toast.error(deleteError.message);
    const ids = Array.from(selected[roleId] ?? []);
    if (ids.length) {
      const { error } = await sb.from("job_role_permissions").insert(ids.map((permissionId) => ({ job_role_id: roleId, permission_id: permissionId })));
      if (error) return toast.error(error.message);
    }
    toast.success("Permissões atualizadas");
  }

  return <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">Acessos por cargo</h2><Accordion type="single" collapsible>{roles.map((role) => <AccordionItem key={role.id} value={role.id}><AccordionTrigger>{role.label}</AccordionTrigger><AccordionContent className="space-y-4">{byModule.map(([module, rows]) => <div key={module}><p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{module}</p><div className="grid gap-2 sm:grid-cols-2">{(rows ?? []).map((permission) => <label key={permission.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"><Checkbox checked={selected[role.id]?.has(permission.id) ?? false} onCheckedChange={(checked) => setSelected((current) => { const set = new Set(current[role.id] ?? []); checked ? set.add(permission.id) : set.delete(permission.id); return { ...current, [role.id]: set }; })} />{permission.label}</label>)}</div></div>)}<Button size="sm" onClick={() => save(role.id)}>Salvar acessos</Button></AccordionContent></AccordionItem>)}</Accordion></Card>;
}