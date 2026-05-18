// Cria credenciais (email+senha) para um cliente acessar o painel
// e vincula automaticamente o acesso ao portfolio informado.
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

    const requesterClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await requesterClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Apenas admins" }, 403);

    const { email, password, portfolio_id } = await req.json();
    if (!email || !password || !portfolio_id) {
      return json({ error: "email, password e portfolio_id são obrigatórios" }, 400);
    }
    if (String(password).length < 8) {
      return json({ error: "Senha deve ter no mínimo 8 caracteres" }, 400);
    }

    // Verifica se já existe usuário com esse email
    let userId: string | null = null;
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = existing?.users?.find((u: any) => u.email?.toLowerCase() === String(email).toLowerCase());

    if (found) {
      userId = found.id;
      // Atualiza senha
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updErr) return json({ error: updErr.message }, 400);
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !created.user) return json({ error: createErr?.message ?? "Falha ao criar" }, 400);
      userId = created.user.id;
    }

    // Garante papel viewer (não promove a admin)
    await admin.from("user_roles").upsert(
      { user_id: userId, role: "viewer" },
      { onConflict: "user_id,role" },
    );

    // Vincula portfolio
    await admin.from("user_portfolio_access").upsert(
      { user_id: userId, portfolio_id },
      { onConflict: "user_id,portfolio_id" },
    );

    return json({ success: true, user_id: userId, updated: !!found });
  } catch (e) {
    console.error("create-client-credentials error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
