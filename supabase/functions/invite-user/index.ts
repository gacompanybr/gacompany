// Edge function: convidar usuário, definir papel e vincular portfolios
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Cliente que valida o JWT do solicitante
    const requesterClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await requesterClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Não autenticado" }, 401);
    }

    // Verificar se é admin
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Apenas admins podem convidar usuários" }, 403);

    const body = await req.json();
    const email: string = body.email;
    const role: "admin" | "viewer" = body.role ?? "viewer";
    const portfolioIds: string[] = body.portfolio_ids ?? [];

    if (!email) return json({ error: "Email obrigatório" }, 400);

    // Convidar
    const redirectTo = `${new URL(req.url).origin.replace(
      "supabase.co",
      "lovable.app",
    )}/auth`;
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (invErr || !invited.user) {
      return json({ error: invErr?.message ?? "Falha ao convidar" }, 400);
    }
    const newUserId = invited.user.id;

    // Garantir papel correto (handle_new_user já cria 'viewer' por padrão se trigger existir;
    // aqui forçamos o papel pedido)
    if (role === "admin") {
      await admin.from("user_roles").upsert(
        { user_id: newUserId, role: "admin" },
        { onConflict: "user_id,role" },
      );
    }

    // Vincular portfolios
    if (portfolioIds.length > 0) {
      const rows = portfolioIds.map((pid) => ({
        user_id: newUserId,
        portfolio_id: pid,
      }));
      await admin.from("user_portfolio_access").upsert(rows, {
        onConflict: "user_id,portfolio_id",
      });
    }

    return json({ success: true, user_id: newUserId });
  } catch (e) {
    console.error("invite-user error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
