/** Targets are aliases of ONE recipient, not separate recipients. Move to another
 * alias only after an explicit 400/404 rejection; never after an ambiguous send. */
export async function deliverSafeReply(evoUrl: string, evoKey: string, instance: string, targets: string[], text: string, transport: typeof fetch = fetch) {
  const unique = [...new Set(targets.filter(Boolean))];
  if (!unique.length) return { status: "failed", reason: "Destino do contato ausente" };
  for (let i = 0; i < unique.length; i++) {
    try {
      const response = await transport(`${evoUrl}/message/sendText/${instance}`, { method: "POST", headers: { apikey: evoKey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: unique[i], text }), signal: AbortSignal.timeout(12000) });
      const raw = await response.text();
      if (!response.ok) {
        if ([400, 404].includes(response.status) && i < unique.length - 1) continue;
        return { status: response.status >= 500 || response.status === 408 ? "uncertain" : "failed", reason: `Envio não confirmado (${response.status})` };
      }
      const receipt = JSON.parse(raw), messageId = receipt.key?.id ?? receipt.data?.key?.id;
      return messageId && !receipt.error ? { status: "accepted", messageId } : { status: "uncertain", reason: "Envio sem confirmação de aceitação" };
    } catch { return { status: "uncertain", reason: "Envio interrompido; verificar entrega antes de reenviar" }; }
  }
  return { status: "failed", reason: "Nenhum endereço do contato aceito" };
}