# Diagnóstico de Migração — GA Company (Painel Interno)

> Gerado em 2026-10-28. Este arquivo descreve o que é preciso para mover este projeto
> para outro servidor. Não contém senhas, tokens, chaves privadas nem dados de clientes.

---

## 1. Tipo de projeto e stack

- **Tipo:** sistema interno (painel de operação) com banco de dados, autenticação, funções de servidor e integrações externas. Há também uma landing page dentro do mesmo app (`/` e `/forms`), usada por campanhas de anúncios com Pixel do Meta.
- **Frontend:** React 18 + TypeScript 5 + Vite 5 + Tailwind CSS v3 + shadcn/ui + TanStack Query + React Router.
- **Node:** versão usada no ambiente atual — v22.23.4 (mínimo recomendado: Node 18+).
- **Gerenciador de pacotes:** bun (bun.lock / bun.lockb) — existe também um package-lock.json (npm). Qualquer um funciona.
- **Backend:** Lovable Cloud (Supabase gerenciado) — ver seção "Backend".

## 2. Comandos

```bash
# Instalar
bun install            # ou npm install

# Rodar em desenvolvimento (http://localhost:8080)
bun run dev            # ou npm run dev

# Build de produção (saída em dist/)
bun run build          # ou npm run build

# Lint e testes
bun run lint           # ou npm run lint
bun run test           # ou npm run test (vitest)
```

As funções de servidor (Edge Functions) ficam em `supabase/functions/` e são implantadas
com a CLI do Supabase (`supabase functions deploy <nome>`) — no ambiente atual isso é feito
pela plataforma Lovable.

## 3. Banco de dados

Banco PostgreSQL (Supabase), schema `public`. **Somente contagem de linhas — sem dados.**

| Tabela | Linhas | Tabela | Linhas |
|---|---:|---|---:|
| ad_accounts | 1 | meta_metricas_campanhas | 0 |
| beacons_promocoes | 0 | notification_preferences | 0 |
| campaign_keywords | 0 | notifications | 583 |
| campaign_metrics | 58 | permissions | 13 |
| campaign_search_terms | 0 | portfolio_responsaveis | 37 |
| campaigns | 26 | portfolios | 28 |
| catalog_search_logs | 12 | profiles | 5 |
| cobranca_config | 8 | push_devices | 4 |
| cobranca_envios | 25 | robo_campanhas | 4 |
| crm_interacoes | 3 | robo_produtos_enviados | 5010 |
| crm_leads | 23 | scrapper_jobs | 5 |
| crm_meta_bindings | 1 | scrapper_product_history | 11950 |
| disparo_campanhas | 29 | sdr_campaigns | 19 |
| disparo_contatos | 616 | sdr_leads | 865 |
| email_campanhas | 1 | social_media_integrations | 12 |
| email_destinatarios | 26 | social_posts | 11 |
| email_leads | 26 | sync_logs | 3 |
| financial_categories | 5 | task_assignees | 154 |
| financial_costs | 3 | task_subtasks | 64 |
| financial_receivables | 342 | tasks | 136 |
| financial_service_participants | 28 | team_audit_log | 12 |
| financial_services | 14 | user_job_roles | 6 |
| job_role_permissions | 43 | user_portfolio_access | 34 |
| job_roles | 7 | user_roles | 8 |
| leads_incompletos | 138 | whatsapp_agent_alerts | 0 |
| mercadolivre_integracoes | 1 | whatsapp_agent_followups | 176 |
| meta_campanhas | 0 | whatsapp_agents | 16 |
| meta_integracoes | 0 | whatsapp_connections | 20 |
| meta_logs_integracao | 0 | whatsapp_contact_names | 161 |
| whatsapp_contact_preferences | 4 | whatsapp_conversas | 27327 |
| whatsapp_handoffs | 0 | whatsapp_order_reports | 5 |
| whatsapp_paused_contacts | 1429 | whatsapp_recovery_config | 0 |
| whatsapp_report_dedupe | 109 | whatsapp_sent_messages_log | 4893 |

Extras do banco: tipos enum (`app_role`, `financial_*`, `task_*`), ~25 funções security-definer
(RLS helpers, triggers, claims), ~40 triggers, extensões pg_cron + pg_net, Realtime habilitado
para `crm_leads` e `notifications`, RLS habilitado em todas as tabelas do schema `public`.

