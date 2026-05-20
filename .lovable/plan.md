# Robô de Mensagens — Integração total com n8n

## Arquitetura final

```text
Lovable UI (criar robô)
   └─► robo_campanhas (Supabase)  ── campaign_type, marketplace, n8n_workflow_id, n8n_datatable_id...
         └─► edge function `n8n-sync`
               └─► API n8n da VPS  (cria workflow, ativa/pausa, lista data tables)
                        └─► workflow roda no n8n (cron) → lê data table → envia via Evolution → marca sending=true
```

O **n8n é o motor**. Lovable só guarda config + dispara `n8n-sync` em 4 momentos: criar / atualizar / ativar / pausar robô.
`robo-worker` (cron interno) **é removido** — não é mais necessário.

## 1. Migration no Supabase

Adicionar em `robo_campanhas`:
- `campaign_type` text default `'ecommerce'` — `'disparo'` | `'ecommerce'`
- `marketplace` text — `'shopee'` | `'mercadolivre'` | `'amazon'` (só ecommerce)
- `n8n_datatable_id` text — id da data table no n8n
- `n8n_datatable_name` text — ex: `SHOPEE_ADRIANA` (para mostrar na UI)
- `n8n_workflow_id` text — id retornado pelo n8n ao criar workflow
- `planilha_url` text — CSV de contatos (só disparo)
- `scrapper_job_id` uuid — link opcional ao scrapper que alimenta a data table

## 2. Edge function nova: `n8n-sync`

Usa `N8N_API_KEY` (já existe) e nova secret `N8N_BASE_URL` (ex: `https://n8n.gacompany.online/api/v1`).

Actions:
- `list_datatables({ marketplace })` → GET `/data-tables` no n8n, filtra por prefixo (`SHOPEE_`, `ML_`, `AMZ_`) e devolve `[{ id, name }]`
- `upsert_workflow({ roboId })` → lê robô do Supabase, monta JSON do workflow a partir de **template** (ecommerce ou disparo), faz POST/PUT em `/workflows`, salva `n8n_workflow_id`
- `activate_workflow({ workflowId })` → POST `/workflows/:id/activate`
- `deactivate_workflow({ workflowId })` → POST `/workflows/:id/deactivate`
- `delete_workflow({ workflowId })` → DELETE `/workflows/:id`

### Template ecommerce (gerado em código)

Nós:
1. **Cron** — horários/dias do robô (random delay = `intervalo_min`–`intervalo_max`)
2. **n8n Data Table — Get Rows** (`tableId` = `n8n_datatable_id`, filter `sending = false`, limit 1)
3. **If** (achou linha) → continua, senão para
4. **Loop sobre `destinos`** (grupos selecionados, vem como input do workflow via static data)
5. **HTTP Request** → Evolution `/message/sendMedia/{instance}` com:
   - `mediaMessage.media` = `{{ $json.imageUrl }}`
   - `mediaMessage.caption` = template renderizado: nome, preço, desconto, `{{ $json.offerlink }}`
6. **n8n Data Table — Update Row** (`sending = true`)

### Template disparo

Nós:
1. **Cron**
2. **HTTP Request** baixa `planilha_url` (CSV) → split em linhas
3. **Filtra** linhas `enviado = false` (controle no Supabase via tabela `disparo_contatos` já existente)
4. **Evolution** `/message/sendText/{instance}` com mensagem aleatória
5. **HTTP Request** atualiza `disparo_contatos.status='enviado'` via REST do Supabase

## 3. UI — `src/modules/Robo/index.tsx`

Na `RoboDialog`:
- **Radio Tipo de campanha**: Disparo de contatos / Ecommerce em grupos
- **Se ecommerce**:
  - Select Marketplace (Shopee, Mercado Livre, Amazon)
  - Botão "Carregar data tables do n8n" → chama `n8n-sync list_datatables` → select com tabelas filtradas
  - Mantém seleção de grupos (carregar grupos via Evolution, já existe)
  - Template de mensagem com placeholders: `{nome}`, `{preco}`, `{desconto}`, `{link}`, `{loja}`
- **Se disparo**:
  - Upload CSV (telefone, nome, variáveis) → salva em Supabase Storage → grava `planilha_url`
  - Textarea mensagens (já existe)
- **Salvar**: insert/update em `robo_campanhas` → chama `n8n-sync upsert_workflow`
- **Toggle ativo/pausado**: chama `n8n-sync activate/deactivate`
- **Excluir**: chama `n8n-sync delete_workflow` antes do delete do DB

## 4. Remover `robo-worker`

A cron do pg_cron e o worker viram dispensáveis. Mantemos só pra "modo legado", mas a UI nova usa 100% n8n.

## 5. Secret nova

Preciso que você adicione: **`N8N_BASE_URL`** = a URL da API do seu n8n (ex: `https://n8n.gacompany.online/api/v1`). 
A `N8N_API_KEY` já está configurada.

## 6. Onde fazer cada coisa

| Camada | Quem faz |
|---|---|
| Migration `robo_campanhas` | Lovable (eu) |
| Edge function `n8n-sync` | Lovable (eu) |
| UI `RoboDialog` reformada | Lovable (eu) |
| Storage bucket para CSVs de disparo | Lovable (eu) |
| Garantir API do n8n acessível com a key | Você na VPS (apenas confirmar URL) |
| Data tables `SHOPEE_*` já criadas no n8n pelo scrapper | Você / Claude Code (já feito p/ Adriana) |

## Ordem de execução

1. Você me dá a `N8N_BASE_URL` (ex: `https://n8n.gacompany.online/api/v1`).
2. Eu rodo a migration + crio `n8n-sync` + reformo UI + crio bucket de CSVs.
3. Teste: criar robô Shopee da Adriana, escolher data table `SHOPEE_ADRIANA`, ativar → ver workflow aparecer ativo no n8n e disparar.
