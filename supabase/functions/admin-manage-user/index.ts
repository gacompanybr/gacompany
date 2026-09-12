import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), user_id: z.string().uuid(), display_name: z.string().trim().min(1).max(120), is_admin: z.boolean(), job_role_id: z.string().uuid().nullable() }),
  z.object({ action: z.literal("delete"), user_id: z.string().uuid() }),
]);

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return respond({ error: "Serviço indisponível" }, 500);

    const requester = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: authData, error: authError } = await requester.auth.getUser();
    if (authError || !authData.user) return respond({ error: "Não autenticado" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: adminRole } = await admin.from("user_roles").select("role").eq("user_id", authData.user.id).eq("role", "admin").maybeSingle();
    if (!adminRole) return respond({ error: "Apenas administradores podem gerenciar a equipe" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return respond({ error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors }, 400);
    const input = parsed.data;
    if (input.user_id === authData.user.id && (input.action === "delete" || !input.is_admin)) {
      return respond({ error: "Você não pode remover seu próprio acesso administrativo" }, 400);
    }

    const [{ data: actor }, { data: target }] = await Promise.all([
      admin.from("profiles").select("display_name").eq("user_id", authData.user.id).maybeSingle(),
      admin.from("profiles").select("display_name").eq("user_id", input.user_id).maybeSingle(),
    ]);

    if (input.action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(input.user_id);
      if (error) return respond({ error: error.message }, 400);
      await admin.from("team_audit_log").insert({ actor_id: authData.user.id, actor_name: actor?.display_name, target_user_id: input.user_id, target_name: target?.display_name, action: "user_deleted" });
      return respond({ ok: true });
    }

    const { error: profileError } = await admin.from("profiles").update({ display_name: input.display_name }).eq("user_id", input.user_id);
    if (profileError) return respond({ error: profileError.message }, 400);

    if (input.is_admin) {
      await admin.from("user_roles").upsert({ user_id: input.user_id, role: "admin" }, { onConflict: "user_id,role" });
    } else {
      await admin.from("user_roles").delete().eq("user_id", input.user_id).eq("role", "admin");
    }

    if (input.job_role_id) {
      await admin.from("user_job_roles").upsert({ user_id: input.user_id, job_role_id: input.job_role_id, assigned_by: authData.user.id }, { onConflict: "user_id" });
    } else {
      await admin.from("user_job_roles").delete().eq("user_id", input.user_id);
    }

    await admin.from("team_audit_log").insert({
      actor_id: authData.user.id,
      actor_name: actor?.display_name,
      target_user_id: input.user_id,
      target_name: input.display_name,
      action: "user_updated",
      details: { is_admin: input.is_admin, job_role_id: input.job_role_id },
    });
    return respond({ ok: true });
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});