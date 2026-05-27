## Objetivo

Refazer do zero a geração de affiliate link no workflow ML, usando **apenas** o endpoint interno do ML afiliados (cookie + CSRF), com retry, log e bloqueio do produto se o link falhar. Adicionar painel de status na UI pra ver se o cookie está vivo e atualizar quando vencer.

## Decisão (você confirmou agora)

- Voltamos pro endpoint interno `createLink` (cookie + CSRF) — abandono do template puro que tinha discutido antes.
- Quatro env vars no nível do projeto: `ML_COOKIE`, `ML_CSRF`, `ML_AFFILIATE_ID` (matt_word), `ML_TOOL_ID` (matt_tool).
- `ML_COOKIE` e `ML_CSRF` já existem como secrets. `ML_AFFILIATE_ID` e `ML_TOOL_ID` precisam ser adicionados.
- Sai do `scrapper_jobs.config` o `ml_cookie` e `ml_csrf_token` por job — vira **global do projeto** (uma conta de afiliado para todos os jobs ML).

## Mudanças

### 1. Secrets

Adicionar dois secrets novos via `add_secret`:
- `ML_AFFILIATE_ID` — seu nome de afiliado (ex: `ADRIANA123`), vira `matt_word`.
- `ML_TOOL_ID` — id da campanha (ex: `88344921`), vira `matt_tool`.

Os existentes `ML_COOKIE` e `ML_CSRF` continuam, agora consumidos do ambiente da edge function ao invés do `config` do job.

### 2. `supabase/functions/n8n-sync/index.ts` → `buildScrapperWorkflow`

**Injetar do ambiente** (não mais do `cfg`):
```ts
const mlCookie  = Deno.env.get("ML_COOKIE")        ?? "";
const mlCsrf    = Deno.env.get("ML_CSRF")          ?? "";
const mlAffId   = Deno.env.get("ML_AFFILIATE_ID")  ?? "";
const mlToolId  = Deno.env.get("ML_TOOL_ID")       ?? "";
```
e gravar essas 4 const dentro do `jsCode` (lugar dos `ML_COOKIE`/`ML_CSRF` atuais).

**Substituir** todo o bloco `affiliateLink(...)` (linhas 756-809) por:

```js
async function generateAffiliateLink(permalink) {
  if (!ML_COOKIE || !ML_CSRF || !ML_AFFILIATE_ID) {
    debug.push({ affiliateErr: "MISSING_CREDENTIALS", ts: new Date().toISOString() });
    return null;
  }
  if (!permalink || !/^https?:\/\//i.test(permalink)) {
    debug.push({ affiliateErr: "INVALID_PERMALINK", permalink, ts: new Date().toISOString() });
    return null;
  }

  const body = JSON.stringify({ urls: [permalink], tag: ML_AFFILIATE_ID });
  let lastErr = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await http({
        method: "POST",
        url: "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink",
        headers: {
          "accept": "application/json, text/plain, */*",
          "accept-language": "pt-BR,pt;q=0.9",
          "content-type": "application/json",
          "origin":  "https://www.mercadolivre.com.br",
          "referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
          "user-agent": UA,
          "cookie": ML_COOKIE,
          "x-csrf-token": ML_CSRF,
        },
        body,
        returnFullResponse: true,
        ignoreHttpStatusErrors: true,
      });
      const status = resp.statusCode ?? resp.status ?? 0;
      const raw = resp.body ?? resp;
      const data = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;

      if (status === 401 || status === 403) {
        debug.push({ affiliateErr: "COOKIE_EXPIRED", status, permalink, ts: new Date().toISOString() });
        return null; // sem retry — não adianta
      }

      const shortUrl =
        data?.urls?.[0]?.short_url ||
        data?.urls?.[0]?.shortUrl  ||
        data?.short_url || null;

      if (shortUrl && /^https?:\/\/meli\.la\//i.test(shortUrl)) {
        return shortUrl;
      }
      lastErr = { status, bodyPreview: typeof raw === "string" ? raw.slice(0, 200) : JSON.stringify(raw).slice(0, 200) };
    } catch (e) {
      lastErr = { exception: e?.message || String(e) };
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
  }

  debug.push({ affiliateErr: "RETRY_EXHAUSTED", permalink, lastErr, ts: new Date().toISOString() });
  return null;
}
```

E no call site (linha 888):
```js
const affiliate_link = await generateAffiliateLink(rawLink);
if (!affiliate_link) { skip.affiliate++; continue; }
```

