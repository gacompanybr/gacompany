import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function ContactFollowupControl({ portfolioId, telefone }: { portfolioId: string; telefone: string }) {
  const phone = telefone.replace(/\D/g, "");
  const qc = useQueryClient();
  const queryKey = ["contact-followup-preference", portfolioId, phone];
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_contact_preferences")
        .select("followup_disabled, customer_status").eq("portfolio_id", portfolioId).eq("phone", phone).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async (values: { followup_disabled: boolean; customer_status: string }) => {
      const { error } = await supabase.from("whatsapp_contact_preferences")
        .upsert({ portfolio_id: portfolioId, phone, ...values }, { onConflict: "portfolio_id,phone" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      await qc.invalidateQueries({ queryKey: ["contact-followup-preferences", portfolioId] });
      toast.success("Preferências do contato salvas");
    },
    onError: () => toast.error("Não foi possível salvar as preferências do contato"),
  });
  const purchased = data?.customer_status === "course_purchased";
  const disabled = isLoading || isError || save.isPending;
  return (
    <div className="space-y-3 border-b border-border pb-4">
      <div className="flex items-center gap-2">
        <Checkbox id="contact-no-followup" checked={data?.followup_disabled === true || purchased}
          disabled={disabled || purchased}
          onCheckedChange={(checked) => save.mutate({ followup_disabled: checked === true, customer_status: data?.customer_status ?? "lead" })} />
        <Label htmlFor="contact-no-followup">Não receber mais follow-up</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="contact-course-purchased" checked={purchased} disabled={disabled}
          onCheckedChange={(checked) => save.mutate({ customer_status: checked === true ? "course_purchased" : "lead", followup_disabled: checked === true || data?.followup_disabled === true })} />
        <Label htmlFor="contact-course-purchased">Cliente — Curso comprado</Label>
      </div>
      {purchased && <Badge variant="secondary">Cliente — Curso comprado</Badge>}
      {isError && <p className="text-sm text-destructive">Não foi possível carregar as preferências.</p>}
    </div>
  );
}