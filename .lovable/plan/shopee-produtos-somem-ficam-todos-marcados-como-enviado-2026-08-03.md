# Shopee: produtos somem / ficam todos marcados como "enviado"

## O que está acontecendo (confirmado no código e no banco)

O scrapper da Shopee grava tudo certo (`sending = false`). Quem marca os produtos como enviados é o **robô disparador**, a cada execução:

No nó "Disparar Promo" (`_shared/robo-template.json`), quando um produto é barrado pela dedupe, a linha não é apenas ignorada — ela é **queimada** (`sending = true`, `sent_at = "__DEDUPE__:..."`). Isso vale hoje para qualquer plataforma.

Por que só a Shopee sofre: a chave de identidade dos produtos.

- Mercado Livre: a chave é o ID do anúncio (`ml:MLB...`) → só o mesmo anúncio é barrado.
- Shopee: não existe ID extraível (shortlink muda a cada scrap), então a chave é o **título**. Confirmado no banco: todos os 246 registros de histórico do robô "Shopee - Adriana" têm `product_key` do tipo `name:<titulo>`.

Somando as travas que rodam com título:

1. Dedupe local no robô: Jaccard de título ≥ 0.85 contra o histórico da própria data table.
2. Gate persistente (`check_sent_product` em `scrapper-api`): match exato por `name:<titulo>`, match por `name_key` e, além disso, uma varredura difusa de similaridade (Jaccard ≥ 0.8) nos últimos 400 produtos enviados.

Com 246 títulos genéricos no histórico ("tênis feminino na promoção", "carregador portátil 5000mAh"...), quase todo produto novo cai em uma dessas comparações difusas e é queimado. Resultado: você faz o scrap, vê tudo pendente, o robô roda uma vez e a tabela inteira aparece como "enviada" — mesmo sem nada ter sido disparado.

## Correção (só Shopee/não-ML; ML fica idêntico)

1. **Robô (`_shared/robo-template.json`, nó "Disparar Promo")**
   - Para plataformas não-ML: quando a dedupe barrar um produto, **apenas pular** (contando em `dedupe_skipped`), sem gravar `sending = true`. A linha continua pendente e pode ser reavaliada.
   - Para ML: comportamento atual mantido (queima da linha), já que lá o bloqueio é por ID e é confiável.

2. **`scrapper-api` → `check_sent_product`**
   - Quando não há ID de produto (caso Shopee): bloquear somente por identidade forte — `product_key` exato (título exato) e link igual (`offerlink` / `link_compra`).
   - Remover, para esses casos, a varredura difusa de similaridade (Jaccard ≥ 0.8 nos últimos 400) e o lookup extra por `name_key`, que são o que derruba produtos diferentes.
   - Caminho do ML (`ml:MLB...`) permanece exatamente como está hoje.

3. **Reparo da tabela atual da Shopee**
   - Liberar as linhas que foram queimadas indevidamente: as que estão com `sending = true` e `sent_at` começando com `__DEDUPE__:` voltam para `sending = false`, `sent_at = ""`. Feito via uma ação de manutenção no `n8n-sync` (mesmo padrão do `release_reserved_rows`, que hoje só trata `__CLAIM__`).
   - Envios reais (`sent_at` com data ISO) não são tocados.

4. **Re-sincronizar** o workflow do robô da Shopee no n8n para o template corrigido entrar em vigor.

## Efeito prático

- Título exatamente igual e link igual continuam barrados → sem duplicado no grupo.
- Produtos diferentes com títulos parecidos deixam de ser considerados "já enviados" e deixam de ser queimados.
- Mercado Livre: nenhuma mudança de comportamento.

## Fora de escopo

Nada de mudanças em UI, scrapper da Shopee em si, ML, SDR, CRM ou agente WhatsApp.
