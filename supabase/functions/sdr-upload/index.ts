// Cria uma campanha SDR a partir das linhas parseadas no client.
// Body: { portfolioId, nome, ratePerHour, rows: [{telefone, nome?, nicho, instagram?, motivo_contato}] }
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normalizePhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  // 10 dígitos = celular antigo sem DDI; 11 = celular com 9; 12-13 = com DDI.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 12 || digits.length === 13) return digits;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const {
      portfolioId,
      nome,
      ratePerHour,
      audioEnabled,
      audioOnIntro,
      audioOnLongMessage,
      audioLongMessageThreshold,
      rows,
    } = await req.json();
    if (!portfolioId) return json({ error: "portfolioId obrigatório" }, 400);
    if (!Array.isArray(rows) || rows.length === 0) return json({ error: "Planilha vazia" }, 400);

    const { data: hasAccess } = await admin.rpc("has_portfolio_access", { _user_id: user.id, _portfolio_id: portfolioId });
    if (!hasAccess) return json({ error: "Sem acesso ao portfólio" }, 403);

    // Só permite 1 campanha ativa por portfólio
    const { data: active } = await admin
      .from("sdr_campaigns")
      .select("id, status")
      .eq("portfolio_id", portfolioId)
      .in("status", ["draft", "running", "paused"])
      .limit(1);
    if ((active ?? []).length) {
      return json({ error: "Já existe uma campanha ativa neste portfólio. Encerre antes de criar uma nova." }, 409);
    }

    const valid: any[] = [];
    const rejected: any[] = [];
    const seen = new Set<string>();
    for (const [i, r] of rows.entries()) {
      const tel = normalizePhone(r?.telefone);
      const nicho = String(r?.nicho ?? "").trim();
      const motivo = String(r?.motivo_contato ?? "").trim();
      if (!tel) { rejected.push({ row: i + 1, reason: "telefone inválido", raw: r?.telefone }); continue; }
      if (!nicho) { rejected.push({ row: i + 1, reason: "nicho vazio" }); continue; }
      if (!motivo) { rejected.push({ row: i + 1, reason: "motivo_contato vazio" }); continue; }
      if (seen.has(tel)) { rejected.push({ row: i + 1, reason: "telefone duplicado", tel }); continue; }
      seen.add(tel);
      valid.push({
        telefone: tel,
        nome: r?.nome ? String(r.nome).trim() : null,
        nicho,
        instagram: r?.instagram ? String(r.instagram).trim() : null,
        cidade: r?.cidade ? String(r.cidade).trim() : null,
        motivo_contato: motivo,
      });
    }

    if (!valid.length) return json({ error: "Nenhuma linha válida", rejected }, 400);

    const { data: campaign, error: cErr } = await admin
      .from("sdr_campaigns")
      .insert({
        portfolio_id: portfolioId,
        nome: nome || `Campanha ${new Date().toISOString().slice(0, 10)}`,
        rate_per_hour: Math.max(1, Math.min(500, Number(ratePerHour ?? 30))),
        audio_enabled: audioEnabled === true,
        audio_on_intro: audioOnIntro !== false,
        audio_on_long_message: audioOnLongMessage !== false,
        audio_long_message_threshold: Math.max(200, Math.min(2000, Number(audioLongMessageThreshold ?? 420))),
        total_leads: valid.length,
        status: "draft",
      })
      .select("*")
      .single();
    if (cErr) return json({ error: cErr.message }, 500);

    const leadRows = valid.map((v) => ({ ...v, campaign_id: campaign.id, portfolio_id: portfolioId }));
    // Insere em batches de 500
    for (let i = 0; i < leadRows.length; i += 500) {
      const slice = leadRows.slice(i, i + 500);
      const { error: lErr } = await admin.from("sdr_leads").insert(slice);
      if (lErr) {
        await admin.from("sdr_campaigns").delete().eq("id", campaign.id);
        return json({ error: `Falha ao inserir leads: ${lErr.message}` }, 500);
      }
    }

    return json({ ok: true, campaign, inserted: valid.length, rejected });
  } catch (e) {
    console.error("sdr-upload error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
