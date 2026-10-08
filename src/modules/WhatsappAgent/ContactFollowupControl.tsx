import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ContactFollowupControl({ portfolioId, telefone }: { portfolioId: string; telefone: string }) {
  const phone = telefone.replace(/\D/g, "");
  const qc = useQueryClient();
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("09:00");
  const queryKey = ["contact-followup-preference", portfolioId, phone];
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_contact_preferences")
        .select("followup_disabled, customer_status, scheduled_followup_at, scheduled_followup_status").eq("portfolio_id", portfolioId).eq("phone", phone).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async (values: { followup_disabled?: boolean; customer_status?: string; scheduled_followup_at?: string | null }) => {
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
  const scheduleBlocked = disabled || purchased || data?.followup_disabled === true;
  function schedule() {
    if (!date) return;
    const [hour, minute] = time.split(":").map(Number);
    const selected = new Date(date);
    selected.setHours(hour, minute, 0, 0);
    if (!Number.isFinite(selected.getTime()) || selected.getTime() <= Date.now()) {
      toast.error("Selecione uma data e horário futuros");
      return;
    }
    save.mutate({ scheduled_followup_at: selected.toISOString() });
  }
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
      <div className="space-y-2">
        <Label>Selecionar data para fazer follow-up</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" disabled={scheduleBlocked} className="justify-start font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "dd/MM/yyyy") : "Selecionar data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={date} onSelect={setDate} locale={ptBR}
                disabled={(day) => day < startOfDay(new Date())} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Input type="time" aria-label="Horário do follow-up" className="w-28" value={time}
            onChange={(e) => setTime(e.target.value)} disabled={scheduleBlocked} />
          <Button onClick={schedule} disabled={scheduleBlocked || !date || !time}>Agendar</Button>
        </div>
        {data?.scheduled_followup_at && <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{data.scheduled_followup_status === "sent" ? "Enviado" : data.scheduled_followup_status === "failed" ? "Falha no envio" : data.scheduled_followup_status === "processing" ? "Em envio" : "Agendado"}: {format(new Date(data.scheduled_followup_at), "dd/MM/yyyy 'às' HH:mm")}</span>
          <Button variant="ghost" size="icon" aria-label="Cancelar agendamento" title="Cancelar agendamento"
            disabled={disabled} onClick={() => save.mutate({ scheduled_followup_at: null })}><X className="h-4 w-4" /></Button>
        </div>}
      </div>
      {isError && <p className="text-sm text-destructive">Não foi possível carregar as preferências.</p>}
    </div>
  );
}