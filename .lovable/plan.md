# Sub-aba SDR — Prospecção Ativa

## Decisões assumidas (avise se quiser mudar)
- **Fonte da planilha**: upload `.xlsx`/`.csv` + colar link do Google Sheets **público / "qualquer um com link"** (lê via CSV export, sem OAuth). Sem fluxo OAuth por usuário nesta v1.
- **Motor**: edge function `sdr-worker` disparada a cada minuto via `pg_cron`. Cobre disparo inicial, follow-ups de 24h/48h e respeita pausar/retomar.
- **Inbound**: o `whatsapp-webhook` existente reconhece se o telefone pertence a um lead SDR ativo e injeta o system prompt do SDR (com `motivo_contato`) só para aquela conversa — isolamento total.
- **Geração da abertura**: 1 chamada curta ao Lovable AI (Gemini) por lead, retornando bolhas separadas por `|||`, reaproveitando o `splitMessage` + delay de 8s do Prompt 1.
- **Quebra/delay**: reusa o pipeline da Parte 1 (já enviando bolha-a-bolha com 8s entre elas).
- **Instagram**: campo salvo, sem análise nesta v1 (tooltip avisa).

## Estrutura de dados (migração)

Tabelas novas em `public`:

- `sdr_campaigns` — uma campanha por upload.
  - `portfolio_id`, `nome`, `status` (`draft|running|paused|finished`), `rate_per_hour` (int, default 30), `total_leads`, `created_at`, `finished_at`.
- `sdr_leads` — uma linha por número da planilha.
  - `campaign_id`, `portfolio_id`, `telefone` (E.164), `nome` (raw), `nome_resolvido`, `nicho`, `instagram`, `motivo_contato`, `enviado` (bool), `status` (`pendente|enviado|respondeu|reuniao_confirmada|rejeitou|ia_detectada|aguardando_humano|sem_resposta`), `follow_up_count` (0..2), `ultima_mensagem_em`, `primeira_mensagem_em`, `cooldown_ate`, `mensagens_trocadas`.
  - Índices: (`campaign_id`, `status`), (`portfolio_id`, `telefone`).
- Coluna em `whatsapp_conversas`: `sdr_lead_id uuid null` para marcar conversas SDR (badge na aba Conversas).

RLS por `portfolio_id` reusando `has_portfolio_access`. GRANTs para `authenticated` e `service_role`.

## Backend

### Edge function `sdr-upload` (síncrona)
- Recebe linhas já parseadas no client (`{campaignName, ratePerHour, rows[]}`), valida `telefone/nicho/motivo_contato`, normaliza telefone para `+55...`, cria `sdr_campaigns` em `draft` e insere `sdr_leads` em batch.
- Retorna contagem inserida + linhas rejeitadas.

### Edge function `sdr-control`
- Ações: `start`, `pause`, `resume`, `finish`. Atualiza `status` da campanha.
- `finish` libera o export.

### Edge function `sdr-worker` (chamada por cron)
Loop por campanha `running`:
1. Calcula budget = `rate_per_hour / 60` por minuto (mínimo 1).
2. Pega próximos leads `pendente` daquela campanha, dentro do budget.
3. Para cada um:
   - Resolve nome: se `nome` vazio, tenta `/chat/findContacts` da Evolution; fallback `"você"`.
   - Gera abertura com Gemini (prompt curto e barato, retorno `|||`). Contexto contém SOMENTE `{nome, nicho, motivo_contato}` daquele lead.
   - Espera `8–16s` aleatório.
   - Envia via mesma rotina `sendText` (split + 8s entre bolhas) reusada do Prompt 1.
   - Marca `status=enviado`, `enviado=true`, `primeira_mensagem_em=now()`, `ultima_mensagem_em=now()`.
4. Follow-ups: para leads `enviado` sem resposta há ≥24h com `follow_up_count=0` → enviar follow-up leve, incrementar contador. Para `follow_up_count=1` com >48h desde último → enviar fechamento gentil, marcar `sem_resposta`.
5. Respeita `cooldown_ate` (IA detectada → +2h).

Agendamento via `pg_cron`:
```sql
select cron.schedule('sdr-worker-1min', '* * * * *', $$
  select net.http_post(
    url:='<edge>/sdr-worker',
    headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body:='{}'::jsonb
  );
$$);
```
(Inserido via insert tool, não migração — contém chave anon.)

