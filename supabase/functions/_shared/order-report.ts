import { catalogPrice, normalizeSearchText, type SearchProduct } from "./catalog-search.ts";

export type OrderDraft = {
  intent: boolean; confirmed: boolean; confirmation: string; customer: string;
  items: { codigo: string; nome: string; quantity: number; unit_price: number }[];
  modality: "entrega" | "retirada"; address: string; cep: string; freight: string; notes: string;
};
export type OrderTurn = { role: string; mensagem: string; created_at?: string };
export function validateOrder(raw: unknown, catalog: SearchProduct[], turns: OrderTurn[]) {
  const d = raw as OrderDraft | null;
  if (!d?.intent || !d.confirmed) throw new Error("Pedido ainda não confirmado pelo cliente");
  const confirmation = turns.find(t => t.role === "user" && t.mensagem === d.confirmation);
  if (!confirmation || !d.confirmation?.trim()) throw new Error("Confirmação não encontrada na conversa");
  if (!d.customer?.trim() || /^(cliente|contato|não identificado)$/i.test(d.customer)) throw new Error("Nome do cliente pendente");
  const conversation = normalizeSearchText(turns.map(t => t.mensagem).join(" "));
  if (!conversation.includes(normalizeSearchText(d.customer))) throw new Error("Nome não confirmado na conversa");
  if (!["entrega", "retirada"].includes(d.modality)) throw new Error("Modalidade pendente");
  if (d.modality === "entrega" && (!d.address?.trim() || !/^\d{5}-?\d{3}$/.test(d.cep ?? ""))) throw new Error("Endereço ou CEP pendente");
  if (!Array.isArray(d.items) || !d.items.length || d.items.length > 100) throw new Error("Produtos pendentes");
  const items = d.items.map(item => {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 100000) throw new Error("Quantidade inválida");
    const matches = catalog.filter(p => (item.codigo ? p.codigo === item.codigo : true) && normalizeSearchText(p.nome) === normalizeSearchText(item.nome));
    if (matches.length !== 1) throw new Error(`Produto não identificado com segurança: ${item.nome}`);
    const product = matches[0];
    const price = catalogPrice(product.preco);
    if (price === null || !Number.isFinite(item.unit_price) || Math.round(price * 100) !== Math.round(item.unit_price * 100)) throw new Error(`Preço precisa ser reconfirmado: ${product.nome}`);
    return { ...item, codigo: product.codigo, nome: product.nome, unit_price: price };
  });
  return { ...d, items, confirmationAt: confirmation.created_at ?? d.confirmation, total: items.reduce((sum, i) => sum + Math.round(i.quantity * i.unit_price * 100), 0) / 100 };
}
export const money = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatOrder(order: ReturnType<typeof validateOrder>, phone: string, business: string) {
  return [`NOVO PEDIDO — ${business.toUpperCase()}`, "", `Cliente: ${order.customer}`, `Telefone: +${phone}`,
    `Produtos: ${order.items.map(i => `${i.nome} (${i.codigo})`).join("; ")}`,
    `Quantidades: ${order.items.map(i => `${i.nome}: ${i.quantity}`).join("; ")}`,
    `Valores unitários: ${order.items.map(i => `${i.nome}: R$ ${money(i.unit_price)}`).join("; ")}`,
    `Total dos produtos: R$ ${money(order.total)}`, `Modalidade: ${order.modality}`,
    `Endereço: ${order.modality === "entrega" ? order.address : "Retirada na loja"}`, `CEP: ${order.modality === "entrega" ? order.cep : "Não se aplica"}`,
    `Frete: ${order.freight || "A confirmar pela equipe"}`, `Observações: ${order.notes || "Nenhuma"}`].join("\n");
}

/** Persistent atomic reservation, awaited sending, no retry after an ambiguous transport result. */
export async function dispatchOrder(admin: any, agent: any, phone: string, key: string, order: ReturnType<typeof validateOrder>, business: string, evoUrl: string, evoKey: string, transport: typeof fetch = fetch) {
  const { data: configured, error: configError } = await admin.from("whatsapp_agents").select("report_group_id,instancia_id").eq("id", agent.id).single();
  if (configError) throw new Error(`Falha ao recuperar grupo: ${configError.message}`);
  const group = configured?.report_group_id;
  const configurationError = !/^\d+@g\.us$/.test(group ?? "") ? "Grupo de pedidos não configurado" : !configured?.instancia_id ? "Instância WhatsApp não configurada" : null;
  const { data: reservation, error } = await admin.from("whatsapp_order_reports").insert({ portfolio_id: agent.portfolio_id, agent_id: agent.id, phone, order_key: key, group_id: group, payload: order, status: configurationError ? "failed" : "pending", error: configurationError }).select("id").single();
  if (error?.code === "23505") {
    const { data: prior } = await admin.from("whatsapp_order_reports").select("status,error").eq("agent_id", agent.id).eq("phone", phone).eq("order_key", key).single();
    return { status: prior?.status ?? "uncertain", duplicate: true, error: prior?.error };
  }
  if (error || !reservation) throw new Error(`Falha ao registrar pedido: ${error?.message}`);
  const save = async (patch: Record<string, unknown>) => {
    const { error } = await admin.from("whatsapp_order_reports").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", reservation.id);
    if (error) throw new Error(`Falha ao registrar resultado: ${error.message}`);
  };
  if (configurationError) return { status: "failed", error: configurationError };
  console.log("[ORDER] destino", { agentId: agent.id, group, orderId: reservation.id });
  for (let attempt = 1; attempt <= 2; attempt++) {
    await save({ status: "sending", attempts: attempt });
    console.log("[ORDER] tentativa", { orderId: reservation.id, attempt, group });
    try {
      const response = await transport(`${evoUrl}/message/sendText/${configured.instancia_id}`, { method: "POST", headers: { apikey: evoKey, "Content-Type": "application/json" }, body: JSON.stringify({ number: group, text: formatOrder(order, phone, business) }), signal: AbortSignal.timeout(20000) });
      const body = await response.text();
      // Only explicit rate-limit rejection is safe to retry automatically.
      if (response.status === 429 && attempt === 1) continue;
      if (!response.ok) {
        const status = response.status >= 500 || response.status === 408 ? "uncertain" : "failed";
        await save({ status, error: `Evolution ${response.status}: ${body.slice(0, 1500)}` });
        return { status, error: `Envio recusado ou incerto (${response.status})` };
      }
      const result = JSON.parse(body);
      const messageId = result?.key?.id;
      if (!messageId || result?.error) throw new Error("Resposta sem confirmação de aceitação");
      await save({ status: "accepted", message_id: messageId, error: null });
      await admin.from("whatsapp_sent_messages_log").insert({ portfolio_id: agent.portfolio_id, instance_name: configured.instancia_id, phone: group, message_id: messageId });
      console.log("[ORDER] aceito", { orderId: reservation.id, group, messageId });
      return { status: "accepted", messageId };
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      await save({ status: "uncertain", error: details });
      console.error("[ORDER] resultado incerto — não reenviar", { orderId: reservation.id, details });
      return { status: "uncertain", error: details };
    }
  }
  return { status: "failed", error: "Envio não concluído" };
}