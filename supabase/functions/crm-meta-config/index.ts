import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { z } from "https://esm.sh/zod@3.25.76";
import { CRM_META_PAGE_ID } from "../_shared/meta-instant-lead.ts";
import { extractLeadFormIds } from "../_shared/meta-binding-policy.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Input = z.object({ action: z.enum(["accounts", "campaigns", "forms", "save", "remove"]), account_id: z.string().regex(/^act_\d+$/).optional(), campaign_id: z.string().regex(/^\d+$/).optional(), form_id: z.string().regex(/^\d+$/).optional(), binding_id: z.string().uuid().optional() });
type Asset = { id: string; name: string; status?: string; creative?: unknown };

Deno.serve(async req => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const dbUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!dbUrl || !serviceKey) return json({ error: "Configuração indisponível" }, 503);
  const admin = createClient(dbUrl, serviceKey);
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Entre no painel" }, 401);
  const { data: userData, error: authError } = await admin.auth.getUser(auth.slice(7));
  if (authError || !userData.user) return json({ error: "Sessão expirada" }, 401);
  const { data: allowed, error: permissionError } = await admin.rpc("has_permission", { _user_id: userData.user.id, _permission_key: "integrations.manage" });
  if (permissionError || !allowed) return json({ error: "Sem permissão para gerenciar integrações" }, 403);
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Seleção inválida" }, 400);
  const input = parsed.data;
  try {
    if (input.action === "remove") {
      if (!input.binding_id) return json({ error: "Vínculo obrigatório" }, 400);
      const { error } = await admin.from("crm_meta_bindings").update({ enabled: false }).eq("id", input.binding_id);
      if (error) throw new Error("Não foi possível remover o vínculo");
      return json({ ok: true });
    }
    const token = Deno.env.get("META_CRM_ACCESS_TOKEN");
    const connectorKey = Deno.env.get("META_ADS_API_KEY");
    const gatewayKey = Deno.env.get("LOVABLE_API_KEY");
    if (!connectorKey || !gatewayKey) return json({ error: "Vincule a conexão Meta Ads ao sistema" }, 503);
    const graph = async (path: string, fields: string, after?: string) => {
      // The managed ads connection cannot grant leads_retrieval/pages_manage_ads.
      // Form discovery uses the dedicated, app-owned lead credential; no fallback on failures.
      const isFormRead = path === `${CRM_META_PAGE_ID}/leadgen_forms`;
      if (isFormRead && !token) throw new Error("Token de formulários não configurado; a conexão de anúncios não autoriza a leitura de leads");
      const url = new URL(isFormRead ? `https://graph.facebook.com/v26.0/${path}` : `https://connector-gateway.lovable.dev/meta_ads/v26.0/${path}`);
      url.searchParams.set("fields", fields);
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      const headers: Record<string, string> = isFormRead
        ? { Authorization: `Bearer ${token}` }
        : { Authorization: `Bearer ${gatewayKey}`, "X-Connection-Api-Key": connectorKey };
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      if (!response.ok || body.error) {
        // Only the provider error message is exposed, never tokens, paging URLs or payloads.
        const message = typeof body.error?.message === "string" ? body.error.message : "Falha ao consultar o Meta";
        const sanitized = [token, connectorKey, gatewayKey].filter((s): s is string => !!s).reduce((text, value) => text.split(value).join("[credencial]"), message);
        throw new Error(isFormRead ? `Meta — acesso ao formulário: ${sanitized}` : sanitized);
      }
      return body;
    };
    const list = async (path: string, fields: string): Promise<Asset[]> => {
      const results: Asset[] = [];
      let after: string | undefined;
      for (let page = 0; page < 20; page++) {
        const body = await graph(path, fields, after);
        results.push(...(body.data || []));
        if (!body.paging?.next) return results;
        after = body.paging?.cursors?.after;
        if (!after) break;
      }
      throw new Error("Há muitos resultados; não foi possível verificar a lista completa");
    };
    if (input.action === "accounts") {
      const accounts = await list("me/adaccounts", "id,name");
      return json({ items: accounts.map(a => ({ id: a.id, name: a.name })) });
    }
    if (!input.account_id) return json({ error: "Escolha a conta de anúncios" }, 400);
    const campaigns = await list(`${input.account_id}/campaigns`, "id,name,status");
    if (input.action === "campaigns") return json({ items: campaigns.map(c => ({ id: c.id, name: c.name })) });
    const campaign = campaigns.find(c => c.id === input.campaign_id);
    if (!campaign) return json({ error: "Campanha não pertence à conta selecionada" }, 400);
    const ads = await list(`${campaign.id}/ads`, "id,name,creative{object_story_spec,asset_feed_spec}");
    const usedForms = new Set(ads.flatMap(ad => extractLeadFormIds(ad.creative)));
    const forms = (await list(`${CRM_META_PAGE_ID}/leadgen_forms`, "id,name,status")).filter(f => usedForms.has(f.id));
    if (input.action === "forms") return json({ items: forms.map(f => ({ id: f.id, name: f.name })) });
    const form = forms.find(f => f.id === input.form_id);
    if (!form) return json({ error: "Formulário não confirmado nos anúncios desta campanha e página" }, 400);
    const account = await graph(input.account_id, "id,name");
    const { error } = await admin.from("crm_meta_bindings").upsert({ page_id: CRM_META_PAGE_ID, account_id: input.account_id, account_name: account.name, campaign_id: campaign.id, campaign_name: campaign.name, form_id: form.id, form_name: form.name, enabled: true }, { onConflict: "page_id,campaign_id,form_id" });
    if (error) throw new Error("Não foi possível salvar o vínculo");
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Falha na integração Meta" }, 502);
  }
});