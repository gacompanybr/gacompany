// Scrapper de e-mails: Google Places (nicho + cidade) -> visita o site do negócio -> extrai e-mails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GMAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.primaryTypeDisplayName",
  "nextPageToken",
].join(",");

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const BAD_DOMAINS = [
  "example.com", "sentry.io", "wixpress.com", "gravatar.com", "godaddy.com",
  "wordpress.com", "squarespace.com", "shopify.com", "cloudflare.com",
  "google.com", "gstatic.com", "schema.org", "w3.org", "facebook.com",
];
const BAD_EXT = /\.(png|jpe?g|gif|webp|svg|css|js|ico|woff2?)$/i;

const PATHS = ["", "/contato", "/contact", "/quem-somos", "/sobre", "/about", "/fale-conosco"];

function limparEmails(html: string): string[] {
  const found = new Set<string>();
  for (const raw of html.match(EMAIL_RE) ?? []) {
    const e = raw.toLowerCase().trim().replace(/\.$/, "");
    if (BAD_EXT.test(e)) continue;
    if (e.length > 90) continue;
    const dom = e.split("@")[1] ?? "";
    if (BAD_DOMAINS.some((b) => dom === b || dom.endsWith("." + b))) continue;
    if (/^(no-?reply|postmaster|abuse|dmarc|spam)@/.test(e)) continue;
    if (/\.(png|jpg|jpeg|gif|webp)$/.test(dom)) continue;
    found.add(e);
  }
  return [...found];
}

async function buscarEmailsNoSite(site: string): Promise<string[]> {
  let base: URL;
  try {
    base = new URL(site);
  } catch {
    return [];
  }
  const encontrados = new Set<string>();
  for (const p of PATHS) {
    if (encontrados.size >= 3) break;
    const url = `${base.origin}${p}`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 7000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GAContactBot/1.0)" },
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("html") && !ct.includes("text")) continue;
      const html = (await res.text()).slice(0, 400_000);
      for (const e of limparEmails(html)) encontrados.add(e);
    } catch {
      // site fora do ar / timeout — segue
    }
  }
  return [...encontrados];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY || !GMAPS_KEY) {
      return json({ error: "Google Maps não configurado" }, 500);
    }
    const { portfolio_id, nicho, cidade, limite } = await req.json();
    if (!portfolio_id || !nicho || !cidade) {
      return json({ error: "informe portfolio_id, nicho e cidade" }, 400);
    }
    const max = Math.min(Math.max(Number(limite) || 20, 1), 60);

    // 1) Negócios no Places
    const textQuery = `${nicho} em ${cidade}`;
    const places: any[] = [];
    let pageToken: string | undefined;
    let safety = 0;
    while (places.length < max && safety < 4) {
      safety++;
      const body: any = {
        textQuery,
        languageCode: "pt-BR",
        regionCode: "BR",
        pageSize: Math.min(20, max - places.length),
      };
      if (pageToken) body.pageToken = pageToken;
      const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GMAPS_KEY,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (places.length > 0) break;
        return json({ error: data?.error?.message || `places ${res.status}` }, 500);
      }
      for (const p of data.places ?? []) {
        places.push(p);
        if (places.length >= max) break;
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
      await new Promise((r) => setTimeout(r, 1200));
    }

    const comSite = places.filter((p) => p.websiteUri);

    // 2) Extrai e-mails dos sites (em lotes paralelos pequenos)
    const leads: any[] = [];
    const CONC = 5;
    for (let i = 0; i < comSite.length; i += CONC) {
      const bloco = comSite.slice(i, i + CONC);
      const resultados = await Promise.all(
        bloco.map(async (p) => ({ p, emails: await buscarEmailsNoSite(p.websiteUri) })),
      );
      for (const { p, emails } of resultados) {
        for (const email of emails) {
          leads.push({
            portfolio_id,
            email,
            nome_empresa: p.displayName?.text ?? "",
            nicho,
            cidade,
            telefone: p.nationalPhoneNumber ?? "",
            website: p.websiteUri ?? "",
            endereco: p.formattedAddress ?? "",
            place_id: p.id ?? "",
          });
        }
      }
    }

    // dedupe por e-mail
    const vistos = new Set<string>();
    const unicos = leads.filter((l) => {
      if (vistos.has(l.email)) return false;
      vistos.add(l.email);
      return true;
    });

    let salvos = 0;
    if (unicos.length) {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      const { error } = await sb
        .from("email_leads")
        .upsert(unicos, { onConflict: "portfolio_id,email", ignoreDuplicates: true });
      if (!error) salvos = unicos.length;
    }

    return json({
      leads: unicos,
      total: unicos.length,
      negocios: places.length,
      com_site: comSite.length,
      salvos,
      query: textQuery,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