## 4. Autenticação

- **Auth padrão do Supabase** (e-mail/senha, convite, sem cadastro anônimo). Gerenciada pelo
  frontend via `@supabase/supabase-js`; perfis em `profiles`, papéis em `user_roles`
  (admin/viewer) e permissões por cargo em `user_job_roles` / `job_role_permissions`.
- **Usuários:** 5.

## 5. Storage

| Bucket | Público | Arquivos |
|---|---|---:|
| disparo-csvs | não | 0 |
| social-media | sim | 27 |

## 6. Edge Functions (39)

Todas em `supabase/functions/<nome>/index.ts`, com módulos compartilhados em
`supabase/functions/_shared/` (agent-gateway, catalog-search, order-report, meta-* etc.).

| Função | O que faz |
|---|---|
| admin-manage-user | Gestão de usuários pelo admin |
| admin-set-password | Admin define senha de outro usuário |
| cobranca-send | Robô de cobrança: envia mensagem de cobrança por cliente (WhatsApp) |
| create-client-credentials | Cria credenciais (e-mail+senha) para cliente acessar o painel e vincula ao portfólio |
| crm-meta-config | Configuração do vínculo Meta → CRM (conta, campanha, formulário); resolve token de Página |
| disparo-worker | Worker das campanhas de disparo em massa (lotes com delays) |
| dup-dispatcher | Chamado pelo workflow n8n quando mensagem cai em duplicidade |
| email-campaign-send | Worker de disparo de e-mails em lotes via Resend |
| email-scraper | Scrapper de e-mails: Google Places → site do negócio → extrai e-mails |
| email-track | Rastreio de e-mails: pixel de abertura 1x1, clique e descadastro |
| evolution-instance | Gerencia instâncias Evolution API (WhatsApp) por portfólio |
| generate-content | Geração de conteúdo (legendas, copies) via gateway de IA |
| invite-user | Convida usuário, define papel e vincula portfólios |
| maps-leads-scraper | Scrapper de leads via Google Maps Places API |
| meta-leads-import | Importação manual de leads da Meta (busca leads do formulário, evita duplicados) |
| meta-leads-webhook | Webhook de leads instantâneos da Meta (leadgen) → insere no CRM |
| meta-oauth-callback | Callback OAuth do Facebook/Meta (troca code por token) |
| meta-test-connection | Diagnóstico de token/conta de anúncios Meta (sem persistir) |
| ml-health-check | Health check do cookie/CSRF do Mercado Livre Afiliados (pg_cron 30 min) |
| ml-oauth-callback | Callback OAuth do Mercado Livre |
| n8n-sync | Cria/ativa/pausa/deleta workflows no n8n para cada robô |
| push-notifications | Notificações push (Firebase Messaging) para novas tarefas, leads etc. |
| robo-worker | Worker do Robô (pg_cron por minuto): mensagens agendadas para grupos WhatsApp |
| scrapper-api | API do scrapper do Mercado Livre (HTML, roda na VPS própria) |
| sdr-control | Ciclo de vida das campanhas SDR (start/pause/resume/finish/delete) |
| sdr-sheet-fetch | Proxy para ler planilhas Google Sheets (CSV via gviz) |
| sdr-upload | Cria campanha SDR a partir de linhas parseadas no cliente |
| sdr-worker | Worker do SDR (pg_cron por minuto): disparo de aberturas e follow-ups |
| social-publish | Publica no Instagram/Facebook (feed, story, reels) |
| social-scheduler | Scheduler de posts sociais (pg_cron por minuto) |
| sync-google-ads | Sincroniza métricas de campanhas do Google Ads (API v18, OAuth refresh token) |
| sync-meta-ads | Sincroniza campanhas + insights diários da Meta Marketing API |
| whatsapp-agent-followup | Cron de follow-up automático do agente de IA (24h/48h e agendados por contato) |
| whatsapp-agent-preview | Preview/teste do agente de IA WhatsApp (gateway de IA) |
| whatsapp-catalog-test | Teste de busca no catálogo de produtos (planilha) |
| whatsapp-connection | Gerencia conexões WhatsApp (Evolution API) por portfólio |
| whatsapp-followup | Cron (15 min): detecta conversas com intenção de agendamento que esfriaram |
| whatsapp-keepalive | Keepalive das instâncias WhatsApp na Evolution (pg_cron 5 min) |
| whatsapp-n8n-sync | Provisiona workflow n8n por agente (Evolution → n8n → IA → Evolution) |
| whatsapp-reply-watchdog | Watchdog de recuperação de respostas do agente (pg_cron por minuto) |
| whatsapp-webhook | Webhook MESSAGES_UPSERT da Evolution; responde 1-a-1 via agente IA |

