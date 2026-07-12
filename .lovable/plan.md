## Objetivo

Corrigir 3 workflows n8n (via os builders TS que geram o JSON) e adicionar validação de instância Evolution ao salvar robôs — sem alterar nada fora do escopo listado.

## Arquivos afetados

- `supabase/functions/_shared/robo-template.json` — código JS do nó "Disparar Promo"
- `supabase/functions/_shared/robo-template.ts` — injeta `DEDUPE_VERSION` por robô
- `supabase/functions/_shared/ml-scrapper-template.json` — nós "Code in JavaScript2" e "Subcategorização"
- `supabase/functions/n8n-sync/index.ts` — reset de static-data ao upsert do robô + validação Evolution
- `supabase/functions/evolution-instance/index.ts` — endpoint `connection_state`
- `src/modules/Robo/index.tsx` — indicador 🟢/🔴 em tempo real; aviso (não bloqueia) se instância não estiver `open`

## Correções

### PROBLEMA 1 — Robô Shopee (146/146 bloqueados)

Em `robo-template.json` (nó "Disparar Promo"):

1. Adicionar `const DEDUPE_VERSION = __DEDUPE_VERSION__;` no topo (o `robo-template.ts` substitui esse token por um número inteiro derivado de `robo.updated_at` — muda a cada save/edit).
2. Logo após `const sd = $getWorkflowStaticData("global")`, inserir o bloco de reset:
   ```js
   if (sd._dedupeVersion !== DEDUPE_VERSION) {
     sd._dedupeVersion = DEDUPE_VERSION;
     sd.dedupeDesdeMs = Date.now();
     sd.fails = {};
     sd.lastSentMs = 0;
   }
   const DEDUPE_DESDE_MS = sd.dedupeDesdeMs;
   ```
   (remove o `if (!sd.dedupeDesdeMs) …` atual).
3. Dentro de `escolher()`, remover/comentar `if (await jaFoiEnviado(item)) { dedupeSkips++; continue; }`. Manter `localJaFoiEnviado` (Jaccard) e `registrarEnviado()` só pós-envio confirmado.

Em `robo-template.ts`:
- Adicionar `replaceConst(code, "DEDUPE_VERSION", String(deriveVersion(robo)))` onde `deriveVersion` = timestamp de `robo.updated_at` em segundos (fallback `Date.now()`).

Em `n8n-sync/index.ts` (fluxo `upsert_workflow` do robô):
- Após criar/atualizar o workflow, disparar `DELETE /api/v1/workflows/{id}/static-data` (best-effort, log se falhar). Isso substitui as tentativas POST/PUT com body `{}` que estavam ali.

### PROBLEMA 2 — Scrapper ML (2-4 itens)

Em `ml-scrapper-template.json`, nó "Code in JavaScript2":

1. Substituir `sales: Number(d.sales) || 0` e `rating: Number(d.rating) || 0` pelas funções `parseSalesText`/`parseRatingText` lendo `d.vendas_text || d.vendas_text_alt || d.sales_text` e `d.rating_text || d.avaliacoes_text`.
2. Corrigir `imageURL: d.imagem_produtos` → `imageUrl: d.imagem_produtos`.

No nó "Subcategorização", dentro do loop de produtos, após `if (includesAny(title, EXCLUDE_KEYWORDS)) continue;`:
```js
const MIN_SALES_FINAL  = Number(cfg.min_sales_final  ?? 0);
const MIN_RATING_FINAL = Number(cfg.min_rating_final ?? 0);
if (MIN_RATING_FINAL > 0 && j.rating > 0 && j.rating < MIN_RATING_FINAL) continue;
if (MIN_SALES_FINAL  > 0 && j.sales  > 0 && j.sales  < MIN_SALES_FINAL ) continue;
```

Sobre a Correção 3 pedida (baixar `min_rating_final` do CONFIG ML para 0): esse valor vem do registro do job na tabela `scrapper_jobs` (config do usuário), não do template. Não altero automaticamente — deixo instrução para o usuário ajustar no UI. **Confirmar se deve alterar via SQL para o job `94976051` também.**

### PROBLEMA 3 — Verificar TABLE_ID Shopee

Não é mudança de código; é uma checagem. Vou executar `GET /api/v1/data-tables` no n8n durante o build e reportar se `hj9r6CfIATcBlX91` corresponde a `SHOPEE_SCRAPPER_ADRIANA`. Se divergir, aviso o usuário no chat (sem escrever nada). Se bater, apenas confirmo.

### PROBLEMA 4 — Instância Evolution

Em `evolution-instance/index.ts`:
- Nova action `connection_state`: `GET /instance/connectionState/{instanceName}` → retorna `{ state, ok: state === "open" }`.
- Manter `validate_instance` existente (usada no save).

Em `src/modules/Robo/index.tsx`:
- Ao salvar, chamar `validate_instance`; se `state !== "open"`, apenas mostrar **aviso** (toast amarelo) e prosseguir com o save (hoje bloqueia — mudar para não bloquear, conforme pedido).
- Ao abrir a página / expandir um robô, chamar `connection_state` para cada `instancia_id` e mostrar 🟢 Conectado / 🔴 Desconectado ao lado do campo. Refetch a cada 30s via `setInterval` enquanto a view estiver aberta.

Propagação automática do `INSTANCE` no workflow n8n já acontece hoje: `robo-template.ts` lê `robo.instancia_id` no build e o `n8n-sync` faz PUT do workflow no save. Nada a mudar aí.

## Fora de escopo

- Não alterar `whatsapp-webhook`, SDR, CRM, autenticação, UI de outros módulos.
- Não mexer em `robo_produtos_enviados` (limpeza histórica é responsabilidade do usuário / SQL manual, se quiser).

## Perguntas antes de implementar

1. Devo também rodar SQL para setar `config.min_rating_final = 0` no `scrapper_jobs` do job `94976051` (Correção 3 do Problema 2)? Ou o usuário ajusta pela UI?
