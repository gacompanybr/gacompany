
## Objetivo

Criar **1 workflow funcional no n8n do seu PC** que:
1. Busca produtos do Mercado Livre (ofertas / mais vendidos / novidades por categoria).
2. Para cada produto, gera o link de afiliado (`meli.la/...`) usando o cookie + CSRF que acabamos de validar.
3. Grava tudo numa planilha Google Sheets (uma linha por produto, deduplicado por `product_id`).

Sem depender da n8n da VPS. Sem Lovable Cloud nesse fluxo — é um workflow standalone, exportável (JSON) pra você importar no n8n local.

## Fontes de busca (qual API o n8n vai chamar)

O ML não tem endpoint público "mais vendidos do dia". A combinação que funciona bem é:

| Tipo | Endpoint | Observação |
|---|---|---|
| **Ofertas do dia** | `https://api.mercadolibre.com/sites/MLB/search?q=&category=MLB1574&sort=price_asc&condition=new` filtrado por `original_price` (tem desconto) | Pega itens com preço promocional |
| **Mais vendidos por categoria** | `https://api.mercadolibre.com/highlights/MLB/category/{cat}` | Retorna top vendidos oficial do ML |
| **Novidades** | `https://api.mercadolibre.com/sites/MLB/search?category={cat}&sort=date_desc` | Itens recém-publicados |
| **Busca por palavra** | `https://api.mercadolibre.com/sites/MLB/search?q=perfume&sort=sold_quantity_desc` | Mais vendidos pra uma keyword |

Esses endpoints são **públicos, não precisam de cookie/token** pra ler. O cookie/CSRF só entra na hora de transformar o `permalink` em link de afiliado.

## Estrutura do workflow (nodes)

```text
[Schedule Trigger]                  ← roda 1x/dia (ou manual)
        │
[Set: Config]                       ← define categorias, modo, limite por categoria
        │
[Split In Batches: categorias]      ← itera nas categorias configuradas
        │
[HTTP Request: ML highlights]       ← GET /highlights/MLB/category/{cat}
        │
[Code: normaliza]                   ← extrai id, title, price, permalink, thumbnail
        │
[Split In Batches: produtos]
        │
[HTTP Request: createLink ML]       ← POST cookie+CSRF, vira meli.la/...
        │
[IF: deu meli.la?]
   ├─ true  → [Set: monta linha]
   │              │
   │       [Google Sheets: appendOrUpdate]   ← chave = product_id
   │
   └─ false → [Code: log erro] → (continua)
```

## Detalhe dos nodes principais

### 1. Set: Config
JSON com:
```json
{
  "modo": "highlights",
  "categorias": ["MLB1574", "MLB1648", "MLB1051"],
  "limite_por_categoria": 20,
  "ml_cookie": "{{ $env.ML_COOKIE }}",
  "ml_csrf": "{{ $env.ML_CSRF }}",
  "ml_tag": "adrianacarlabuenocavassani"
}
```
(você pode salvar `ML_COOKIE` e `ML_CSRF` como **Credentials** ou variáveis de ambiente no n8n local).

### 2. HTTP Request: highlights
- URL: `https://api.mercadolibre.com/highlights/MLB/category/{{ $json.category }}`
- Method: GET
- Response: JSON.

### 3. Code: normaliza
```js
const out = [];
for (const item of $json.content || []) {
  if (item.type !== "ITEM" || !item.id) continue;
  out.push({
    product_id: item.id,
    title: item.title,
    price: item.price,
    original_price: item.original_price ?? null,
    discount: item.original_price ? Math.round((1 - item.price/item.original_price)*100) : 0,
    permalink: item.permalink,
    thumbnail: item.thumbnail,
    category_id: $json.id,
  });
}
return out.map(json => ({ json }));
```

### 4. HTTP Request: createLink
- URL: `https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink`
- Method: POST
- Headers:
  - `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/141`
  - `Content-Type: application/json`
  - `Origin: https://www.mercadolivre.com.br`
  - `Referer: https://www.mercadolivre.com.br/afiliados/linkbuilder`
  - `x-csrf-token: {{ $('Set: Config').first().json.ml_csrf }}`
  - `Cookie: {{ $('Set: Config').first().json.ml_cookie }}`
- Body (JSON):
```json
{ "urls": ["{{ $json.permalink }}"], "tag": "{{ $('Set: Config').first().json.ml_tag }}" }
```
- Continue on Fail: ON (pra não quebrar o batch inteiro se 1 falhar).

### 5. Google Sheets: appendOrUpdate
- Operation: **Append or Update Row**
- Sheet: aba `Produtos`
- Matching column: `product_id`
- Colunas:
  - `product_id`
  - `title`
  - `price`
  - `original_price`
  - `discount_%`
  - `permalink`
  - `affiliate_link` ← `{{ $json.urls[0].short_url }}`
  - `thumbnail`
  - `category_id`
  - `updated_at` ← `{{ $now }}`

Assim cada execução **atualiza** os produtos que já existem e **adiciona** os novos — sem duplicar.

## Pré-requisitos no n8n do PC

1. **Credential Google Sheets OAuth2** — conectar sua conta Google no n8n (Settings → Credentials → New → Google Sheets OAuth2).
2. **Planilha vazia no Drive** com 1 aba `Produtos` e a linha 1 com os headers acima.
3. **Variáveis de ambiente** (ou hardcoded no node Set): `ML_COOKIE` e `ML_CSRF` que validamos hoje.

## O que eu entrego

Um arquivo **`ml-scraper.json`** pronto pra você importar no n8n (menu **⋯ → Import from File**). Você só:
1. Cria a planilha.
2. Conecta a credential do Google Sheets no node correspondente.
3. Cola cookie/CSRF/tag.
4. Aperta **Execute Workflow**.

## Antes de eu gerar o JSON — me confirma 3 coisas

1. **Quais categorias** começar? Sugestão default: `MLB1574` (Casa, Móveis e Decoração), `MLB1648` (Informática), `MLB1051` (Celulares). Ou me passa um nicho específico.
2. **Modo de busca inicial**: `highlights` (mais vendidos por categoria — meu padrão) ou busca livre por palavra-chave (ex.: "perfume", "tênis")?
3. **Frequência**: roda manual no botão ou agendado (ex.: todo dia 8h)?