## 7. Secrets (apenas nomes)

| Nome | Serviço |
|---|---|
| EVOLUTION_API_KEY, EVOLUTION_API_URL, EVOLUTION_N8N_CREDENTIAL_ID | Evolution API (WhatsApp) |
| FIREBASE_MESSAGING_API_KEY, FIREBASE_MESSAGING_APP_ID, FIREBASE_MESSAGING_PROJECT_ID, FIREBASE_MESSAGING_VAPID_KEY, FIREBASE_MESSAGING_WEB_API_KEY | Firebase Messaging (push) — via conector |
| GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID, GOOGLE_ADS_REFRESH_TOKEN | Google Ads API |
| GOOGLE_CLOUD_TTS_API_KEY | Google Cloud Text-to-Speech (áudios do SDR) |
| GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_BROWSER_KEY, GOOGLE_MAPS_TRACKING_ID | Google Maps — via conector |
| LOVABLE_API_KEY | Gateway de IA da Lovable |
| MERCADOLIVRE_APP_ID, MERCADOLIVRE_SECRET | Mercado Livre (API oficial) |
| ML_AFFILIATE_ID, ML_COOKIE, ML_CSRF | Mercado Livre Afiliados (scraping HTML) |
| META_ADS_API_KEY | Meta Ads — via conector |
| META_APP_ID, META_APP_SECRET | Aplicativo Meta (OAuth/Pixel) |
| META_CRM_ACCESS_TOKEN, META_CRM_APP_SECRET, META_CRM_VERIFY_TOKEN | Meta (CRM / formulários instantâneos) |
| N8N_API_KEY, N8N_BASE_URL, N8N_WEBHOOK_URL | n8n |
| RESEND_API_KEY | Resend (e-mail) |
| SCRAPPER_API_SECRET | VPS própria (scrapper Mercado Livre) |
| SUPABASE_ANON_KEY, SUPABASE_DB_URL, SUPABASE_JWKS, SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | Plataforma Supabase/Lovable Cloud |

**Valores de secrets não acessíveis** (gerenciados pela plataforma; alguns por conectores).

## 8. Integrações externas

- **WhatsApp:** Evolution API (instâncias, envio e recebimento de mensagens, áudio TTS do SDR) + n8n (workflows por agente que chamam o gateway de IA).
- **Meta (Facebook/Instagram):** OAuth, sincronização de anúncios, formulários instantâneos de leads (webhook + importação manual), publicação social.
- **Google Ads:** sincronização de campanhas/métricas via OAuth refresh token.
- **Google Maps / Places:** scrapper de leads e e-mails.
- **Google Cloud TTS:** geração de áudio para o SDR.
- **Mercado Livre:** API oficial (OAuth) + scraping HTML de Afiliados rodando 8x/dia numa **VPS própria** (exige cookie de sessão renovado manualmente; para em CAPTCHA).
- **Resend:** envio de e-mails em massa com rastreamento.
- **Firebase Messaging:** notificações push no app móvel.
- **n8n:** orquestração dos agentes WhatsApp (instância externa própria).
- **Google Sheets:** planilhas de catálogo/produtos lidas via endpoint público gviz (CSV).
- **Gateway de IA da Lovable:** SIM — usado por várias funções (whatsapp-webhook, agent-preview, agent-followup, sdr-worker, generate-content, email-scraper, maps-leads-scraper, n8n-sync, push-notifications, whatsapp-followup, whatsapp-n8n-sync, whatsapp-reply-watchdog, crm-meta-config e `_shared/agent-gateway.ts`), no modelo `openai/gpt-6-astra`. Fora da plataforma, precisa ser substituído por outra API de IA.

