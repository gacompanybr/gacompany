# Correção definitiva — preço zerado (ML) + duplicados no grupo

## Diagnóstico (confirmado nos arquivos e no banco)

### 1. Preço null em todos os produtos do Mercado Livre

O caminho do preço no workflow gerado (`ml-scrapper-template.json`) é:

```text
Extrair HTML (parser nordic)  -> preco = "39.69"  (numero puro, sem "R$")
Split Out / Filter / Subcategorização
Parse Preço                   -> calcula price / price_old / discount_pct (numeros OK)
Dedupe / Filter2 / Acumular / HTTP afiliado / Merge
Edit Fields (Set v3)          -> preco_produtos = {{ $json.preco }}   ("39.69")
Code in JavaScript2           -> parsePreco(d.preco_produtos)
                                 regex exige /R\$\s*.../ -> nao casa
                                 price = null, priceoriginal = null
Upsert row(s)                 -> price / priceoriginal / pricediscountrate = null
```

Ou seja: o `Parse Preço` já calcula o preço certo, mas o `Edit Fields` (node Set v3, que só mantém os campos listados) **descarta `price`, `price_old` e `discount_pct`**, e o `Code in JavaScript2` recalcula a partir de uma string numérica sem `R$` — e devolve `null`. O robô então monta a mensagem com preço vazio/zerado.

### 2. Duplicados no grupo (Shopee e também ML)

No nó "Disparar Promo" (`robo-template.json`):

- A trava persistente no banco está **comentada** (linha `// if (await jaFoiEnviado(item)) ...`). Hoje nada consulta `robo_produtos_enviados` antes de enviar.
- A única trava é a local (`localJaFoiEnviado`), que só olha linhas da própria data table com `sending=true` **e** `sent_at >= sd.dedupeDesdeMs` (static data do n8n). Todo re-import/recriação do workflow zera esse baseline → histórico vira vazio → tudo volta a ser enviável.
- Para plataformas não-ML (Shopee) o `produtoSimilar` só bloqueia **link exato**. Shortlink de afiliado muda a cada scrap, então o mesmo produto passa como novo.

Confirmação no banco: em `robo_produtos_enviados` há vários casos do mesmo `productname` enviado 2–3 vezes com `product_key` diferente (ex.: "Calça Alfaiataria Feminina Wide Leg Social Cintura Alta" 3x no robô ML - ADRIANA), provando que a chave por link não segura e que a trava por título não está sendo aplicada em produção.

## Correções

### A. `supabase/functions/_shared/ml-scrapper-template.json`

1. Nó **Edit Fields**: adicionar `options.includeOtherFields = true` (garante que `price`, `price_old`, `discount_pct` cheguem ao próximo nó) e adicionar explicitamente os campos numéricos `price`, `price_old`, `discount_pct`.
2. Nó **Code in JavaScript2**: preço passa a priorizar o que já veio pronto, com o parse de string como fallback:
   ```js
   const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
   const p = parsePreco(d.preco_produtos);           // fallback (string "R$ ...")
   const price         = num(d.price)      ?? p.price;
   const priceOriginal = num(d.price_old)  ?? p.priceOriginal;
   const discount      = num(d.discount_pct) ?? p.discount;
   ```
   Além disso, aceitar número puro dentro de `parsePreco` (se a string não tiver `R$` mas for numérica, usar direto) — assim mesmo que algum campo se perca no meio do fluxo o preço nunca sai null.
3. Trava de qualidade antes do `Upsert`: se `price` continuar null, o item é descartado (log `[CJS2] drop_sem_preco=N`) em vez de gravar linha zerada na data table.

### B. `supabase/functions/_shared/robo-template.json` (nó "Disparar Promo")

1. **Reativar a trava persistente**: descomentar `if (await jaFoiEnviado(item)) { dedupeSkips++; queima a linha; continue; }`, agora queimando a linha com `__DEDUPE__:` (igual à trava local) para não virar zumbi.
2. **Dedupe local não depende mais de static data**: remover o filtro `sent_at >= DEDUPE_DESDE_MS` da montagem do `sentHistory`. A janela de 45 dias passa a valer sempre (static data continua só para intervalo/fails).
3. **Shopee passa a ter trava por título**: em `produtoSimilar`, para plataformas sem id extraível, além do link exato, comparar título normalizado com Jaccard `>= 0.85` (alto o suficiente para não derrubar variações legítimas de tamanho/cor, que têm tokens distintos).

### C. `supabase/functions/scrapper-api/index.ts`

Em `check_sent_product` / `record_sent_product`, incluir uma chave adicional `pn:<titulo normalizado>` no `product_key` gravado e consultado (hoje a chave sai do link, que muda a cada scrap). Assim o match "exact" já pega o mesmo produto re-listado, sem depender da varredura de 400 linhas + similaridade.

### D. Re-sincronização

Após as alterações, disparar `n8n-sync` (`upsert_workflow`) para todos os scrappers ML ativos e todos os robôs ativos, para que os workflows no n8n sejam regravados com os templates corrigidos.

## Fora de escopo

- Não altero UI, SDR, CRM, agente WhatsApp nem outros módulos.
- Não apago linhas com `price` null já existentes nas data tables (posso rodar limpeza se você pedir).

## Pergunta

As linhas já gravadas com `price` null nas data tables do ML devem ser apagadas/queimadas (marcadas como `sending=true`) para não serem disparadas zeradas antes do próximo scrap?
