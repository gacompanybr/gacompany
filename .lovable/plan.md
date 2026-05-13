## Sistema de Tarefas (estilo ClickUp) no Painel Admin

Criar um módulo "Tarefas" no painel admin com kanban (A fazer / Em andamento / Feitas / Atrasadas), atribuição a múltiplos usuários, prazo (data + hora), e histórico por usuário.

### 1. Banco de dados

**Tabela `tasks`**
- `titulo` (text), `descricao` (text)
- `status` enum: `a_fazer` | `em_andamento` | `feita` (atrasada é derivada: prazo < now() e status != feita)
- `prioridade` enum: `baixa` | `media` | `alta` | `urgente`
- `prazo` (timestamptz, nullable)
- `portfolio_id` (uuid, nullable — opcional vincular a um cliente)
- `created_by` (uuid)
- `completed_at` (timestamptz, nullable)
- `completed_by` (uuid, nullable)

**Tabela `task_assignees`** (N:N usuário ↔ tarefa)
- `task_id`, `user_id`, `created_at`
- unique(task_id, user_id)

**RLS**
- Admins: gerenciam tudo
- Usuários atribuídos: leem e atualizam tarefas onde estão em `task_assignees`
- Criador: lê suas tarefas

### 2. UI no Painel Admin

Nova aba **"Tarefas"** no `AdminSidebar` (grupo "Operação"), antes de Calendário.

**`TarefasTab.tsx`** — visão Kanban com 4 colunas:
- A fazer · Em andamento · Feitas · Atrasadas (filtro derivado)

Cada card mostra: título, prazo (com cor se atrasado), avatares dos responsáveis, prioridade (badge), portfólio (chip opcional).

Ações no card:
- Click → abre `TaskDetailDialog` (editar, comentar status, ver histórico)
- Botão check ✓ → marca como feita (registra `completed_at` + `completed_by`)
- Drag entre colunas opcional (v1: select de status no dialog)

**`NovaTarefaDialog.tsx`**
- Título, descrição, prazo (date + time picker), prioridade, portfólio (opcional), responsáveis (multi-select reusando padrão do `ResponsaveisMultiSelect`)

**Filtros no topo**: "Minhas tarefas" / "Todas" / por usuário / por portfólio.

### 3. Visibilidade no Painel Cliente (viewer)
Fora do escopo desta entrega — o viewer cliente não vê tarefas internas. (Pode ser adicionado depois se quiser.)

### Arquivos
- **Migração SQL**: `tasks`, `task_assignees`, enums, RLS, índices
- **Novos componentes**: `src/components/admin/TarefasTab.tsx`, `NovaTarefaDialog.tsx`, `TaskDetailDialog.tsx`, `TaskCard.tsx`
- **Editados**: `AdminSidebar.tsx` (item novo), `Admin.tsx` (rota da aba), `DashboardTab.tsx` (KPI "Tarefas pendentes/atrasadas" — opcional)

### Detalhes técnicos
- "Atrasada" calculada no frontend: `prazo < new Date() && status !== 'feita'`
- Realtime opcional via canal Supabase em `tasks` para atualizar kanban ao vivo
- Sem drag-and-drop na v1 para entregar rápido; mover via select no card