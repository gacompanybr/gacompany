import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
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
    const samples = parsed.data.diagnostico ? [0, Math.floor(products.length / 2), products.length - 1].flatMap((index) => {
      const product = products[index];
      return product ? [{ linha: index + 2, produto: product, localizado_por_codigo: queryCatalogProducts(products, { consulta: product.codigo }).produtos.some((p) => p.codigo === product.codigo) }] : [];
    }) : undefined;
    return respond({ total: products.length, categorias: listCatalogCategories(products), leitura_concluida: true, ultima_leitura_bem_sucedida: new Date().toISOString(), busca: search, amostras: samples });
  } catch (error) {
    if (error instanceof CatalogError) return respond({ error: error.message, code: error.code }, 400);
    console.error("whatsapp-catalog-test error", error);
    return respond({ error: "Não foi possível testar a planilha." }, 500);
  }
});