## 9. Variáveis de ambiente (nomes)

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID
VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID
VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY
VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY
VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY
VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID
```

## 10. Backend e Project ID

- **Tipo de backend:** Lovable Cloud (Supabase gerenciado pela Lovable; uma única instância serve preview e app publicado).
- **Project ID (ref):** `ouarszsnukpjbvsymmts`
- **URL do projeto:** `https://ouarszsnukpjbvsymmts.supabase.co`
- Domínios do app: `gacompany.lovable.app` (publicado), `gacompany.online` / `www.gacompany.online` (domínio próprio).

## 11. Dependências da plataforma Lovable (o que quebraria fora dela)

1. **Edge Functions, Auth, Storage, Realtime, pg_cron e pg_net** — hospedados no Lovable Cloud. Fora, precisam de um projeto Supabase próprio (self-hosted ou cloud) + redeploy das funções + recriar os agendamentos pg_cron (workers por minuto, keepalive 5 min, watchdog, follow-ups, health check 30 min).
2. **Gateway de IA da Lovable** — todas as chamadas de IA apontam para o gateway interno com `LOVABLE_API_KEY`. Sem Lovable, trocar por OpenAI/outro provedor em `_shared/agent-gateway.ts` e nas funções que chamam IA.
3. **`lovable-tagger`** — plugin do Vite usado no build (devDependencies). Pode ser removido fora da Lovable.
4. **Conectores Lovable (`VITE_LOVABLE_CONNECTOR_*`)** — Firebase Messaging e Google Maps injetados pela plataforma. Fora, criar as credenciais diretamente no Firebase/Google Cloud.
5. **URLs de função gravadas no banco** — os triggers `notify_new_crm_lead`, `notify_task_assigned` e `wake_agent_recovery` chamam diretamente `https://ouarszsnukpjbvsymmts.supabase.co/functions/v1/...` (com anon key embutida). Ao migrar, essas URLs precisam ser atualizadas para o novo domínio.
6. **Webhooks externos apontando para o domínio atual** — webhook da Meta (leadgen), webhook da Evolution API e workflows n8n apontam para URLs do projeto atual; reconfigurá-los após a migração.
7. **Workflows n8n** — os workflows criados pelo `n8n-sync`/`whatsapp-n8n-sync` apontam para o gateway de IA da Lovable e para URLs de edge functions; precisam ser regenerados.
8. **Arquivos auto-gerados** — `src/integrations/supabase/client.ts`, `previewAuthStorage.ts`, `types.ts`, `.env` e `supabase/config.toml` são gerados pela plataforma; ao migrar, criá-los manualmente com as credenciais do novo projeto.
9. **Sessão de preview** — `previewAuthStorage.ts` existe só no ambiente de preview da Lovable.
10. **VPS própria do scrapper** — independe da Lovable, mas a API do scrapper usa `SCRAPPER_API_SECRET` e o cookie ML precisa de renovação manual via VNC na VPS.

---

## 12. Valores (variáveis de ambiente visíveis)

Somente variáveis do lado do cliente (publishable — projetadas para estar no navegador).
Todos os valores de secrets do servidor são **valor não acessível**.

```
VITE_SUPABASE_URL = valor não acessível (auto-gerado pela plataforma; ver Seção 10)
VITE_SUPABASE_PUBLISHABLE_KEY = valor não acessível (chave pública do projeto; regenerável no novo backend)
VITE_SUPABASE_PROJECT_ID = valor não acessível (ver Seção 10)
VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID = valor não acessível (injetado pelo conector)
VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID = valor não acessível (injetado pelo conector)
VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY = valor não acessível (injetado pelo conector)
VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY = valor não acessível (injetado pelo conector)
VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY = valor não acessível (injetado pelo conector)
VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID = valor não acessível (injetado pelo conector)
```

> Nota: os valores reais dessas variáveis existem no arquivo `.env` do projeto, mas são
> gerenciados pela plataforma e devem ser regenerados no ambiente de destino (novo projeto
> Supabase + novas credenciais Firebase/Google Maps), não copiados.
