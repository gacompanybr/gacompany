# Reorganização de Painéis e Acessos

## Objetivo
Separar a landing page institucional dos painéis logados, criar rotas específicas (`/painel` para clientes, `/paineladmin` para administração), permitir múltiplos responsáveis por cliente e profissionalizar a experiência admin (calendário, sidebar reformulada, fluxo de convite por papel).

## 1. Rotas e acesso

Estado atual:
- `/` = landing
- `/auth` = login/cadastro (qualquer um cai aqui e o sistema decide pra onde ir)
- `/admin`, `/workspace/:portfolioId`, `/dashboard`

Estado novo:
```text
/                         -> Landing pública (sem mudança visual)
/painel                   -> Login + Cadastro de CLIENTES (viewers)
/painel/app               -> Área logada do cliente (workspace)
/paineladmin              -> Login da EQUIPE (sem aba "Criar conta")
/paineladmin/app          -> Painel administrativo
```

Regras:
- `/painel` mostra Login + "Criar minha conta" (signup aberto). Após login, se o usuário for admin, redireciona pra `/paineladmin/app`; se for viewer com portfolios, vai pra `/painel/app` (lista de empresas que ele acessa); se não tem portfolio, mostra tela "Aguardando vínculo do gestor".
- `/paineladmin` mostra APENAS Login (sem aba criar conta). Se a pessoa logar e não for admin, mostra erro "Conta sem permissão administrativa" e desloga.
- `/auth` antigo redireciona pra `/painel` (compatibilidade).
- `/admin` redireciona pra `/paineladmin/app`. `/workspace/:id` continua existindo internamente, acessado a partir de `/painel/app`.

## 2. Múltiplos responsáveis por cliente

Hoje `portfolios.responsavel_id` aceita só um UUID. Vamos manter a coluna (compatibilidade) mas tratar o "responsável principal" como opcional e usar uma nova tabela N:N para os responsáveis adicionais — o que de fato dá poder de acesso continua sendo `user_portfolio_access`.

Mudanças de banco:
- Nova tabela `portfolio_responsaveis (portfolio_id, user_id, papel text default 'gestor', created_at)` com unique (portfolio_id, user_id) e RLS: admins gerenciam; usuário lê suas próprias linhas.
- Trigger ao inserir em `portfolio_responsaveis`: garantir entrada equivalente em `user_portfolio_access` (acesso automático).
- Trigger ao remover: remover acesso correspondente, **exceto** se houver outro vínculo manual.

UI (NovoClienteDialog e EditarClienteDialog):
- Substituir o seletor único de "Responsável" por um **multi-select de usuários** (busca por email/display_name em `profiles`).
- Mostrar chips com cada responsável e botão X.
- Tabela de Clientes: coluna "Responsáveis" passa a mostrar avatares/contagem com tooltip listando todos.

## 3. Convite de usuário por papel

A edge function `invite-user` já recebe `role`. Ajustes:
- No diálogo "Convidar usuário": deixar claro o destino do papel.
  - `viewer` -> "Cliente — vai logar em /painel e ver as métricas dos clientes vinculados"
  - `admin` -> "Equipe interna — vai logar em /paineladmin"
- Quando convidar admin: campo "Clientes vinculados" fica oculto (admin já enxerga tudo).
- Quando convidar viewer: vinculação de portfolios é obrigatória (mínimo 1) — toast de erro se vazio.
- Edge function: validar que admins não recebem `user_portfolio_access` desnecessário; viewer sem portfolios retorna 400.
- E-mail de convite: passar `redirectTo` distinto:
  - admin -> `/paineladmin`
  - viewer -> `/painel`

## 4. Painel admin mais profissional

Sidebar (`AdminSidebar.tsx`) ganha:
- Grupo "Visão geral" -> **Dashboard** (novo, resumo: nº clientes ativos, MRR via `financial_services`, recebimentos do mês, próximos vencimentos, leads novos do CRM).
- Grupo "Operação" -> Clientes, Equipe, **Calendário** (novo), Financeiro.
- Grupo "Sistema" -> Configurações, Logs de sincronização (link pra `sync_logs` / `meta_logs_integracao`).

Calendário (nova aba):
- Componente único usando `react-day-picker` (já instalado via shadcn `calendar`) em modo mês.
- Eventos agregados de:
  - `financial_receivables.data_prevista` (cor laranja — recebimentos)
  - `social_posts.data_agendada` (cor azul — posts agendados)
  - `crm_leads` com follow-up (se houver coluna; por ora só status "agendado")
- Lateral direita: lista do dia selecionado + botão "Novo evento" (abre dialog que cria recebível avulso ou post).

Outros polimentos:
- Header com breadcrumb + busca global (cmd+k) listando clientes/usuários.
- Cards padronizados (mesmo radius, sombra suave já existe no design system).
- Manter paleta preta + #FEA60F.

## 5. Painel do cliente (`/painel/app`)

- Se o usuário tem 1 portfolio: redireciona direto pro workspace dele.
- Se tem N: tela de seleção (cards com logo + nome do cliente).
- Workspace mantém os módulos existentes; só mudamos o caminho de entrada.

## 6. Detalhes técnicos

Arquivos novos:
- `src/pages/PainelAuth.tsx` (login + cadastro de cliente)
- `src/pages/PainelAdminAuth.tsx` (apenas login, valida admin)
- `src/pages/PainelHome.tsx` (seleção / redirect viewer)
- `src/components/admin/DashboardTab.tsx`
- `src/components/admin/CalendarioTab.tsx`
- `src/components/admin/ResponsaveisMultiSelect.tsx`

Arquivos editados:
- `src/App.tsx` — novas rotas, redirects das antigas.
- `src/hooks/useAuth.tsx` — helpers `redirectAfterLogin(target: 'cliente'|'admin')`.
- `src/components/RequireAdmin.tsx` e `RequirePortfolioAccess.tsx` — atualizar fallbacks pros novos paths.
- `src/components/admin/AdminSidebar.tsx` — nova estrutura de grupos.
- `src/components/admin/NovoClienteDialog.tsx` + `EditarClienteDialog.tsx` — multi responsáveis.
- `src/components/admin/ConvidarUsuarioDialog.tsx` — ajustes de UX por papel.
- `supabase/functions/invite-user/index.ts` — redirect por papel + validação.
- Migração SQL: criar `portfolio_responsaveis` + RLS + trigger de sincronização com `user_portfolio_access`.

Sem mudanças visuais na landing page.

## Checklist de validação
- [ ] Acessar `/` mostra só a landing pública.
- [ ] `/painel` permite cadastro; `/paineladmin` não.
- [ ] Conta nova criada em `/painel` cai em `/painel/app` após confirmar email.
- [ ] Convite como admin chega com link pro `/paineladmin`.
- [ ] Cliente com 2 responsáveis aparece pra ambos no `/painel/app`.
- [ ] Sidebar admin mostra Dashboard, Calendário, etc.
- [ ] Calendário lista recebíveis e posts do mês corrente.
