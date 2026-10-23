// Page-scoped endpoints require a Page token, not the dedicated system-user token.
export async function resolveMetaPageToken(pageId: string, credential: string, request: typeof fetch = fetch): Promise<string> {
  const url = new URL(`https://graph.facebook.com/v26.0/${pageId}`);
  url.searchParams.set("fields", "id,access_token");
  const response = await request(url, {
    headers: { Authorization: `Bearer ${credential}` },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    const message = typeof body.error?.message === "string" ? body.error.message : "Não foi possível obter a autorização da Página";
    throw new Error(`Meta — autorização da Página: ${message.split(credential).join("[credencial]")}`);
  }
  if (body.id !== pageId || typeof body.access_token !== "string" || !body.access_token.trim()) {
    throw new Error("Meta — a credencial dedicada não disponibilizou um token da Página; confira o acesso do usuário de sistema à Página e as permissões de formulários no aplicativo Meta");
  }
  return body.access_token;
}