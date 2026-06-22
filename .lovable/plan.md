## DUP — Duplicar ofertas do grupo de origem (sem IA, sem re-scraping)

### Arquitetura
- **Não** é polling/cron. O gatilho é o webhook da Evolution que já chega em tempo real para `whatsapp-webhook`.
- O job DUP vive na tabela `scrapper_jobs` (já existe), categoria `outros`, plataforma `dup`. Reaproveita schema atual.

### Onde mexer

**1. `supabase/functions/n8n-sync/index.ts` — refatorar (não duplicar)**
- Extrair `generateAffiliateLink(permalink, { cookie, csrf, affiliateId })` de dentro de `buildScrapperWorkflow()` para uma função exportável (mesmo arquivo ou novo `supabase/functions/_shared/ml-affiliate.ts` se conveniente).
- Também extrair o helper de insert na data table do n8n, se houver lógica reutilizável, para o webhook chamar com o mesmo formato de colunas (`productname`, `price`, `priceoriginal`, `pricediscountrate`, `shopname`, `offerlink`, `imageUrl`).

**2. `supabase/functions/whatsapp-webhook/index.ts` — adicionar exceção de grupo**
- Logo após detectar `remoteJid.endsWith("@g.us")` (linha ~250), antes do `continue`, fazer um lookup leve:
  ```
  select id, ml_*, n8n_datatable_id from scrapper_jobs
   where status = 'active' and plataforma = 'dup'
     and grupo_origem_jid = <remoteJid>
  ```
- Cache em memória (Map com TTL ~60s) para não bater no banco em toda mensagem de grupo.
- Se bater: chamar `processDupMessage(msg, job)` e **`return`** sem nunca enviar nada de volta àquele grupo.
- Se não bater: comportamento atual (ignora).

**3. Novo módulo `processDupMessage(msg, job)`**
- Extrai do payload da Evolution: texto/caption + URL da imagem (se for `imageMessage`).
- Parser de oferta: título, preço atual, preço original, % desconto, cupom, link do produto. **(parser depende do formato exato — preciso da amostra)**
- Se o link for `mercadolivre.com.br` / `mercadolibre` / `produto.mercadolivre`: chama `generateAffiliateLink` reutilizada. Senão: usa o link original.
- Insert na data table do n8n no mesmo formato dos outros jobs.
- Nunca grava o link bruto; sempre o link com a tag de afiliado quando aplicável.

### Migration
Adicionar a `scrapper_jobs`:
- `grupo_origem_jid text null` — JID do grupo (ex.: `120363xxx@g.us`).
- Não mudar `plataforma` (continua text livre, "dup" é só um valor convencionado).

Índice parcial para o lookup ser barato:
```
create index scrapper_jobs_dup_lookup
  on scrapper_jobs (grupo_origem_jid)
  where status = 'active' and plataforma = 'dup';
```

### Frontend — `src/modules/Scrapper/`
- No formulário de "Outros", quando o usuário digita/seleciona `dup` em plataforma, mostrar:
  - Botão **Carregar grupos** → chama `evolution-instance` action `groups` (já existe) e popula um `<Select>` único de **Grupo de origem** (salva o JID em `grupo_origem_jid`).
  - Reutilizar os componentes de credenciais ML (Affiliate ID / Cookie / CSRF) que já aparecem nos jobs ML.
  - Reutilizar o campo de data table de destino.
- Sem campos de termos/categorias para `dup`.

### Garantias
- O agente **nunca** envia mensagem para o grupo de origem (caminho de envio fica em outro branch que nem é alcançado).
- Distribuição para meus grupos próprios continua pelo robô de e-commerce existente, lendo da mesma data table.
- Polling/cron do scrapper segue funcionando para os outros tipos sem mudança.

### Funções novas vs reutilizadas
| Função | Status |
|---|---|
| `generateAffiliateLink` | **reaproveitar** (extrair de `n8n-sync`) |
| Insert na data table n8n | **reaproveitar** |
| `evolution-instance` action `groups` | **reaproveitar** (já existe) |
| Lookup DUP no webhook | **novo** (com cache) |
| Parser de mensagem de oferta | **novo — depende da amostra real** |
| UI seletor de grupo + campos DUP | **novo** |
| Migration `grupo_origem_jid` + índice | **novo** |

### Antes de eu codar
Preciso de **1 ou 2 mensagens reais** do grupo de origem (print + texto cru copiado), com:
- O formato exato do título/preço/cupom/link.
- Se vem como `imageMessage` com `caption` ou só texto.
- Variações que apareçam (com cupom, sem cupom, com preço original/de-por, só preço único).

Sem isso, o parser vira chute. Quando você me passar, eu sigo direto pra implementação.
