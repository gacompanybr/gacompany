// Helper compartilhado para gerar link de afiliado do Mercado Livre.
// Usa o mesmo endpoint que o workflow do scrapper, mas roda direto no Deno.
// É chamado pelo whatsapp-webhook (modo DUP) para encurtar links que vêm
// de mensagens espelhadas de grupos de origem.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export type AffiliateCreds = {
  cookie: string;
  csrf: string;
  affiliateId: string;
};

export type AffiliateResult =
  | { ok: true; shortUrl: string }
  | { ok: false; error: "INVALID_PERMALINK" | "COOKIE_EXPIRED" | "RETRY_EXHAUSTED" | "MISSING_CREDS"; detail?: unknown };

export function isMercadoLivreUrl(url: string): boolean {
  return /(?:^|\.)mercadolivre\.com\.br|mercadolibre\.com|produto\.mercadolivre|mercadolivre\.com|meli\.la/i.test(url);
}

function htmlDecode(s: string): string {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeMlEscapes(s: string): string {
  return htmlDecode(String(s || ""))
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003D/gi, "=")
    .replace(/\\u003F/gi, "?")
    .replace(/\\u0025/gi, "%")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
}

function unwrapTrackedUrl(u: string): string {
  let s = decodeMlEscapes(String(u || "").trim());
  const paramM = s.match(/[?&](?:url|go)=([^&]+)/i);
  if (paramM) { try { s = decodeURIComponent(paramM[1]); } catch { /* keep */ } }
  const clickM = s.match(/click1\.mercadolivre\.com\.br\/mclics\/[^/]+\/(https?:\/\/[^\s"']+)/i);
  if (clickM) { try { s = decodeURIComponent(clickM[1]); } catch { s = clickM[1]; } }
  return decodeMlEscapes(s);
}

function itemIdFromText(value: string): string | null {
  const decoded = decodeMlEscapes(value);
  const variants = [decoded];
  try { variants.push(decodeURIComponent(decoded)); } catch { /* keep */ }
  for (const text of variants) {
    const m = text.match(/(?:item_id[:=]|item_id%3A|wid=|\/MLB-?|"id"\s*:\s*")(MLB-?\d+)/i);
    if (m) return `MLB${m[1].replace(/\D/g, "")}`;
  }
  return null;
}

function cleanAffiliateInputUrl(u: string): string {
  let s = unwrapTrackedUrl(u);
  if (/^\/\//.test(s)) s = "https:" + s;
  try {
    const url = new URL(s, "https://www.mercadolivre.com.br");
    url.hash = "";
    const itemId = itemIdFromText(url.toString());
    const pdpFilters = url.searchParams.get("pdp_filters") || "";
    url.search = "";
    if (itemId && /item_id\s*:/i.test(pdpFilters)) {
      url.searchParams.set("pdp_filters", `item_id:${itemId}`);
    }
    return url.toString();
  } catch {
    return s.split("#")[0].split("?")[0];
  }
}

function isMlProductUrl(url: string): boolean {
  const s = String(url || "");
  return /\/p\/MLB\d+/i.test(s)
    || /\/up\/MLBU\d+/i.test(s)
    || /produto\.mercadolivre\.com\.br\/MLB-?\d+/i.test(s)
    || /\/MLB-?\d+/i.test(s)
    || !!itemIdFromText(s);
}

function extractProductUrlFromHtml(html: string, baseUrl: string): string | null {
  const raw = String(html || "");
  const featuredStart = raw.indexOf('"id":"card-featured"');
  const featured = featuredStart >= 0 ? raw.slice(featuredStart, featuredStart + 80_000) : raw.slice(0, 120_000);
  const actionRe = /"id"\s*:\s*"show_product"[\s\S]{0,1600}?"url"\s*:\s*"((?:\\.|[^"\\])+)"/gi;
  let a: RegExpExecArray | null;
  while ((a = actionRe.exec(featured))) {
    try {
      const candidate = cleanAffiliateInputUrl(new URL(decodeMlEscapes(a[1]), baseUrl).toString());
      if (isMlProductUrl(candidate)) return candidate;
    } catch { /* keep */ }
  }
  const metaRe = /"metadata"\s*:\s*\{[\s\S]{0,1200}?"id"\s*:\s*"(MLB\d+)"[\s\S]{0,1200}?"url"\s*:\s*"((?:\\.|[^"\\])+)"[\s\S]{0,1200}?"url_params"\s*:\s*"((?:\\.|[^"\\])*)"/i;
  const metaM = featured.match(metaRe);
  if (metaM) {
    const url = decodeMlEscapes(metaM[2]);
    const params = decodeMlEscapes(metaM[3] || `?pdp_filters=item_id:${metaM[1]}`);
    try {
      const candidate = cleanAffiliateInputUrl(new URL(`${url}${params}`, baseUrl).toString());
      if (isMlProductUrl(candidate)) return candidate;
    } catch { /* keep */ }
    return `https://produto.mercadolivre.com.br/${metaM[1].replace(/^MLB/i, "MLB-")}-_JM`;
  }
  const hrefRe = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(raw))) {
    const candidate = cleanAffiliateInputUrl(m[1]);
    if (isMlProductUrl(candidate)) return candidate;
  }
  const productM = raw.match(/product_id["']?\s*[:=]\s*["'](MLB\d+)["']/i);
  if (productM) return `https://www.mercadolivre.com.br/p/${productM[1]}`;
  const refreshM = raw.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+url=([^"'>\s]+)/i);
  if (refreshM) {
    try {
      const candidate = cleanAffiliateInputUrl(new URL(htmlDecode(refreshM[1]), baseUrl).toString());
      if (isMlProductUrl(candidate)) return candidate;
    } catch { /* keep */ }
  }
  const canM = raw.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canM) {
    const candidate = cleanAffiliateInputUrl(canM[1]);
    if (isMlProductUrl(candidate)) return candidate;
  }
  return null;
}

async function itemPermalink(itemId: string | null): Promise<string | null> {
  if (!itemId) return null;
  try {
    const resp = await fetch(`https://api.mercadolibre.com/items/${itemId.replace(/-/g, "")}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const permalink = typeof data?.permalink === "string" ? cleanAffiliateInputUrl(data.permalink) : "";
    return isMlProductUrl(permalink) ? permalink : null;
  } catch {
    return null;
  }
}

async function resolveMlProductUrl(startUrl: string): Promise<string | null> {
  const first = cleanAffiliateInputUrl(startUrl);
  if (isMlProductUrl(first)) return await itemPermalink(itemIdFromText(first)) || first;
  try {
    const resp = await fetch(startUrl, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9" },
    });
    const finalUrl = resp.url || startUrl;
    const html = await resp.text().catch(() => "");
    const product = extractProductUrlFromHtml(html, finalUrl);
    if (product) return await itemPermalink(itemIdFromText(product)) || product;
    const cleaned = cleanAffiliateInputUrl(finalUrl);
    if (isMlProductUrl(cleaned)) return await itemPermalink(itemIdFromText(cleaned)) || cleaned;
  } catch { /* keep */ }
  return null;
}

export async function generateAffiliateLink(
  permalink: string,
  creds: AffiliateCreds,
): Promise<AffiliateResult> {
  const url = String(permalink || "").trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "INVALID_PERMALINK" };
  if (!creds.cookie || !creds.csrf || !creds.affiliateId) {
    return { ok: false, error: "MISSING_CREDS" };
  }

  const productUrl = await resolveMlProductUrl(url);
  if (!productUrl) return { ok: false, error: "INVALID_PERMALINK", detail: { reason: "not_product_url", url } };

  const payload = JSON.stringify({ urls: [productUrl], tag: creds.affiliateId });
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(
        "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink",
        {
          method: "POST",
          headers: {
            "accept": "application/json, text/plain, */*",
            "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "content-type": "application/json",
            "origin": "https://www.mercadolivre.com.br",
            "referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
            "user-agent": UA,
            "cookie": creds.cookie,
            "x-csrf-token": creds.csrf,
          },
          body: payload,
        },
      );
      if (resp.status === 401 || resp.status === 403) {
        return { ok: false, error: "COOKIE_EXPIRED", detail: resp.status };
      }
      const text = await resp.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { /* keep */ }
      const shortUrl =
        (data?.urls?.[0]?.short_url || data?.urls?.[0]?.shortUrl) || data?.short_url || null;
      if (shortUrl && /^https?:\/\/meli\.la\//i.test(String(shortUrl))) {
        return { ok: true, shortUrl: String(shortUrl) };
      }
      lastErr = { status: resp.status, bodyPreview: text.slice(0, 200) };
    } catch (e) {
      lastErr = { exception: e instanceof Error ? e.message : String(e) };
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
  }
  return { ok: false, error: "RETRY_EXHAUSTED", detail: lastErr };
}

// ============================================================================
// Parser de mensagem de oferta vinda de grupo WhatsApp (modo DUP).
// Formato real observado:
//
//   O TIPO DE PERFUME QUE RENDE ELOGIO NO ELEVADOR 🤌🔥
//   ✅ *Perfume Banderas The Icon The Parfum Eau de Parfum 100ml*
//   Por R$ 156,17 🔥
//   🎟️ Use o Cupom: *FUTNAVEIA*
//   🔗 https://meli.la/1utv2EP
//
// Variações esperadas: pode não ter cupom, pode ter "De R$ X por R$ Y",
// pode vir como caption de imagem ou só texto.
// ============================================================================

export type ParsedOffer = {
  productname: string;
  price: number;
  priceoriginal: number;
  pricediscountrate: number;
  shopname: string;
  offerlink: string;
  cupom: string | null;
  imageUrl: string | null;
  raw: string;
};

function parseBrlNumber(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function stripMarkdown(s: string): string {
  return s.replace(/[*_~`]+/g, "").trim();
}

export function parseOfferMessage(rawText: string): ParsedOffer | null {
  const text = String(rawText || "").trim();
  if (!text) return null;

  // Link: obrigatório
  const linkMatch = text.match(/https?:\/\/[^\s)]+/i);
  if (!linkMatch) return null;
  const offerlink = linkMatch[0].replace(/[.,;:!?]+$/, "");

  // Preço atual: "Por R$ 156,17" ou "R$ 156,17"
  let price = 0;
  const porMatch = text.match(/por\s*R\$\s*([\d.]+,\d{2})/i);
  if (porMatch) price = parseBrlNumber(porMatch[1]);
  if (!price) {
    const anyPrice = text.match(/R\$\s*([\d.]+,\d{2})/i);
    if (anyPrice) price = parseBrlNumber(anyPrice[1]);
  }

  // Preço original: "De R$ X" antes do "Por"
  let priceoriginal = 0;
  const deMatch = text.match(/de\s*~?R\$\s*([\d.]+,\d{2})~?/i);
  if (deMatch) priceoriginal = parseBrlNumber(deMatch[1]);
  if (!priceoriginal) priceoriginal = price;

  const pricediscountrate =
    priceoriginal > 0 && price > 0 && priceoriginal > price
      ? Math.round((1 - price / priceoriginal) * 100)
      : 0;

  // Cupom: "Cupom: *CODE*" ou "cupom CODE"
  let cupom: string | null = null;
  const cupomMatch = text.match(/cupom[:\s]+\*?([A-Z0-9_-]{3,30})\*?/i);
  if (cupomMatch) cupom = cupomMatch[1].toUpperCase();

  // Título: primeira linha começando com ✅ *...*; fallback = primeira linha não vazia
  let productname = "";
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^[✅✳️🛒🔥]*\s*\*(.+?)\*\s*$/);
    if (m) { productname = stripMarkdown(m[1]); break; }
  }
  if (!productname) {
    // pega a primeira linha que não é preço/cupom/link/emoji-only
    for (const line of lines) {
      if (/https?:/i.test(line)) continue;
      if (/^R\$/i.test(line) || /^por\s+R\$/i.test(line)) continue;
      if (/cupom/i.test(line)) continue;
      const cleaned = stripMarkdown(line);
      if (cleaned.length >= 8) { productname = cleaned; break; }
    }
  }
  if (!productname) productname = "Oferta";

  return {
    productname: productname.slice(0, 250),
    price,
    priceoriginal,
    pricediscountrate,
    shopname: "",
    offerlink,
    cupom,
    imageUrl: null,
    raw: text,
  };
}