O insert no Data Table grava `offerlink: affiliate_link` (que sempre será `meli.la/...`), preservando schema atual. Adicionalmente, mantém compat de colunas extras (`product_id`, `permalink`, `created_at`) se o Data Table tiver — sem quebrar quem não tem.

### 3. UI Scrapper — remover por-job, mostrar status global

Em `src/modules/Scrapper/index.tsx`:
- Remover os inputs `ml_cookie` / `ml_csrf_token` / `ml_affiliate_tag` do formulário (e do `config`).
- Adicionar um card **"Conta de Afiliado ML (global)"** no topo da aba ML, mostrando:
  - badge **Ativo** / **Expirado** (chamando uma edge function de health check, ver item 4).
  - data da última verificação.
  - botão **Atualizar cookie/CSRF** → abre dialog com 4 inputs (`ML_COOKIE`, `ML_CSRF`, `ML_AFFILIATE_ID`, `ML_TOOL_ID`) e chama `update_secret` via Lovable (na real, abre o painel de secrets — não dá pra escrever secret direto do front; descrição com instruções "Cole o cookie e o CSRF aqui" + ação que dispara `secrets--update_secret` no agente). Alternativa simples: botão que faz `window.open` pro painel de secrets do projeto.
  - lista dos últimos N erros (`COOKIE_EXPIRED`, `RETRY_EXHAUSTED`) lidos de `scrapper_jobs.ultimo_erro` + um novo campo (ver 4).

### 4. Health check + log

Nova edge function **`ml-affiliate-status`** (`verify_jwt = false`, protegida por `Authorization: Bearer SCRAPPER_API_SECRET`):
- `GET /ml-affiliate-status?action=ping` → tenta um `createLink` com um permalink fixo (`https://www.mercadolivre.com.br/`) usando `ML_COOKIE`/`ML_CSRF` do ambiente. Retorna `{ ok: bool, status: number, checked_at: ISO }`.
- `GET /ml-affiliate-status?action=recent_errors&limit=20` → lê uma nova tabela `ml_affiliate_logs` (ver migration).

Migration:
```sql
CREATE TABLE public.ml_affiliate_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  kind text NOT NULL,           -- COOKIE_EXPIRED | RETRY_EXHAUSTED | INVALID_PERMALINK | OK
  permalink text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ml_affiliate_logs TO authenticated;
GRANT ALL    ON public.ml_affiliate_logs TO service_role;
ALTER TABLE public.ml_affiliate_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ml_affiliate_logs"
  ON public.ml_affiliate_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));
```

O workflow do n8n, sempre que `generateAffiliateLink` retornar `null`, faz um POST extra em `scrapper-api?action=ml_affiliate_log` com `{ kind, permalink, detail }`. Adiciono essa action ao `scrapper-api/index.ts`.

### 5. Limpeza

- Remover toda referência a `cfg.ml_cookie` / `cfg.ml_csrf_token` em `n8n-sync` e na UI.
- Manter `ml_affiliate_tag` no `config` apenas se você quiser sobrescrever por job (default = `ML_AFFILIATE_ID` global). Posso manter ou tirar — diz qual.

## Fluxo final

```text
Cron n8n
  └─► API oficial /sites/MLB/search (OAuth via mercadolivre_integracoes)
        └─► { id, title, price, permalink, thumbnail }
              └─► generateAffiliateLink(permalink)
                    │  POST createLink (cookie+CSRF)  ─ retry 3x / 2s
                    ├─► 401/403 → log COOKIE_EXPIRED, retorna null
                    ├─► meli.la/xxxxx → upsert Data Table
                    └─► null → skip + log + NÃO posta
```

## Riscos

- Cookie do ML expira sozinho (sessão web). Você vai ter que atualizar `ML_COOKIE`/`ML_CSRF` periodicamente — o painel mostra quando vencer.
- O endpoint `createLink` é interno e pode mudar a qualquer momento sem aviso.
- Se você ativar 2FA na conta de afiliado, o cookie passa a ter vida ainda mais curta.

## Confirme antes de eu codar

1. **OK adicionar os secrets `ML_AFFILIATE_ID` e `ML_TOOL_ID`?** (`ML_TOOL_ID` na real só vai pro log, porque o `createLink` interno gera `meli.la/...` que já carrega o matt_tool dele — me confirma se ainda quer guardar mesmo assim.)
2. **Conta de afiliado é única para todos os jobs** (global), certo? Ou alguns clientes têm conta de afiliado própria e precisa continuar por-job?
3. **Criar a tabela `ml_affiliate_logs`** ou deixa só nos `debug` que já voltam no response do workflow?