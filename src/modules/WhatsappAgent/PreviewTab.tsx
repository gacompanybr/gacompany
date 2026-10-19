import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildSystemPrompt, type WhatsappAgent } from "./types";

type ChatMsg = { role: "user" | "agent"; text: string };

export function PreviewTab({ agent }: { agent: WhatsappAgent }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(
    agent.mensagem_boas_vindas
      ? [{ role: "agent", text: agent.mensagem_boas_vindas }]
      : [],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send() {
    if (!input.trim() || busy) return;
    const userMessage = input.trim();
    setMsgs((prev) => [...prev, { role: "user", text: userMessage }]);
    setInput("");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-agent-preview", {
        body: {
          systemPrompt: buildSystemPrompt(agent),
          userMessage,
          messages: msgs.map((m) => ({
            role: m.role === "agent" ? "assistant" : "user",
            content: m.text,
          })),
          model: agent.modelo_ia,
          temperature: agent.temperatura,
          maxTokens: agent.max_tokens,
          ...(agent.catalogo_url ? { catalogoUrl: agent.catalogo_url, portfolioId: agent.portfolio_id } : {}),
        },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error ?? error?.message ?? "Erro ao gerar resposta");
      } else {
        const parts = Array.isArray((data as any).parts) && (data as any).parts.length
          ? (data as any).parts
          : [(data as any).reply];
        setMsgs((prev) => [
          ...prev,
          ...parts.map((text: string) => ({ role: "agent" as const, text })),
        ]);
      }
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-xs">
        <AlertCircle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
        <p>Esta é uma simulação para testar respostas. O agente real, quando conectado, usa o modelo configurado.</p>
      </div>

      <Card className="overflow-hidden bg-[#0a1014]">
        <div
          ref={scrollRef}
          className="h-[420px] overflow-y-auto p-4 space-y-2 bg-[#0b141a] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%220%200%2040%2040%22%3E%3Cpath%20fill%3D%22%23131c21%22%20d%3D%22M0%200h40v40H0z%22%2F%3E%3C%2Fsvg%3E')]"
        >
          {msgs.length === 0 && (
            <p className="text-center text-sm text-muted-foreground mt-8">
              Comece a conversa para testar o agente
            </p>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] px-3 py-2 rounded-lg text-sm shadow ${
                  m.role === "user"
                    ? "bg-[#005c4b] text-white rounded-br-none"
                    : "bg-[#202c33] text-white rounded-bl-none"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-[#202c33] text-white px-3 py-2 rounded-lg rounded-bl-none text-sm flex items-center gap-2">
                <Loader2 className="animate-spin" size={12} /> digitando...
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-3 border-t border-border bg-[#1f2c33]">
          <Input
            placeholder="Digite uma mensagem de teste..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="bg-[#2a3942] border-none text-white placeholder:text-white/50"
          />
          <Button onClick={send} disabled={busy || !input.trim()} size="icon">
            {busy ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
          </Button>
        </div>
      </Card>
    </div>
  );
}
