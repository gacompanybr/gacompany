// Scrapper de leads via Google Maps Places API (New) — gateway Lovable.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GMAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY")!;

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "nextPageToken",
].join(",");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY || !GMAPS_KEY) {
      return json({ error: "Google Maps connector não configurado" }, 500);
    }
    const { nicho, cidade, limite } = await req.json();
    if (!nicho || !cidade) return json({ error: "informe nicho e cidade" }, 400);
    const max = Math.min(Math.max(Number(limite) || 20, 1), 60);

    const textQuery = `${nicho} em ${cidade}`;
    const leads: any[] = [];
    let pageToken: string | undefined;
    let safety = 0;

    while (leads.length < max && safety < 4) {
      safety++;
      const body: any = {
        textQuery,
        languageCode: "pt-BR",
        regionCode: "BR",
        pageSize: Math.min(20, max - leads.length),
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
      const data = await res.json();
      if (!res.ok) {
        return json({ error: data?.error?.message || `gateway ${res.status}`, raw: data }, 500);
      }
      for (const p of data.places ?? []) {
        leads.push({
          nome: p.displayName?.text ?? "",
          categoria: p.primaryTypeDisplayName?.text ?? "",
          endereco: p.formattedAddress ?? "",
          telefone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? "",
          website: p.websiteUri ?? "",
          avaliacao: p.rating ?? null,
          total_avaliacoes: p.userRatingCount ?? null,
          status: p.businessStatus ?? "",
          maps_url: p.googleMapsUri ?? "",
          place_id: p.id ?? "",
        });
        if (leads.length >= max) break;
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
      // pageToken precisa de delay curto pra ficar válido
      await new Promise((r) => setTimeout(r, 1500));
    }

    return json({ leads, total: leads.length, query: textQuery });
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
