import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { z } from "npm:zod@3.25.76";
import { CatalogError, fetchProductCatalog, listCatalogCategories } from "../_shared/product-catalog.ts";
import { queryCatalogProducts } from "../_shared/catalog-search.ts";

const BodySchema = z.object({
  portfolioId: z.string().uuid(),
  catalogoUrl: z.string().trim().min(1).max(2_000),
  consulta: z.string().max(500).optional(),
  ordenar: z.enum(["relevancia", "menor_preco", "maior_preco"]).optional(),
  pagina: z.number().int().min(1).optional(),
  diagnostico: z.boolean().optional(),
});

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Método não permitido." }, 405);

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return respond({ error: "Informe um link válido da planilha." }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return respond({ error: "Serviço indisponível." }, 500);

    const authorization = req.headers.get("Authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return respond({ error: "Não autenticado." }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !authData.user) return respond({ error: "Não autenticado." }, 401);

    const { data: hasAccess, error: accessError } = await admin.rpc("has_portfolio_access", {
      _user_id: authData.user.id,
      _portfolio_id: parsed.data.portfolioId,
    });
    if (accessError || !hasAccess) return respond({ error: "Você não tem acesso a este cliente." }, 403);

    const products = await fetchProductCatalog(parsed.data.catalogoUrl);
    const search = parsed.data.consulta ? queryCatalogProducts(products, parsed.data) : undefined;
    const sampleIndexes = [...new Set([0, Math.floor(products.length / 2), products.length - 1,
      products.reduce((best, p, i) => p.nome.length + p.especificacoes.length > (products[best]?.nome.length ?? 0) + (products[best]?.especificacoes.length ?? 0) ? i : best, 0),
      products.findIndex((p) => p.estoque.trim() === "0"), products.findIndex((p) => !p.preco.trim()),
    ])].filter((index) => index >= 0);
    const samples = parsed.data.diagnostico ? sampleIndexes.flatMap((index) => {
      const product = products[index];
      return product ? [{ linha: index + 2, produto: product, localizado: queryCatalogProducts(products, { consulta: product.codigo.trim() || product.nome }).produtos.some((p) => JSON.stringify(p) === JSON.stringify(product)) }] : [];
    }) : undefined;
    return respond({ total: products.length, categorias: listCatalogCategories(products), leitura_concluida: true, ultima_leitura_bem_sucedida: new Date().toISOString(), busca: search, amostras: samples });
  } catch (error) {
    if (error instanceof CatalogError) return respond({ error: error.message, code: error.code }, 400);
    console.error("whatsapp-catalog-test error", error);
    return respond({ error: "Não foi possível testar a planilha." }, 500);
  }
});