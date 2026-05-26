// Edge function: admin define senha de outro usuário
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Apenas admins podem alterar senhas" }, 403);

    const body = await req.json().catch(() => ({}));
    const target_user_id: string | undefined = body.target_user_id;
    const target_email: string | undefined = body.target_email;
    const password: string | undefined = body.password;

    if (!password || password.length < 6) {
      return json({ error: "Senha precisa ter no mínimo 6 caracteres" }, 400);
    }

    let userId = target_user_id;
    if (!userId && target_email) {
      // Buscar por email (paginar até encontrar)
      let page = 1;
      while (page < 20 && !userId) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return json({ error: error.message }, 400);
        const found = data.users.find((u) => u.email?.toLowerCase() === target_email.toLowerCase());
        if (found) userId = found.id;
        if (data.users.length < 200) break;
        page++;
      }
    }

    if (!userId) return json({ error: "Usuário não encontrado" }, 404);

    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) return json({ error: updErr.message }, 400);

    return json({ ok: true, user_id: userId });
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro inesperado" }, 500);
  }
});