### `whatsapp-webhook` (extensão)
Antes de chamar a IA com o prompt padrão:
1. Procura `sdr_leads` por `telefone = phone` (last 11 dígitos) com status ativo.
2. Se achar:
   - Salva conversa com `sdr_lead_id`.
   - Atualiza `status` do lead (`enviado→respondeu` na primeira resposta), incrementa `mensagens_trocadas`, atualiza `ultima_mensagem_em`.
   - System prompt = base do agente + bloco `[MODO SDR ATIVO]` com `nome/nicho/motivo_contato` **daquele lead apenas**.
   - Detecção simples de gatilhos (regex + heurística no texto da IA): "marcado/agendado/confirma" → `reuniao_confirmada` e dispara `send-report` (Parte 1). "humano/atendente/pessoa" → `aguardando_humano`. "não tenho interesse/não quero/parar" → `rejeitou`. IA detectada (respostas <2s + padrão genérico) → manda mensagem padrão + `cooldown_ate=now()+2h` + `status=ia_detectada`.
3. Se não achar lead SDR → fluxo atual sem mudança.

## Frontend

Nova aba **SDR** em `src/modules/WhatsappAgent/SdrTab.tsx`, registrada em `WhatsappAgent/index.tsx` ao lado de Conversas/Analytics (a aba "Conversas/Analytics" será verificada — só adiciono a SDR sem mexer nas existentes).

Componentes:
- `SdrUpload.tsx`: dropzone (xlsx via `xlsx`, csv via parser próprio) + campo de link do Sheets (resolve para `https://docs.google.com/spreadsheets/d/{id}/export?format=csv&gid=...`). Auto-detecta colunas; se faltar, abre mapper (select por coluna). Preview das 5 primeiras linhas com badges de validação por linha.
- `SdrDashboard.tsx`: cards com os 9 indicadores pedidos, polling a cada 5s via React Query enquanto a campanha estiver `running`/`paused`.
- `SdrControls.tsx`: botões Iniciar/Pausar/Retomar/Encerrar + chip de status + input "máx. disparos por hora".
- `SdrReport.tsx`: botão "Exportar Relatório" (só após `finished`) — gera `.xlsx` no client com `xlsx` (telefone, nome_resolvido, nicho, status, primeira_mensagem_em, mensagens_trocadas, motivo_contato).

Badge "SDR" na lista de conversas: na aba Conversas existente, se a mensagem tiver `sdr_lead_id`, mostrar pill laranja "SDR" (alteração mínima, isolada).

## Pontos técnicos importantes

- **Isolamento de contexto**: o system prompt do SDR é construído por mensagem, lendo o lead pelo telefone — nunca um "lote" de leads no mesmo prompt.
- **Telefone normalizado**: salvo já como dígitos (`5547...`), comparação no webhook por sufixo (últimos 11) para casar com `@s.whatsapp.net` e `@lid`.
- **Não duplicar com agente principal**: enquanto houver `sdr_lead_id` ativo para o telefone, a resposta usa o prompt SDR. Quando a campanha encerra, o telefone volta a ser tratado pelo agente padrão.
- **Pausar**: o worker pula campanhas `paused`. Conversas já iniciadas continuam respondendo normalmente (a pausa só afeta novos disparos e follow-ups).
- **Rate limit**: configurável por campanha (default 30/h). Budget por minuto + jitter 8–16s entre envios garante distribuição.

## Fora do escopo desta v1 (confirmar)
- OAuth Google para Sheets privadas.
- Análise de Instagram (só salva o link).
- Múltiplas campanhas SDR rodando em paralelo no mesmo portfólio (vou permitir só 1 ativa por vez — qualquer outra precisa ser encerrada antes; muito mais simples e seguro).
- Edição de leads depois do upload (re-upload para alterar).

## Ordem de execução
1. Migração (tabelas + coluna em `whatsapp_conversas` + GRANTs + RLS).
2. Edge functions `sdr-upload`, `sdr-control`, `sdr-worker`.
3. Cron job via insert.
4. Patch no `whatsapp-webhook` (lookup SDR + system prompt + detecção de gatilhos + envio de relatório).
5. UI: nova aba + componentes + badge nas conversas.
6. Smoke test com 2 leads fake.

Posso seguir com esse plano?
