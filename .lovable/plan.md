## Objetivo
Adicionar multi-tenancy completo: cada cliente (portfolio) vira um workspace isolado, com painel admin para gerenciar clientes/equipe e controle de acesso granular por usuário.

## 1. Migration Supabase

Nova tabela `user_portfolio_access` (vincula usuários a portfolios) + colunas extras em `portfolios` (cnpj, status, responsavel_id, servicos JSONB).

RLS reescrito em `portfolios`:
- Admin lê/escreve tudo
- Viewer só lê portfolios listados em `user_portfolio_access`
- Remove a policy pública atual

Função SECURITY DEFINER `has_portfolio_access(_user_id, _portfolio_id)` para evitar recursão e reutilizar nas policies de `ad_accounts`, `campaigns`, `campaign_metrics`, `meta_*` (atualmente públicas — vou restringi-las também para respeitar o multi-tenancy, mantendo admin com acesso total).

⚠️ Atenção: hoje várias tabelas têm "Public read". Vou trocar por policies que exigem acesso ao portfolio. Isso pode quebrar leituras anônimas no Dashboard se ele for usado sem login — vou garantir que o Dashboard exige sessão.

## 2. Rotas (src/App.tsx)

Adicionar sem remover nada:
- `/admin` → `Admin.tsx` (guard: só admin)
- `/workspace/:portfolioId` → `Workspace.tsx` (guard: tem acesso ao portfolio)
- `/dashboard` continua funcionando como está

## 3. Hook useAuth.tsx (estender)

- `getUserPortfolios()` → retorna portfolios acessíveis (admin: todos; viewer: via join)
- `hasPortfolioAccess(portfolioId)` → boolean

## 4. Página /admin (src/pages/Admin.tsx)

Layout com `SidebarProvider` shadcn:
- Sidebar: logo + menu (Clientes, Equipe, Configurações) + footer com user/logout
- Conteúdo via Tabs internas

**Aba Clientes**: tabela (Nome, CNPJ, Serviços como badges coloridos, Responsável, Status, Ações), busca por nome, botão "Novo Cliente" (Dialog), clicar na linha abre `/workspace/:id`.

**Aba Equipe**: tabela (Nome/Email, Papel, Clientes vinculados, Cadastro), botão "Convidar usuário" + modal "Gerenciar acessos" por usuário.

**Aba Configurações**: placeholder.

Componentes auxiliares em `src/components/admin/`:
- `ClientesTab.tsx`, `NovoClienteDialog.tsx`
- `EquipeTab.tsx`, `ConvidarUsuarioDialog.tsx`, `GerenciarAcessosDialog.tsx`
- `ServiceBadge.tsx` (badges coloridos por serviço)
- `AdminSidebar.tsx`

## 5. Página /workspace/:portfolioId (src/pages/Workspace.tsx)

- Header: logo + nome do portfolio + breadcrumb "← Todos os clientes" (só visível para admin)
- Sidebar lateral com módulos baseados em `portfolio.servicos`
- Métricas → renderiza Dashboard filtrado pelo portfolioId
- Demais módulos → card placeholder "Em breve"

Componentes em `src/components/workspace/`:
- `WorkspaceSidebar.tsx`
- `ModulePlaceholder.tsx`

## 6. Dashboard.tsx (atualizar)

Aceitar `portfolioId` opcional via prop ou `useParams`. Quando presente, filtrar `useDbPortfolios`/`useMetaPortfolios` para mostrar só esse portfolio. Sem prop = comportamento atual.

## 7. Convite de usuário

Edge function `invite-user` usando `supabase.auth.admin.inviteUserByEmail` (precisa SERVICE_ROLE_KEY, já existe). A function também cria registros em `user_roles` e `user_portfolio_access` conforme seleção.

## 8. Detalhes técnicos

- Badges de serviço: mapa fixo `{meta_ads: "blue", google_ads: "red", whatsapp_agent: "green", crm: "purple", social_media: "orange", criativos: "yellow"}` usando classes Tailwind com tokens semânticos (vou adicionar variantes ao design system se necessário).
- Guards de rota: componentes `RequireAdmin` e `RequirePortfolioAccess` usando `useAuth`.
- Após login, redirecionar admin → `/admin`, viewer → `/workspace/{primeiro-portfolio}`.
- Tipos do Supabase serão regenerados após a migration.

## Ordem de execução

1. Migration (aprovação do usuário)
2. Edge function `invite-user`
3. Estender `useAuth.tsx`
4. Componentes admin + workspace
5. Páginas Admin e Workspace
6. Atualizar Dashboard para aceitar portfolioId
7. Atualizar App.tsx com novas rotas + guards
8. Atualizar redirect pós-login