// Worker do Robô: roda a cada minuto via pg_cron e dispara mensagens
// agendadas para grupos do WhatsApp via Evolution API.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DIAS_MAP = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// "HH:MM:SS" → minutos desde 00:00 no timezone Brasil
function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

async function sendText(instance: string, to: string, text: string) {
  const r = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
    method: "POST",
    headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ number: to, text }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${txt}`);
  return txt;
}

async function sendMedia(instance: string, to: string, imageUrl: string, caption: string) {
  const r = await fetch(`${EVO_URL}/message/sendMedia/${instance}`, {
    method: "POST",
    headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      number: to,
      mediatype: "image",
      media: imageUrl,
      caption,
      fileName: "promo.jpg",
    }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${txt}`);
  return txt;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Horário São Paulo
    const now = new Date();
    const spStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour12: false });
    const sp = new Date(spStr);
    const diaAtual = DIAS_MAP[sp.getDay()];
    const minutosAgora = sp.getHours() * 60 + sp.getMinutes();

    const { data: robos, error } = await admin
      .from("robo_campanhas")
      .select("*")
      .eq("status", "ativo");
    if (error) throw error;

    const results: any[] = [];

    for (const r of robos ?? []) {
      try {
        const dias = Array.isArray(r.dias_semana) ? r.dias_semana : [];
        if (!dias.includes(diaAtual)) continue;

        // Janela de horário: usa horarios_por_dia se houver, senão legado horario_inicio/fim
        const hpd = r.horarios_por_dia && typeof r.horarios_por_dia === "object"
          ? r.horarios_por_dia[diaAtual]
          : null;
        const ini = toMin(String(hpd?.inicio ?? r.horario_inicio));
        const fim = toMin(String(hpd?.fim ?? r.horario_fim));
        if (minutosAgora < ini || minutosAgora > fim) continue;

        const proxima = r.proxima_execucao ? new Date(r.proxima_execucao).getTime() : 0;
        if (proxima > now.getTime()) continue;

        const destinos: string[] = Array.isArray(r.destinos) ? r.destinos : [];
        if (r.campaign_type !== "disparo" && destinos.length === 0) {
          results.push({ id: r.id, skip: "sem destinos" });
          continue;
        }
        if (!r.instancia_id) {
          results.push({ id: r.id, skip: "sem instância WhatsApp" });
          continue;
        }


        let enviados = 0;

        if (r.campaign_type === "beacons_promo") {
          const { data: promo } = await admin
            .from("beacons_promocoes")
            .select("link,image_url,texto,ativo")
            .eq("portfolio_id", r.portfolio_id)
            .maybeSingle();
          if (!promo || !promo.ativo) {
            results.push({ id: r.id, skip: "promo inativa ou não cadastrada" });
            continue;
          }
          const caption = `${promo.texto ?? ""}${promo.link ? `\n\n👉 ${promo.link}` : ""}`.trim();
          for (const to of destinos) {
            try {
              if (promo.image_url) {
                await sendMedia(r.instancia_id, to, promo.image_url, caption);
              } else {
                await sendText(r.instancia_id, to, caption);
              }
              enviados++;
            } catch (e) {
              console.error(`Falha envio promo robô ${r.id} → ${to}`, e);
            }
          }
        } else if (r.campaign_type === "disparo") {
          const mensagens: string[] = Array.isArray(r.mensagens) ? r.mensagens : [];
          if (mensagens.length === 0) {
            results.push({ id: r.id, skip: "sem mensagens" });
            continue;
          }
          if (!r.planilha_url) {
            results.push({ id: r.id, skip: "sem planilha_url" });
            continue;
          }
          // Buscar CSV e parsear
          let contatos: Array<{ nome: string; numero: string }> = [];
          try {
            const csvResp = await fetch(r.planilha_url);
            if (!csvResp.ok) throw new Error(`CSV ${csvResp.status}`);
            const csv = await csvResp.text();
            const lines = csv.split(/\r?\n/).filter((l) => l.trim());
            if (lines.length < 2) throw new Error("CSV vazio");
            const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
            const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
            const idxNome = headers.findIndex((h) => h === "nome" || h === "name");
            const idxNum = headers.findIndex((h) => ["numero","número","telefone","whatsapp","phone","celular"].includes(h));
            if (idxNum < 0) throw new Error("CSV sem coluna numero/telefone");
            for (let i = 1; i < lines.length; i++) {
              const cells = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
              const numero = (cells[idxNum] ?? "").replace(/\D/g, "");
              if (!numero) continue;
              contatos.push({ nome: idxNome >= 0 ? cells[idxNome] ?? "" : "", numero });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await admin.from("robo_campanhas").update({ ultimo_erro: `CSV: ${msg}` }).eq("id", r.id);
            results.push({ id: r.id, erro: `CSV: ${msg}` });
            continue;
          }
          const offset = r.total_enviados ?? 0;
          if (offset >= contatos.length) {
            await admin.from("robo_campanhas").update({ status: "pausado", ultimo_erro: "Lista concluída" }).eq("id", r.id);
            results.push({ id: r.id, skip: "lista concluída" });
            continue;
          }
          const contato = contatos[offset];
          const template = mensagens[Math.floor(Math.random() * mensagens.length)];
          const text = template
            .replace(/\{nome\}/gi, contato.nome || "tudo bem")
            .replace(/\{telefone\}/gi, contato.numero);
          try {
            await sendText(r.instancia_id, contato.numero, text);
            enviados = 1;
          } catch (e) {
            console.error(`Falha disparo robô ${r.id} → ${contato.numero}`, e);
          }
        } else {
          const mensagens: string[] = Array.isArray(r.mensagens) ? r.mensagens : [];
          if (mensagens.length === 0) {
            results.push({ id: r.id, skip: "sem mensagens" });
            continue;
          }
          const msg = mensagens[Math.floor(Math.random() * mensagens.length)];
          for (const to of destinos) {
            try {
              await sendText(r.instancia_id, to, msg);
              enviados++;
            } catch (e) {
              console.error(`Falha envio robô ${r.id} → ${to}`, e);
            }
          }
        }


        // Próxima execução: agora + intervalo aleatório
        const intervaloMin = hpd?.intervalo ?? r.intervalo_min_min ?? 30;
        const intervaloMax = hpd?.intervalo ?? r.intervalo_max_min ?? 90;
        const nextMin = rand(intervaloMin, intervaloMax);
        const proximaExec = new Date(now.getTime() + nextMin * 60_000).toISOString();

        await admin.from("robo_campanhas").update({
          ultima_execucao: now.toISOString(),
          proxima_execucao: proximaExec,

          total_enviados: (r.total_enviados ?? 0) + enviados,
          ultimo_erro: enviados === 0 ? "Nenhuma mensagem enviada com sucesso" : null,
        }).eq("id", r.id);

        results.push({ id: r.id, enviados, proxima: proximaExec });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("robo_campanhas").update({ ultimo_erro: msg }).eq("id", r.id);
        results.push({ id: r.id, erro: msg });
      }
    }

    return j({ ok: true, processados: results.length, results });
  } catch (e) {
    console.error("robo-worker error", e);
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
